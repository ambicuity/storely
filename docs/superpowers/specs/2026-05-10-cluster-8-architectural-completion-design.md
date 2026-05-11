# Cluster 8 — Architectural Completion Design

**Branch:** `benchmark-supremacy`
**Date:** 2026-05-10
**Audit reference:** `docs/audits/2026-05-09-production-readiness-audit.md`
**Predecessor clusters:** 1–7 (all landed)
**Scope:** strictly architectural — no GA-readiness expansion

## Summary

Clusters 1–7 closed every Critical finding from the 2026-05-09 production-readiness audit. A clean-slate re-read of the monorepo (three parallel deep audits across core+serialization, all 11 storage adapters, and cross-cutting concerns) found no Critical residuals and no regressions. What remains is a long tail of Important and Minor items: undocumented semantic gaps, type lies, missing input validation, unbatched iterator paths, an encryption wire format with no forward-compatibility path, and supply-chain polish in CI/build hygiene.

Cluster 8 bundles all verified residuals into a single PR. Each change is small (≤30 LOC), independent, and lands in a different file, so review friction is the same whether bundled or split.

## Goals

1. Close every Important residual that doesn't require a behavior break.
2. Add forward-compatibility scaffolding to ciphertext so future key/algorithm changes don't strand existing data.
3. Surface architectural assumptions that are currently implicit (undefined-vs-missing semantics, stats getter mutability, compression buffering, iterator namespace honouring).
4. Harden the CI supply chain to make the release pipeline trustworthy beyond first-party code.

## Non-goals

- CHANGELOG strategy (root or per-package).
- Semver / breaking-change policy docs.
- Observability / metrics framework.
- Restoring perf-signal infrastructure after the benchmark removal (`9e32f1f`).
- Bumping monorepo from `6.0.0-alpha.4` to stable.

These can become Cluster 9 once Cluster 8 lands.

## Design

### Core / serialization

**1. Document `storely.get()` undefined-vs-missing semantic.**
`get(k)` returns `undefined` both when key is absent AND when `set(k, undefined)` was called. The fast-path branch (lines 408-425) and the slow-path branch (lines 436-462) both collapse the distinction. Use `has(k)` when the distinction matters.

Change: extend JSDoc on the public `get` overload signatures. No code change.

**2. Add explicit snapshot methods to `StorelyStats`.**
The existing live-map getters (`hitKeys`, `missKeys`, etc.) are a deliberate Cluster 7 performance choice — documented inline. Don't revert that. Add opt-in safe accessors: `snapshotHitKeys()`, `snapshotMissKeys()`, `snapshotSetKeys()`, `snapshotDeleteKeys()`, `snapshotErrorKeys()`. Each returns `new Map(this.hitKeysMap)` etc. Callers who need safety pay the allocation; callers in hot paths keep the live-map zero-cost getter.

**3. Fix the memory adapter iterator type-lie.**
`memory.ts:394` yields `[keyWithoutPrefix, entry?.value]` where the second slot is raw envelope data, but the iterator signature declares `Awaited<Value>`. Two valid fixes:
- (a) yield `decode(raw)` and keep the typed signature
- (b) change the signature to reflect that values are raw envelopes

Use (a). It matches the contract callers already rely on (every call site `decode`s the result). The decode call is async and we're already in an async generator.

Wait — re-reading `memory.ts`, this adapter doesn't have a `decode` helper. The value stored is already the raw `entry.value` envelope (a `MemoryEntry`'s `.value` field, which is itself the user's value, since the memory adapter does no serialization). So the **type is wrong, not the runtime behavior**. The signature should be `Array<string | Awaited<Value> | undefined>` but `entry.value` here IS the awaited Value — there's no wrapper at this layer.

Closer look: `MemoryEntry` stores `{ value: T, expires?: number }`. So `entry.value` is `T`. The type assertion is correct; the audit caught a non-issue. **Verify on read** — if signature actually matches, drop this item. Otherwise narrow the cast.

Cluster 8 outcome: read carefully, and either correct the type or drop the item from scope.

**4. Honour the `namespace` parameter in `BridgeAdapter.iterator`.**
Currently `iterator(): AsyncGenerator<...>` with no parameter at line 413. The audit said the signature accepts `namespace` — re-verification shows it doesn't. The actual bug is different: line 425 calls `this._store.iterator?.(this._namespace)` — passing the bridge's own namespace through. This is fine if the underlying store honours the argument; the memory adapter ignores arguments and filters by its own `_namespace`. The bridge's `clear()` does the right thing by filtering after the fact (line 396-401).

Action: align `BridgeAdapter.iterator<Value>()` to accept an optional `namespace` parameter for parity with `clear(namespace)`. Default to `this._namespace`. Update `clear()` to call `this.iterator(this._namespace)` so prefix filtering lives in one place. Slightly DRYer; no behavior change for current callers.

**5. Concurrency tests in `core/test-suite`.**
Add an opt-in `concurrency` block:
- **set-then-get fan-out:** 100 distinct keys set concurrently, then read concurrently. Expect every read to return its written value.
- **set-and-delete interleaving:** for a single key, fire `set(k, v)` and `delete(k)` concurrently 50 times. Expect either the value or undefined — but no thrown error and no inconsistent state (a follow-up `has(k)` and `get(k)` must agree).
- **setMany racing clear:** start `setMany([100 keys])` and `clear()` simultaneously; expect no thrown errors. Final state may have any subset; check that the store remains usable (a follow-up `set`/`get` round-trip succeeds).

Tests opt in via `runConcurrencyTests: true` in the existing suite config. Adapters with known race issues can defer enabling without blocking the cluster.

### Adapter polish

**6. Postgres pool validation.**
In `set pool(value)` (around `storage/postgres/src/index.ts:776`), reject:
- `max <= 0` — pool with zero connections can never service a query.
- `connectionTimeoutMillis < 0` — invalid.
- `idleTimeoutMillis < 0` — invalid.

Throw `RangeError("StorelyPostgres pool.<field>: <reason>")`. Documented in JSDoc. Validate at set time, not at first query, so misconfiguration surfaces immediately.

**7. Etcd batched iterator.**
Replace `getAll().prefix(prefix).keys()` + per-key `get()` with a single `getAll().prefix(prefix)` that returns the full kv map in one request. Iterate the map locally, apply the same TTL-expired check and per-key delete behaviour. Memory footprint is `O(prefix size × value size)` for the duration of the iterator — acceptable for typical cache iterators, with a documented caveat to use namespacing to bound the cost.

### Encryption forward-compat

**8. Wire format versioning via magic prefix.**

Current wire format (both `encrypt-node` and `encrypt-web`):
```
AEAD:     [IV || AuthTag (16 bytes) || Ciphertext]
non-AEAD: [IV || Ciphertext]
```

Problem: there is no way to identify the format. A future change (different IV length, different cipher, different framing) silently breaks all existing data.

Fix: add a 4-byte ASCII magic prefix `STv0` on writes. The full new envelope is `[ "STv0" (4 bytes) || IV || AuthTag (if AEAD) || Ciphertext ]`. Magic is chosen to be:
- Distinguishable from random IVs (collision probability 1/2^32, vs 1/256 for a single byte).
- Human-recognisable in hex/base64 dumps.
- Forward-extensible — future versions use `STv1`, `STv2`, etc.

On decryption: check the first 4 bytes:
- If they match `STv0`, strip them and parse as v0 (identical structure to legacy after the prefix).
- If they don't match, treat as legacy (no prefix). Documented as a transitional behaviour.

Migration plan (documented in JSDoc): in a future release (say `6.1.0`), make the prefix mandatory — refuse to decrypt without it. By that point all live data written by this version will have it.

Implementation:
- `encrypt-node`: prepend `Buffer.from("STv0", "ascii")` in `encrypt()`; check in `decrypt()` and dispatch.
- `encrypt-web`: prepend the same 4 bytes (`new Uint8Array([0x53, 0x54, 0x76, 0x30])`) in `encrypt()`; check in `decrypt()`.

Cross-compatibility is preserved: both packages share the same wire format and prefix.

**9. PBKDF2 default → 600,000 iterations.**

Both packages currently default to 100,000. OWASP's 2024 Password Storage Cheat Sheet specifies a minimum of 600,000 for PBKDF2-SHA256.

Action: bump `DEFAULT_PBKDF2_ITERATIONS` to `600_000` in both packages. Add JSDoc note explaining the 2024 guidance and the migration path (existing salts derived at 100k are still callable via explicit `iterations: 100_000` — derived keys are stored as raw bytes, not the salt's iteration count, so the caller must remember which iteration count produced which key).

### Compression polish

**10. Brotli default quality 4.**

`compression/compress-brotli/src/index.ts`: when constructing the compress options, default `params[zlib.constants.BROTLI_PARAM_QUALITY]` to `4` if the user hasn't specified it. Quality 4 is the conventional cache/store tradeoff (≈3-5× faster than 11 with mostly equivalent ratios on typical small payloads).

**11. README "Limitations" sections.**

Add a one-paragraph note in each of `compression/compress-{gzip,brotli,lz4}/README.md`:
> **Limitations:** This adapter buffers entire values in memory. There is no streaming API. For values larger than ~10 MB, consider chunking at the application layer or storing the data outside Storely and caching a reference.

**12. `compress-lz4` engines bump.**

`compression/compress-lz4/package.json`: change `engines.node` from `">= 18"` to `">= 20"` to match root.

### CI / repo hygiene

**13. Pin GitHub Actions to commit SHAs.**

`.github/workflows/ci.yml` currently uses mutable `@v4` tags for `actions/checkout`, `pnpm/action-setup`, and `actions/setup-node` (15 occurrences). Pin each to a specific SHA. Use the current latest stable SHA for each action.

Add `.github/dependabot.yml` configured to auto-bump GitHub Actions weekly with `package-ecosystem: github-actions`, so SHA pins stay current without manual review:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

**14. Website build in CI.**

Add a new `website-build` job to `ci.yml` that runs `pnpm --filter website build`. Use the same setup steps as the existing build job. Make it required by the existing `publish` gate. Cheap sanity check that website assets compile.

**15. Split root `clean` script.**

Current: `"clean": "rimraf node_modules pnpm-lock.yaml && pnpm recursive run clean"` — wipes the lockfile silently.

Replace with:
- `"clean": "rimraf node_modules && pnpm recursive run clean"` — preserves the lockfile.
- `"clean:lockfile": "rimraf pnpm-lock.yaml"` — explicit destructive op for the rare case it's wanted.
- `"clean:all": "pnpm clean && pnpm clean:lockfile"` — convenience for full reset.

## Critical files

| Concern | File | Lines |
|---|---|---|
| `get()` JSDoc | `core/storely/src/storely.ts` | 388-393 |
| Stats snapshots | `core/storely/src/stats.ts` | new methods after 147 |
| Memory iterator types | `core/storely/src/adapters/memory.ts` | 365-395 |
| Bridge iterator | `core/storely/src/adapters/bridge.ts` | 387-440 |
| Concurrency tests | `core/test-suite/src/index.ts` (or new file) | append |
| Postgres pool validation | `storage/postgres/src/index.ts` | 770-790 |
| Etcd iterator | `storage/etcd/src/index.ts` | 458-486 |
| Encryption envelope (node) | `encryption/encrypt-node/src/index.ts` | 158-217 |
| Encryption envelope (web) | `encryption/encrypt-web/src/index.ts` | 224-282 |
| Brotli quality default | `compression/compress-brotli/src/index.ts` | constructor |
| Compression READMEs | `compression/compress-{gzip,brotli,lz4}/README.md` | append |
| LZ4 engines | `compression/compress-lz4/package.json` | engines block |
| Actions pin + dependabot | `.github/workflows/ci.yml`, `.github/dependabot.yml` (new) | 15 lines + new |
| Website CI job | `.github/workflows/ci.yml` | new job |
| Clean scripts | `package.json` (root) | scripts block |

## Reused utilities

- `unwrapValue`/expiry pattern (etcd, line 470) — reuse for batched iterator.
- Existing `decode`/`unwrapValue` per-adapter conventions for memory iterator alignment.
- Existing `_namespace` plumbing in bridge adapter — extend, don't replace.
- Existing `deriveKey` in both encryption packages — version byte is a layer above KDF.

## Verification

- `pnpm -r exec tsc --noEmit` — type check across all packages.
- `pnpm -r --workspace-concurrency 1 test:ci` — full test suite, including the new concurrency block exercised by every adapter that opts in.
- `pnpm audit --prod` — confirm no new CVEs introduced.
- `pnpm --filter website build` — confirm new CI job runs locally.
- Encryption: `pnpm --filter @storely/encrypt-node test`, `pnpm --filter @storely/encrypt-web test`. Verify:
  - New writes carry `STv0` magic (check the base64 output).
  - Old (no-magic) ciphertext still decrypts.
  - Cross-package decrypt (node-encoded → web-decoded and vice versa) round-trips with the magic.
  - PBKDF2 with explicit `iterations: 100_000` produces the same key as before this change (backward-compat).
- Postgres smoke: `new StorelyPostgres({ url, pool: { max: 0 } })` throws `RangeError`.
- Etcd smoke: put 500 keys via etcdctl, iterate via the adapter, observe one ranged request in the etcd log instead of N gets.
- Lint: `biome check` clean.

## Out of scope

See "Non-goals" above. Anything not listed in this design stays for Cluster 9 or later.

## Risk

Low. Largest behavioral changes:
- Encryption magic prefix increases ciphertext size by 4 bytes. Migration is handled by legacy-fallback on decrypt.
- PBKDF2 iterations change is opt-in for existing callers (they passed an explicit `iterations` arg) — new callers paying the cost is the intended outcome.
- Brotli default quality drop from 11→4 changes compressed size for users who relied on the implicit default. Document in README.
- Stats snapshot methods are additive — no breaking change.

All other items are pure additions, validation guards, or doc updates with no runtime impact on existing callers.
