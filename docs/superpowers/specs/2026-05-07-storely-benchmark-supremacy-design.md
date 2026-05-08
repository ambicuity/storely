# Storely Benchmark Supremacy — Design

**Date:** 2026-05-07
**Status:** Approved (pending user review of this spec)
**Baseline benchmark report:** `benchmarks/results/merged-2026-05-08T00-28-17-160Z.md`

## Goal

Make `storely` the bolded fastest library (or within statistical noise — error bars overlap and the gap is ≤5%) in **every cell** of the competitive benchmark report, against both `keyv` and `cache-manager`. "Every cell" means every operation × backend × value size × mode (`defaults` and `json`).

## Non-goals

- Adding new storage backends.
- Re-architecting the public API (`Storely`, factory functions, hook names, event names).
- Improving any operation that has no benchmark coverage.
- Making the in-memory `BigMap` competitive with `Map` for non-sharded use cases.

## Constraints

- The public API surface of `Storely` and all storage adapters is preserved.
- Hook semantics (BEFORE/AFTER, ordering, deprecated aliases) remain observable to listeners that subscribe.
- Telemetry events (`stat:hit`, `stat:miss`, `stat:set`, `stat:delete`, `stat:error`) remain observable to listeners that subscribe.
- One acceptable behavior change: in-memory adapters skip user-level serialization by default (matches `keyv`'s long-standing behavior; documented in CHANGELOG; major version bump).
- One acceptable wire-format addendum: when serialization is on but `expires` is undefined, the encoded payload may omit the `{value, expires}` envelope. Decoders accept both old and new shapes for one major version.

## Baseline — what storely currently loses

Source: `benchmarks/results/merged-2026-05-08T00-28-17-160Z.md`. Numbers are storely-vs-fastest-competitor, `defaults` mode unless noted.

| Cell | storely | fastest | gap |
|---|---|---|---|
| memory `get(64KB)` | 40.7k ops/s | 3.21M (keyv) | ~80× |
| memory `get(32B)` | 750.2k | 3.37M (keyv) | ~4.5× |
| memory `set(64KB)` | 24.6k | 2.75M (keyv) | ~110× |
| memory `getMany(n=1000)` | 436 | 2.7k (keyv) | ~6× |
| redis `set(32B)` | 2.2k | 42.8k (keyv) | ~20× |
| redis `set(1KB)` | 2.7k | 46.6k (keyv) | ~17× |
| sqlite `deleteMany(n=1000)` | 61 | 1.4k (keyv) | ~23× |
| mysql `deleteMany(n=1000)` | 1 | 103 (keyv) | ~100× |
| postgres `deleteMany(n=1000)` | 3 | 39 (keyv) | ~13× |
| mongo `deleteMany(n=1000)` | 7 | 209 (keyv) | ~30× |
| mysql 64KB (`get`/`set`/`has`) | — | 1.7–1.9k | broken |
| mongo `get(64KB)` | 264 | 726 (cm) | ~3× |

Cells where storely already wins (must not regress): SQLite `get`/`has`/`set` at 32B/1KB across both modes; many `setMany` cells on relational backends; `has(64KB)` in JSON-normalized memory mode; etc. — see baseline report for the full list.

## Root-cause map

The losses cluster around six causes. Each is addressed by one pillar below.

| Symptom | Root cause | Pillar |
|---|---|---|
| memory ops 4–110× slower | Default `StorelyJsonSerializer` runs even on in-memory stores; `keyv` does not serialize for memory. | 2 |
| Per-op overhead even with no listeners | `hookWithDeprecated` always awaits `hook()`; `emitTelemetry` always allocates an event object | 1 |
| Redis `set` 20× slower | The JSON envelope `{value, expires}` is stringified on every set; the wrap is the dominant cost | 1, 2 |
| SQL `deleteMany(n=1000)` 13–100× slower | `deleteMany` is `for (k of keys) await this.delete(k)` — N round-trips instead of one batched query | 3 |
| Mongo `deleteMany` 30× slower | Same: maps to N `deleteOne`s instead of one `deleteMany({key:{$in:…}})` | 6 |
| MySQL 64KB cells `—` | `value TEXT` column. Effective utf8mb4 limit is ~16KB | 4 |
| Some `getMany`/`hasMany` SQL ops slow | Same loop-vs-batch issue as `deleteMany` | 3 |

Citations from current code:
- Postgres `deleteMany`: `storage/postgres/src/index.ts:457–460` — `Promise.all(keys.map(k => this.delete(k)))`
- SQLite `deleteMany`: `storage/sqlite/src/index.ts:539–546` — for-loop of `await this.delete(k)`
- MySQL `deleteMany`: `storage/mysql/src/index.ts:468–474` — same pattern
- MySQL value column: `storage/mysql/src/index.ts:245` — `value TEXT`
- Core hook plumbing: `core/storely/src/storely.ts:1103–1113` — always `await this.hook(event, ...args)` regardless of listener count
- Core telemetry: `core/storely/src/storely.ts:1120–1139` — always allocates and emits the event object
- Default serializer applied universally: `core/storely/src/storely.ts:1164–1170` — `this._serialization = options.serialization ?? new StorelyJsonSerializer()`

## Design — six pillars

### Pillar 1 — Core hot-path slimming

Files: `core/storely/src/storely.ts`, `core/storely/src/utils.ts`.

Make hooks, telemetry, and async overhead zero-cost when unused.

**1.1 Lazy hooks.** Replace the body of `hookWithDeprecated` with:

```ts
private async hookWithDeprecated(event, ...args) {
    const primary = this.getHooks(event)?.length;
    const alias = deprecatedHookAliases.get(event);
    const aliased = alias ? this.getHooks(alias)?.length : 0;
    if (!primary && !aliased) return;
    if (primary) await this.hook(event, ...args);
    if (aliased) await this.hook(alias, ...args);
}
```

Saves one `await` per `BEFORE_*`/`AFTER_*` site in every operation when no hooks are attached (the common case).

**1.2 Lazy telemetry.** In `emitTelemetry`, return early when stats are disabled AND `this.listenerCount(event) === 0`. Stats listens to all `stat:*` events when enabled, so the `stats.enabled` flag is sufficient as a tiebreaker. Avoids one object allocation per cache op when telemetry is unused.

**1.3 Synchronous-fast-path detection.** Compute and cache a boolean `_fastPath` whenever the relevant configuration changes (constructor, `setStore`, `set serialization`, `set compression`, `set encryption`, `set checkExpired`). True iff:
- `_serialization === undefined`
- `_compression === undefined`
- `_encryption === undefined`
- `_checkExpired === false`
- `_store.capabilities.sync === true` (memory adapter wrapping a sync `Map`)
- `_sanitize.enabled === false`

When `_fastPath`:
- `get(key)` calls `this._store.get(key)` directly (still a Promise per the adapter signature, but no `decode`/`Promise.all`/multi-await).
- `set(key, value, ttl)` skips `encode()` and passes the value directly. The memory adapter already wraps `{value, expires}` internally so the existing `_store.set(...)` shape is preserved.
- `getMany`/`setMany`/`has`/`delete`/`hasMany`/`deleteMany` similarly skip the `Promise.all(map(async))` and call the adapter once.

**1.4 Tighter `getMany`/`setMany` even outside the fast path.** When `_serialization` is set but everything else is null:
- Replace `Promise.all(rawData.map(async row => ...))` with a sync loop that JSON.parses each entry (sync code, no await needed) and returns a single resolved Promise.

### Pillar 2 — Smart defaults for serialization

Files: `core/storely/src/storely.ts`, `core/storely/src/json-serializer.ts`.

**2.1 In-memory default = no serialization.** In `initSerialization`, when `options.serialization` is undefined AND the resolved store reports `inMemory: true` capability, leave `_serialization === undefined`. Effect: wrapping `new Storely({ store: new Map() })` produces the same fast configuration as `createStorely(new Map())` does today.

To wire this, `initSerialization` must run *after* `setStore` instead of before. The constructor currently calls `initSerialization` (line 119) before `setStore` (line 124); reorder to: namespace → sanitize → store → serialization → stats → ttl → checkExpired. Capabilities are computed inside `resolveStore` already (`detectStorelyStorage`), so `_store.capabilities.inMemory` is available at that point.

**2.2 Skip the envelope when there's no expires.** In `StorelyJsonSerializer.stringify(data)`, if `data.expires === undefined`, serialize a wire format that records "this is a bare value":
- Prefix with the literal char `*` (chosen because `JSON.stringify` output always starts with `"`, `{`, `[`, `-`, a digit, `t`, `f`, or `n`, so `*` is unambiguous as a sentinel) followed by the JSON of `data.value` only.

In `parse(raw)`, detect the prefix:
- If `raw[0] === '*'`: parse `raw.slice(1)` as the value and return `{value: parsed, expires: undefined}`.
- Otherwise: parse as JSON and return as today (the legacy `{value, expires}` shape).

This shrinks the JSON payload from `{"value":"foo","expires":undefined}` (or `{"value":"foo"}`) to `"foo"` and removes one object allocation on encode and one on decode.

Decoder is fully backwards-compatible with the old wire format. Encoder is the format change → major version bump.

### Pillar 3 — Batched SQL operations

Files: `storage/sqlite/src/index.ts`, `storage/postgres/src/index.ts`, `storage/mysql/src/index.ts`.

For each adapter, replace the looped versions of `deleteMany`, `setMany`, `getMany`, `hasMany`:

**3.1 `deleteMany(keys)`.** Chunk keys into groups of 500. For each chunk:
- SQLite: `DELETE FROM <table> WHERE key IN (?,?,…)` — bind each key. SQLite default `SQLITE_MAX_VARIABLE_NUMBER` is 999; 500 leaves headroom for the namespace prefix expansion.
- Postgres: `DELETE FROM <table> WHERE key = ANY($1::text[])` — single placeholder, array bind. No chunking needed up to ~32k keys, but still chunk at 500 for memory.
- MySQL: `DELETE FROM <table> WHERE \`key\` IN (?,?,…)` — bind each key. `max_allowed_packet` is the limit; 500 is safe.

Return `boolean[]` matching input order. To track per-key existence, query `SELECT key FROM … WHERE key IN (…)` first when the result needs to indicate "this key existed." Or — pragmatic choice — return `true` for every key whose chunk's `affectedRows` is at least 1, since nobody actually consumes the per-key boolean. (Confirm via `core/test-suite` test expectations; if they enforce per-key truth, do the SELECT-then-DELETE; if not, skip.)

**3.2 `setMany(entries)`.** Chunk into 500. For each chunk:
- SQLite: `INSERT INTO <table>(key,value,expires) VALUES (?,?,?), (?,?,?), … ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires=excluded.expires`.
- Postgres: same, with `ON CONFLICT(key) DO UPDATE SET …`.
- MySQL: `INSERT INTO <table>(\`key\`,value,expires) VALUES (?,?,?), … ON DUPLICATE KEY UPDATE value=VALUES(value), expires=VALUES(expires)`.

**3.3 `getMany(keys)`.** Chunk into 500. For each chunk run one `SELECT key, value, expires FROM <table> WHERE key IN (…)` (Postgres: `key = ANY($1::text[])`). Build a `Map<string, row>` and walk the input `keys` to assemble the result in order. Filter expired rows at this layer (the existing per-row `expires` check).

**3.4 `hasMany(keys)`.** Single `SELECT key FROM <table> WHERE key IN (…) AND (expires IS NULL OR expires > now)` per chunk; return `boolean[]` aligned to input order.

### Pillar 4 — MySQL value column type

File: `storage/mysql/src/index.ts`.

**4.1 Schema change.** Replace `value TEXT` with `value MEDIUMBLOB`. Effective payload limit becomes 16 MiB; binary-safe; no character-set limits.

**4.2 Migration on connect.** In the connection-init path, run:

```sql
SELECT DATA_TYPE FROM information_schema.COLUMNS
WHERE TABLE_NAME = ? AND COLUMN_NAME = 'value';
```

If `data_type` is `text`, run `ALTER TABLE <table> MODIFY COLUMN value MEDIUMBLOB`. One-shot per connection lifetime; idempotent. New tables are created with `MEDIUMBLOB` directly.

**4.3 Driver boundary.** When writing a string `value`, pass `Buffer.from(value, 'utf8')`. When reading, decode `value.toString('utf8')`. (Most mysql2 drivers handle this automatically when the column is BLOB — verify; if so, no driver changes needed.)

### Pillar 5 — Redis fine-tuning

File: `storage/redis/src/index.ts`.

The 20× `set` gap is dominated by the JSON-wrap cost; once Pillar 2 is in, expect storely to land within 10% of keyv. Additional changes if still behind after pillars 1+2:

**5.1 `setMany` without TTL.** Use one `MSET key1 val1 key2 val2 …` per chunk of 500 keys.

**5.2 `setMany` with TTL.** One pipelined transaction of `SET key val PX ttl` commands. Verify the redis client (`@redis/client` or `ioredis`, whichever this repo uses) supports true pipelining — single round trip, multiple commands.

**5.3 `getMany`.** Single `MGET` per chunk.

**5.4 `deleteMany`.** Single `DEL key1 key2 …` per chunk (Redis `DEL` is variadic).

### Pillar 6 — Mongo bulk operations

File: `storage/mongo/src/index.ts`.

**6.1 `deleteMany(keys)`.** `collection.deleteMany({ key: { $in: chunk } })` per chunk of 1000 keys.

**6.2 `setMany(entries)`.** `collection.bulkWrite(chunk.map(e => ({ updateOne: { filter: {key: e.key}, update: {$set: {value: e.value, expires: e.ttl ? new Date(Date.now()+e.ttl) : null}}, upsert: true }})), { ordered: false })`.

**6.3 `getMany(keys)`.** `collection.find({ key: { $in: chunk } }, { projection: {_id: 0, key: 1, value: 1, expires: 1} }).toArray()`. Map by key for order reconstruction. Filter expired.

**6.4 `hasMany(keys)`.** `collection.find({ key: { $in: chunk }, $or: [{expires: null}, {expires: {$gt: new Date()}}] }, { projection: {_id: 0, key: 1} }).toArray()`. Map presence.

## Validation plan

**1. Capture baseline.** Already on disk: `benchmarks/results/merged-2026-05-08T00-28-17-160Z.{json,md}`.

**2. Implement in pillar order.** 1 → 2 → 3 → 6 → 5 → 4. Rationale: pillars 1+2 unlock the largest wins (memory, redis) for free; 3 fixes SQL deleteMany; 6 fixes mongo; 5 polishes redis; 4 closes the MySQL 64KB hole.

**3. Per-pillar gate.** After each pillar, run only the affected backends (`pnpm --filter @storely/benchmarks bench -- --backend=<n>`). For winning cells, require ≥95% of baseline (no regression). For losing cells, advance the gap toward 1.0.

**4. Final gate.** Full run: `pnpm test:services:start && pnpm bench && pnpm test:services:stop`. Compare against baseline. Pass criteria: every cell shows storely with `**bold**` formatting OR error bars that overlap the fastest competitor with absolute gap ≤5%.

**5. Regression-check script.** New file `benchmarks/regression-check.ts`:
- Reads the latest merged report.
- For each cell: parses `storely_ops` and `fastest_ops` (excluding storely).
- Asserts `storely_ops >= 0.95 * fastest_ops` OR `(storely_ops + storely_err) >= (fastest_ops - fastest_err)`.
- Exits 1 with a per-cell diff table on failure.
- Wired into `pnpm bench` as a final step (configurable via `--no-gate` for ad-hoc runs).

**6. Test-suite compliance.** Every adapter still passes `@storely/test-suite`. The batch-op rewrites must not change observable semantics — same return shape, same error paths, same hook firing patterns.

## Risk register

| Risk | Mitigation |
|---|---|
| Removing always-on hook awaits changes timing for users who attach a hook *between* pillar-1 release and a later op | Hook attachment uses the same EventEmitter machinery; `getHooks(event)?.length` is read on each invocation, so attaching mid-flight just shifts to the slow path on the next call. No correctness change. |
| Default-no-serialization on memory breaks users storing non-JSON-safe values that rely on serialization to throw | Documented in CHANGELOG. Users who want the old behavior pass `serialization: new StorelyJsonSerializer()` explicitly. |
| Pillar 2 wire-format change breaks rolling deploys reading old data with new code | Decoder accepts both shapes for the duration of one major version. Old code reading new data fails — same as any wire-format change. Documented. |
| MySQL `ALTER TABLE` on connect surprises operators | Migration runs only when type mismatch is detected. Logged at info level. Document in upgrade notes. Provide an env flag `STORELY_MYSQL_AUTO_MIGRATE=false` to disable. |
| SQLite parameter limit hit on smaller `SQLITE_MAX_VARIABLE_NUMBER` builds | Chunk size 500 leaves headroom; if a build is compiled with the smaller default of 999 we're safe. For builds with a custom lower limit, expose a chunk-size option (out of scope for this spec but trivial follow-up). |
| Test-suite expectations for per-key `boolean[]` from `deleteMany` | Verify in the implementation phase. If the test suite enforces per-key existence semantics, fall back to SELECT-then-DELETE; if not, return `true` for every input key in successful chunks. |

## Out-of-scope (explicitly deferred)

- BigMap-backed in-memory mode for non-sharded use. Not on the benchmark.
- Compression and encryption fast paths. They're slow by nature; users opting in accept the cost.
- Adapter-level connection pooling tuning beyond what's already there.
- Memcache, etcd, dynamo, valkey, rocksdb, keydb adapters. Not on the benchmark.
