# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Starting with `1.0.0`, releases are generated from [Changesets](https://github.com/changesets/changesets) entries in `.changeset/`. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the contributor workflow.

## 1.0.0 — 2026-05-11

Initial stable release. The `@storely/*` suite is now production-ready across the seven supported storage adapters (redis, postgres, mysql, mongo, sqlite, valkey, rocksdb). Encryption, compression, serialization, observability, and operability stories are all first-party.

### Highlights

- **Stable API surface** — see [`docs/API_STABILITY.md`](./docs/API_STABILITY.md) for the tiered surface (Stable / Stable-deprecated / Experimental / Internal) and [`docs/DEPRECATION_POLICY.md`](./docs/DEPRECATION_POLICY.md) for the support contract.
- **Operator runbook** — [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) plus per-adapter operations docs under `docs/adapters/`.
- **Release pipeline gated** — the publish job depends on lint, typecheck, build, test, and website-build. A bad tag cannot ship.
- **Private security disclosure** — `SECURITY.md` directs reporters to GitHub's Private Security Advisory flow.

### Core

- `Storely` class with hooks (`StorelyHookTypes`), events (`StorelyEvents`), and stats (`StorelyStats`).
- `setMany` reports per-entry success / failure instead of collapsing to all-false on a single bad entry.
- `BigMap.set()` returns `this` so chaining routes writes to the correct shard.
- `throwOnEmptyListeners` defaults to `false`; internal error events no longer crash consumers without an `on("error")` handler.
- `get()` documents the `undefined`-value vs missing-key semantic gap on the public overloads — use `has()` when the distinction matters.
- `StorelyStats` exposes both zero-allocation live-map getters (`hitKeys` etc.) and defensive `snapshot*Keys()` accessors.

### Storage adapters (production-supported)

- **`@storely/redis`** — `commandTimeout` wired through all four batch methods; `set(k, v, 0)` correctly means "no expiry"; `getKeyWithoutPrefix` uses `slice()` (no first-occurrence-replace bug).
- **`@storely/postgres`** — per-instance pool with config-time validation (`max <= 0` and negative timeouts throw `RangeError`); `deleteMany` chunked at 1000 keys; iterator default 500 rows per batch.
- **`@storely/mysql`** — per-instance pool with `await endPool` on disconnect; event-scheduler cleanup event named per-table to avoid cross-instance collision.
- **`@storely/mongo`** — `initConnection` rejects on connection failure (no more deadlocks); `countDocuments` instead of deprecated `count()`.
- **`@storely/sqlite`** — WAL opt-in option; multi-driver detection (better-sqlite3 / sqlite3 / node:sqlite); parameter chunking on `deleteMany`. Concurrency test suite passes.
- **`@storely/valkey`** — cursor-based `SCAN` in `clear()`; pipelined `UNLINK` in `deleteMany` chunks of 1000.
- **`@storely/rocksdb`** — iterator no longer silently truncates at 100 (limit is opt-in); `parseValue` handles plain `Uint8Array` correctly.

### Encryption — `@storely/encrypt-node` / `@storely/encrypt-web`

- New `deriveKey()` PBKDF2 helpers for password-derived keys (default 600,000 iterations matching OWASP 2024).
- AEAD detection hardened with an explicit ChaCha20-Poly1305 allowlist (no false-positives on Node's loose `"stream"` mode label).
- Ciphertext wire format carries a 4-byte `STv0` magic prefix for forward compatibility; legacy no-magic ciphertexts still decrypt for migration.
- AES-CBC docs explicitly warn that it does not verify integrity. Prefer AES-GCM.

### Compression

- **`@storely/compress-gzip`** ships real gzip (RFC 1952 headers/trailer). Interop-safe with `Content-Encoding: gzip`, S3, nginx, gunzip.
- **`@storely/compress-brotli`** defaults to quality 4 (cache-storage tradeoff). Override via `compressOptions.params`.
- **`@storely/compress-lz4`** at Node `>= 20`.
- Per-package READMEs note that all three buffer values in memory; no streaming API.

### Observability — `@storely/otel`

New first-party OpenTelemetry adapter. Duck-typed to the OTel API (peer dep only):

```ts
import { instrumentWithOtel } from "@storely/otel";
instrumentWithOtel(storely, { meter, tracer, namespace: "myapp" });
```

Emits counters for hit / miss / set / delete / error, histograms for get and set durations, and spans wrapping `get` / `set` / `delete` hook lifecycles. Disposable for clean shutdown.

### Operability

- `docs/RUNBOOK.md` covers health-checking, tuning, common failure modes, CVE response, and backups.
- Per-adapter `docs/adapters/<adapter>-operations.md` for the seven production adapters with SLOs, tuning, failure modes, and known limitations.
- Lightweight perf-regression gate (`scripts/perf-baseline.ts` + `.github/workflows/perf-gate.yml`) catches order-of-magnitude regressions without competitive-benchmark noise. 25% threshold; label-gated on PRs, mandatory on `main`.
- Chaos test framework (`storage-chaos.ts`, opt-in via `chaos: true`) verifies timeouts return, batch ops don't hang, and stores remain usable after failure windows.

### Experimental adapters (not production-supported)

- **`@storely/keydb`** — Redis-protocol compatible; production hardening in flight.
- **`@storely/memcache`** — permanent experimental for the `1.x` line. Underlying `memcache@1.x` client unmaintained since 2013; migration to a maintained client (likely `memjs`) is post-`1.0.0` work.
- **`@storely/etcd`** — iterator and lease lifecycle are recent; not yet load-tested.
- **`@storely/dynamo`** — pagination and TTL semantics corrected, but not yet load-tested.

### Supply chain

- `tar` pinned `>= 7.5.9` via `pnpm.overrides` to clear the GHSA-* CVEs that flowed through `sqlite3`.
- GitHub Actions pinned to commit SHAs with version-tag comments. `.github/dependabot.yml` auto-bumps weekly.
- `pnpm-workspace.yaml` enforces `minimumReleaseAge: 2880` (2 days).

### Migration

This is the initial `1.0.0` release. Consumers coming from any pre-release version of `@storely/*` should re-install at `1.0.0` and refer to [`docs/API_STABILITY.md`](./docs/API_STABILITY.md) for the supported surface.
