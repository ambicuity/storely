# Storely performance architecture redesign

## Context

The competitive benchmark suite added in `benchmarks/` measured storely against keyv and cache-manager across all six shared backends (memory, redis, sqlite, mysql, postgres, mongo) on CRUD + batch operations at 32 B / 1 KB / 64 KB value sizes, in both as-shipped-defaults and JSON-normalized modes. The baseline result is committed at `benchmarks/results/merged-2026-05-08T00-28-17-160Z.json`.

Three perf cliffs stand out in that baseline:

| Cell | Storely | Keyv | Ratio | Root cause (file:line) |
|---|---|---|---|---|
| Memory `get`, 64 KB, defaults | 40 k ops/s | 3.2 M ops/s | **80× slower** | `core/storely/src/storely.ts:386,394,1048` — full JSON.parse on every get even when the store is a `Map<>` that could hold the raw object |
| Redis `set`, 1 KB, defaults | 2.7 k ops/s | 46 k ops/s | **17× slower** | `core/storely/src/storely.ts:588,606,614,621` — `prepare()` recursion + JSON.stringify + double hook fire (BEFORE_SET + deprecated PRE_SET alias) + telemetry emit per call |
| `has`, defaults vs JSON | mid | best in JSON | — | Hooks + telemetry on every call; the JSON-mode improvement comes from skipping the encode/decode pipeline |

The unifying problem: storely's serialization, hook-fire, and telemetry pipelines run **unconditionally** on every operation. Keyv made all three pay-as-you-go. We're at 6.0.0-alpha.4, so internal breaking changes are acceptable.

## Goals

- Close ≥80% of the perf gap on every cell where storely currently loses to keyv.
- Preserve cells where storely already wins (Postgres `setMany` 5–10× ahead of keyv, `has` in JSON mode, etc.).
- Public API for users (the `Storely` class surface) unchanged.
- Adapter contract: documented internal breaking change — storage adapters declare a new capability and may move serialization into their own boundary.
- The benchmark suite becomes the per-PR regression gate.

## Non-goals

- Removing hooks from the constructor.
- Removing the `{value, expires}` envelope from the public type surface.
- Refactoring features unrelated to the hot path (sanitization, encryption pipeline, key/namespace handling).
- Beating keyv on cells where the difference is dominated by a clear architectural choice keyv made (e.g. dropping the envelope entirely).

## Architecture: four pillars

### Pillar 1 — Move the serialization boundary

**Today:** `Storely.set()` always calls `this.encode()` (which routes through the JSON serializer's `prepare()` recursion + `JSON.stringify`). `Storely.get()` always calls `this.decode()` (recursive `JSON.parse` + reviver). For a `Map`-backed in-memory store, this means stringify-on-set and parse-on-get for values that could have been stored as JS objects.

**Change:**
- Add `acceptsStructured: boolean` to `StorelyStorageCapability` in `core/storely/src/capabilities.ts` and to the `StorelyStorageAdapter` interface in `core/storely/src/types/adapters.ts`.
- `StorelyMemoryAdapter` (`core/storely/src/adapters/memory.ts`) and `BigMap` (`core/bigmap/src/index.ts`) declare `acceptsStructured = true`.
- Byte-store adapters (`@storely/redis`, `@storely/sqlite`, `@storely/mysql`, `@storely/postgres`, `@storely/mongo`) declare `acceptsStructured = false`. They serialize at their own boundary in the same module that handles the wire protocol — one `JSON.stringify` on the way in, one `JSON.parse` on the way out, no method-call layering.
- In `Storely.set()` / `Storely.get()` / `Storely.setMany()` / `Storely.getMany()`, branch on `this._store.acceptsStructured`. When true, store `{ value, expires }` as a plain object — no encode, no decode. When false, call the existing encode/decode path (or, if Pillar 1b is shipped together, defer to the adapter).
- The `{ value, expires }` envelope **stays** as a public type — it's just that for structured stores it lives as a runtime object, not a string.

**Closes:** the 80× memory-`get`-on-64-KB cliff. Also reduces a constant factor on byte-store paths because the stringify happens in the adapter's natural code path rather than being re-marshalled across two layers.

### Pillar 2 — Hooks pay-as-you-go

**Today:** `hookWithDeprecated(name, ...)` is called twice per write op (once for the canonical hook, once to fire the deprecated alias). It allocates a context object even when no listeners are subscribed and looks up the deprecated-alias map unconditionally.

**Change:**
- In `Storely`, maintain a `Map<string, number>` of listener counts, kept in sync with `on`/`off` (`hookified` already exposes the events; we wrap subscribe/unsubscribe to bump the counter).
- At the top of every `hookWithDeprecated` call site, check `if (this.#hookListenerCount.get(name) === 0 && this.#hookListenerCount.get(deprecatedName) === 0) return;`. Skip the entire allocation + dispatch path.
- Drop the deprecated-alias firing entirely when the alias has zero listeners.
- This is a wrapper around `hookified`, not a fork. The wrapper lives in a new file `core/storely/src/hooks-fastpath.ts` (kept separate so it's easy to test in isolation and easy to remove if `hookified` upstream gains the same fast-path).

**Closes:** ~30–50% of the residual gap on cheap ops (`has`, single-key `get`/`set` on memory). Negligible effect on network-bound ops where the hook µs is dwarfed by RTT.

### Pillar 3 — Telemetry zero-cost when off

**Today:** `emitTelemetry()` runs unconditionally; the `if (!stats.enabled)` check happens inside, after the event object has been allocated.

**Change:**
- Move the enabled-check to the *call site* via a tiny inline helper (or just an `if` guard around each `this.emitTelemetry(...)` invocation in `Storely.set/get/has/delete/...`).
- Default remains `stats: false` — users who haven't opted in pay zero allocations and zero method calls per op.

**Closes:** a small constant (~50–200 ns) per op. Combined with Pillar 2, the per-op overhead on cheap paths approaches keyv's.

### Pillar 4 — Byte-store adapters: single-command writes

**Today:** The 17× Redis-`set` gap can't be explained by serialization alone — there is additional cost on the wire. The adapter audit will find it. Common shapes to look for: separate `SET` + `EXPIRE` against Redis, separate `INSERT` + `UPDATE expires_at` against SQL, namespace lookup queries that could be inlined.

**Change:**
- Audit `storage/redis/src/index.ts`'s `set()`, `setMany()`. Use `SET key value EX <s>` (or `PX` for ms) in one round-trip. Use `MSET` + per-key TTL where supported, or a pipelined batch where it isn't.
- Audit `storage/sqlite/src/index.ts`, `storage/mysql/src/index.ts`, `storage/postgres/src/index.ts`, `storage/mongo/src/index.ts` for the same shape: every `set` should be one round-trip; every `setMany` should be one batch round-trip.
- For `@storely/mysql` specifically, the `value` column type is `TEXT` (64 KB cap) per `storage/mysql/src/index.ts:245`. The benchmark surfaced this as a real data-integrity issue (storely silently rejects 64 KB values that `@keyv/mysql` accepts). Change the column to `MEDIUMTEXT` (16 MB cap) as part of this pillar. Document the migration step.

**Closes:** the residual portion of the Redis 20× gap that isn't already eliminated by Pillars 1+2. Fixes the MySQL 64 KB regression as a side effect.

## Implementation order

Ship in **four PRs**, each independently testable and measurable. Each PR's description must include a delta table generated by the new `compare` utility (Pillar 5 below).

| # | PR title | Cells affected (for targeted bench) | Expected delta |
|---|---|---|---|
| 1 | `storely - perf: skip serialization for structured stores` (Pillar 1) | All `memory/*` cells; byte-store cells improve only modestly | memory `get`/`set` ≥10× lift on 1 KB+; ≥50× on 64 KB |
| 2 | `storely - perf: zero-cost hooks when no listeners` (Pillar 2) | All cells, biggest on memory ops | memory cheap-path ≥1.5× lift; byte-store cells flat ±5% |
| 3 | `storely - perf: telemetry zero-cost when stats off` (Pillar 3) | All cells, small constant lift | every cell ~5–15% faster |
| 4 | `redis,mysql,postgres,sqlite,mongo - perf: single-command writes + MySQL MEDIUMTEXT` (Pillar 4) | byte-store `set`, `setMany`, `delete`, `deleteMany` | redis `set` ≥10× lift; SQL `setMany` parity-or-better |

Order rationale: Pillar 1 is biggest single bang. Pillars 2 and 3 then drop the residual per-op overhead so Pillar 4's wire-level optimizations show up cleanly without being masked. MySQL MEDIUMTEXT is bundled into Pillar 4 because it's an adapter-internal data-integrity fix that lives in the same file changing for the wire-command audit.

## Validation: targeted regression gate

The benchmark suite already supports `--backend=<name>[,name...]`, `--suite=crud|batch|all`, `--mode=defaults|json|both`. We add **two** small pieces:

### A. `compare` utility (`benchmarks/src/compare.ts`, new)

`pnpm --filter @storely/benchmarks run compare --baseline=<path> --candidate=<path> [--threshold=0.05]`

Reads two result JSONs. For every cell present in both (matched on `backend|mode|operation|valueSize|batchSize|library`), emits a delta row: `hz_candidate / hz_baseline`. Output is markdown — green for ≥+5%, red for ≤−5%, neutral otherwise. Exits non-zero if any cell regressed past the threshold *unless* the row is annotated as expected-regression in a `--allow=<glob>` flag.

### B. Per-PR validation flow

Each PR description includes a `<!-- bench-scope -->` block:

```
<!-- bench-scope -->
backends: redis
suites: crud,batch
modes: both
<!-- /bench-scope -->
```

The author runs:

```
pnpm bench --backend=redis --suite=crud,batch --mode=both --skip-docs
pnpm --filter @storely/benchmarks run compare \
  --baseline=benchmarks/results/merged-2026-05-08T00-28-17-160Z.json \
  --candidate=benchmarks/results/<latest>.json
```

Pastes the output table into the PR. CI (a future addition, not in scope here) can parse the `<!-- bench-scope -->` and run the same.

Pillar 1 affects all cells, so its PR runs the full bench. Pillar 4 only runs `--backend=redis,sqlite,mysql,postgres,mongo --suite=crud,batch` — skipping memory entirely. This is exactly the speed-up the user requested for the gate.

## Files to touch

### Core
- `core/storely/src/capabilities.ts` — add `acceptsStructured` to `StorelyStorageCapability`.
- `core/storely/src/types/adapters.ts` — add `acceptsStructured?: boolean` to `StorelyStorageAdapter`.
- `core/storely/src/storely.ts` — branch encode/decode on the capability; rewrite `hookWithDeprecated` call sites with the listener-count fast-path; guard `emitTelemetry` calls behind `this._stats.enabled`.
- `core/storely/src/adapters/memory.ts` — declare `acceptsStructured = true`; store `{ value, expires }` directly.
- `core/storely/src/adapters/bridge.ts` — pass through the capability from the wrapped store.
- `core/bigmap/src/index.ts` — declare `acceptsStructured = true`.

### Adapters (Pillar 4)
- `storage/redis/src/index.ts` — internal serialize; `SET … EX` single command; pipelined `setMany`.
- `storage/sqlite/src/index.ts` — internal serialize; single-statement upsert.
- `storage/mysql/src/index.ts` — internal serialize; column type `TEXT` → `MEDIUMTEXT`; single-statement upsert. Migration note in package CHANGELOG.
- `storage/postgres/src/index.ts` — internal serialize; single-statement upsert.
- `storage/mongo/src/index.ts` — internal serialize (consistency with other byte stores even though mongo can store BSON natively).

### Benchmarks
- `benchmarks/src/compare.ts` (new) — delta utility per Pillar 5.
- `benchmarks/package.json` — register `compare` script.
- `benchmarks/README.md` — document the per-PR validation flow.

## Risk

- **Out-of-tree adapters** (`@storely/etcd`, `@storely/dynamo`, `@storely/keydb`, `@storely/valkey`, `@storely/memcache`, `@storely/rocksdb`) need parallel updates to do their own serialization. The default `acceptsStructured = false` means they keep working unchanged — just slower until updated. This is documented as a deprecation warning when an adapter doesn't declare the capability explicitly.
- **MySQL column migration**: `MEDIUMTEXT` is backwards-compatible with `TEXT` (`MEDIUMTEXT` can hold everything `TEXT` can). The adapter performs the `ALTER TABLE` automatically on first connect if it detects an older schema; documented in the storage/mysql CHANGELOG.
- **Behavioral diff for Map-backed stores**: today, mutating a value object after `set` and reading it back via `get` gives you the *deserialized* (cloned) version. After Pillar 1, you'd get the same reference — values become structurally aliased. Add a release note + a brief mention in the migration guide. Users who relied on the clone semantics can pass `serialization: jsonSerializer` explicitly to opt back in (we keep that path working for byte stores anyway, and a config flag can force it for structured stores too).

## Verification

After all four pillars merge, re-run the full benchmark (`pnpm bench`) and run `compare` against the committed baseline. Acceptance criteria:

1. **No cell regresses ≥5%** vs the baseline.
2. **Storely is within 1.2× of keyv** on every cell where keyv currently leads (i.e. ≤20% slower).
3. **Storely matches or beats keyv** on at least 60% of cells across the matrix.
4. **MySQL stores 64 KB values** without the `Data too long for column 'value'` error — the 4 missing cells in the baseline are filled in.
5. The new bench JSON gets committed as the new baseline; the docs site benchmark page is regenerated.

## Out of scope (deliberately deferred)

- CI-level regression gate that auto-runs the bench-scope on PR open. Out of scope for this design; can be a follow-up once the manual flow proves itself.
- Making `prepare()` recursion in the JSON serializer optional. Real users rely on the BigInt/Date handling. Reconsider only if Pillar 1+2+3 don't close enough of the gap on byte-store sets.
- Removing `{ value, expires }` envelope entirely. That's the "rearchitect" path the user explicitly de-scoped.
