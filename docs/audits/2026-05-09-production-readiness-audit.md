# Production-Readiness Audit — 2026-05-09

**Branch:** `benchmark-supremacy` at `9e32f1f`
**Scope:** entire monorepo (~42,500 LOC across 22 packages)
**Method:** four parallel deep reads — core+serialization, 5 major adapters, 6 newer adapters, cross-cutting (compression/encryption/CI/build/docs/deps)
**Bottom line:** **Not production-ready.** Multiple critical defects across the 6 newer adapters, two high-severity bugs in major adapters (MongoDB deadlock, MySQL pool-singleton leak), an unsafe release pipeline, and a security-disclosure policy that publicly leaks vulnerabilities.

---

## Executive verdict

| Layer | State | Notes |
|---|---|---|
| Core + serialization | **YELLOW** | Architecture is sound. One operational footgun (`throwOnEmptyListeners=true` undocumented), several batch-API contract bugs. |
| Redis | **GREEN-ISH** | Closest to ready. One TTL=0 silent no-op to fix. |
| Postgres | **YELLOW** | Solid SQL hygiene; unbounded `deleteMany` and tiny iterator default need attention. |
| MySQL | **RED** | Module-level pool singleton leaks; `endPool` fire-and-forget; global event-scheduler collision across instances. |
| MongoDB | **RED** | `initConnection` deadlocks all future ops on a single connection failure. Deprecated `count()` will break in next driver major. |
| SQLite | **GREEN** | Most disciplined adapter (parameter chunking, multi-driver detection). WAL-off default needs a doc warning. |
| KeyDB | **RED** | Batch operations hang indefinitely on transient unreachability — the bench-removal commit's named symptom is **unfixed**. |
| Memcache | **RED** | Same batch hang as KeyDB; `clear()` flushes the entire shared server regardless of namespace. |
| Etcd | **RED** | Lease-per-`set` leaks etcd resources under any write load; shared-lease design evicts everything at once. |
| Valkey | **YELLOW** | `clear()` uses blocking `KEYS`; pre-1.0 `iovalkey` dependency. |
| DynamoDB | **RED** | `clear()` doesn't paginate Scan — silently leaves data on tables >1 MB; silent 6-hour default TTL contradicts the docs. |
| RocksDB | **YELLOW** | `iterator()` silently truncates at 100; dead-code branch in `parseValue`; native build requirement undocumented. |
| Compression | **YELLOW** | `compress-gzip` is actually raw DEFLATE — interop-breaking misnomer. |
| Encryption | **YELLOW** | AEAD defaults are correct; string keys go through bare SHA-256 instead of a real KDF. |
| CI / release | **RED** | `release.yml` has **no dependency** on `ci.yml` passing. No npm provenance. No type-check step. |
| Security policy | **RED** | `SECURITY.md` instructs reporters to file **public** GitHub issues for vulnerabilities. |
| Dependencies | **YELLOW** | 6 high-severity CVEs in `node-tar` via `sqlite3` (devDep path, but exposed in CI). Unmaintained `memcache@1.x` client. |

---

## Critical (must fix before any production use)

### CI / release / security

1. **`release.yml` can publish broken code.** It has no `needs: [ci]` or workflow dependency. Any pushed semver tag publishes immediately, no test/build/lint gate. The version-mismatch step is a `::warning::` only. (`.github/workflows/release.yml`)

2. **`SECURITY.md` requests public disclosure.** Tells reporters to open a public GitHub issue tagged `security vulnerability`. This is the opposite of responsible disclosure — switch to GitHub's private security advisory or a `security@` mailbox. (`SECURITY.md`)

3. **No npm provenance on publish.** `release.yml:82` runs `pnpm -r publish` without `--provenance` and without `id-token: write` on the job. Free, supported, supply-chain hardening.

### Adapters — silent data-loss / deadlock

4. **MongoDB `initConnection` never rejects on connection failure.** Promise initialized with `new Promise(async (resolve, _reject) => …)` and the catch block emits `"error"` but never settles the outer promise. Every subsequent `get`/`set`/`delete` `await this.connect`s forever. (`storage/mongo/src/index.ts:797-843`)

5. **MySQL module-level pool singleton leaks pools across multi-instance use.** Two `StorelyMysql` instances with different URIs in the same process leak the first pool when the second is created; `endPool()` is also non-async fire-and-forget so `disconnect()` returns before in-flight queries drain. (`storage/mysql/src/pool.ts`)

6. **DynamoDB `clear()` does not paginate.** A single `Scan` page is at most 1 MB. Tables larger than ~2-5k items have data silently survive a `clear()`. (`storage/dynamo/src/index.ts:461-477`)

7. **DynamoDB silent 6-hour default TTL on every write.** `set()` without `ttl` applies `_sixHoursInMilliseconds` rather than persisting indefinitely. Diverges from every other adapter; not in README. (`storage/dynamo/src/index.ts:199-227`)

8. **KeyDB + Memcache batch operations hang indefinitely.** Both adapters' `getMany`/`setMany`/`deleteMany` block forever when the server is transiently unreachable — KeyDB because `@redis/client` queues commands during reconnection with no command timeout; Memcache because the `memcache` client has no per-op timeout and `getMany` does N sequential calls. **This is the unfixed root cause** documented in the bench-removal commit (`9e32f1f` body). (`storage/keydb/src/index.ts`, `storage/memcache/src/index.ts:164-179`)

9. **Memcache `clear()` flushes the entire server.** No namespacing — a shared Memcached cluster has all keys from all tenants/apps wiped. Documented in a code comment but not surfaced in API/README. (`storage/memcache/src/index.ts:276-283`)

10. **Etcd creates one lease per `set()` call.** Every per-key TTL `set` allocates a fresh server-side lease that's never explicitly revoked. High-frequency writes exhaust etcd's lease table. The shared-instance lease (when configured) is never renewed and never revoked in `disconnect()`. (`storage/etcd/src/index.ts:80-84, 330-347, 492-500`)

11. **Redis `set(key, value, 0)` silently means "no expiry".** `if (ttl)` is falsy on `0`. Same pattern in `setMany`. Should either error, mean "expire immediately", or be documented. (`storage/redis/src/index.ts:307, 357, 375`)

12. **Postgres `deleteMany` has no chunking.** `DELETE … WHERE key = ANY($1)` with an unbounded array; tens-of-thousands keys risk driver memory blowup or query timeout. The 2500-key test passes but the implementation has no guard. (`storage/postgres/src/index.ts:464`)

### Compression

13. **`@storely/compress-gzip` is actually raw DEFLATE, not gzip.** Imports `deflate`/`inflate` from `pako` (which omit the gzip header/trailer). Any consumer passing the output to `Content-Encoding: gzip`, S3, nginx, etc. will get a parse error. Either switch to `pako.gzip`/`pako.ungzip` or rename the package. (`compression/compress-gzip/src/index.ts:2`)

---

## Important (fix before significant load or external users)

### Core / serialization

- **`throwOnEmptyListeners: true` is undocumented.** Any internal error event becomes an uncaught exception unless the consumer attached `on("error", …)`. Either default to `false` or surface this prominently. (`core/storely/src/storely.ts:119`)
- **`setMany` collapses to all-false on a single bad entry.** Any one encode failure rejects `Promise.all` and the catch returns `entries.map(() => false)`. No granular per-entry signal. (`core/storely/src/storely.ts:724-759`)
- **`BridgeAdapter.setMany` discards the underlying store's per-key result.** Returns `entries.map(() => true)` regardless. Conditional-write stores' `false` results are lost. (`core/storely/src/adapters/bridge.ts:285-286`)
- **`BigMap.set()` returns the shard `Map`, not `BigMap`.** Chaining `bigMap.set('a',1).set('b',2)` writes both into the same shard, defeating sharding. The `MapInterfacee` interface (sic — typo) formalizes the wrong type. (`core/bigmap/src/index.ts:330-339`)
- **`BridgeAdapter.clear(namespace)` depends on iterator returning prefixed keys.** `StorelyMemoryAdapter.iterator` strips the prefix; `clear()` then matches nothing and silently no-ops. Behavior contract not documented. (`core/storely/src/adapters/bridge.ts:390-394` ↔ `memory.ts:391-394`)
- **`@storely/serialize-msgpackr` is Node-only.** Hardcoded `import { Buffer } from "node:buffer"`; no browser export map; no fallback. The default JSON serializer in core has a `btoa`/`atob` fallback — msgpackr should match or document Node-only. (`serialization/msgpackr/src/index.ts:1`)
- **`get()` cannot distinguish `undefined` value from missing key.** `set(k, undefined)` then `get(k)` returns `undefined`, indistinguishable from a miss. Fast-path `has()` does work; document this gap. (`core/storely/src/types/storely.ts:21`)

### Adapters

- **MongoDB uses deprecated `collection.count()` in `has()`/`hasMany()`.** Driver v7 logs deprecation; future major likely removes it. Switch to `countDocuments` / `estimatedDocumentCount`. (`storage/mongo/src/index.ts:687, 695`)
- **MongoDB index option `background: true` is deprecated** in v4+ driver and ignored in 4.2+ servers. (`storage/mongo/src/index.ts:834-835`)
- **MySQL `intervalExpiration` is in seconds; every other adapter's interval is milliseconds.** Cross-package inconsistency footgun.
- **MySQL global `EVENT storely_delete_expired_keys`** name collides across instances pointing at different tables in the same server.
- **MySQL `deleteMany` is 2 round-trips per chunk.** MySQL 8.0.20+ supports `DELETE … RETURNING`; the adapter still does pre-flight `SELECT id`.
- **Postgres pool has no documented bounds and no validation.** User can pass `max:0` or `connectionTimeoutMillis:0` and self-DoS without warning.
- **Postgres iterator default `_iterationLimit = 10`.** Forces many round-trips on any non-trivial dataset; bump default to 500-1000 or document.
- **Postgres schema migration is unlocked.** Concurrent process starts can race on `CREATE TABLE`/`CREATE UNIQUE INDEX`; only error code `23505` is suppressed.
- **Redis `getKeyWithoutPrefix` uses `String.replace`** (first-occurrence only) — pathological keys that contain the namespace prefix can be over-stripped. (`storage/redis/src/index.ts:667`)
- **Redis has no `commandTimeout`.** Mid-command stalls block forever; `connectionTimeout` only covers initial connect.
- **Redis default `throwOnErrors:false` is intentional but unflagged.** Errors become silent unless the consumer attaches `on("error")`. Same footgun as core's `throwOnEmptyListeners`.
- **Etcd `iterator()` does N sequential `get`s** after a full prefix range query — should batch via range request.
- **Valkey `clear()` uses blocking `KEYS *`** instead of `SCAN`; will block the Valkey event loop on large keysets. (`storage/valkey/src/index.ts:450-457`)
- **Valkey `deleteMany` is N serial `UNLINK` round-trips.** No pipeline / multi-exec batching.
- **DynamoDB `deleteMany` is N `DeleteItem` requests.** Should use `BatchWriteItem` (cost + latency).
- **DynamoDB has no validation when AWS credentials are missing.** Operations fail with cryptic SDK errors instead of "configure AWS credentials".
- **RocksDB iterator silently truncates at `_iterationLimit` (default 100).** Datasets > limit lose entries with no signal. (`storage/rocksdb/src/index.ts:644-678`)
- **RocksDB `parseValue` has unreachable `Uint8Array` branch** (`Buffer.isBuffer(v) || (v instanceof Uint8Array && !(v instanceof Uint8Array))`). Dead code → potentially incorrect parse for non-Buffer Uint8Array inputs. (`storage/rocksdb/src/index.ts:818-821`)
- **RocksDB native binding `@nxtedition/rocksdb` compiles from source on install.** No prebuilt-binary path documented; will fail in scratch/Alpine/restricted CI without C++ toolchain.
- **SQLite `wal: false` default** is unsafe for any multi-process reader/writer setup. Document or change default.
- **KeyDB `initClient()` accumulates listeners on every reconnect** without deduplication. (`storage/keydb/src/index.ts:952-970`)

### Encryption

- **String keys derived via bare `SHA-256` digest, not a KDF.** Low-entropy passwords yield trivially-brutable keys. Use PBKDF2/scrypt/Argon2 with stored salt. Both `encrypt-node` (`src/index.ts:85`) and `encrypt-web` (`src/index.ts:144`).
- **No key rotation / versioning in ciphertext.** Rotated keys make existing data unreadable; no migration path documented.
- **AES-CBC exposed as an option** with no docs warning that it's unauthenticated. (`encryption/encrypt-web/src/index.ts:9-15` and node counterpart)

### CI / build / deps

- **No standalone `tsc --noEmit` step in CI.** `pnpm build` runs `tsdown`/esbuild which strip types without checking them. Type errors slip through.
- **CI tests only Node 20.** Per-package `engines.node` is `>= 18`; root is `>= 20`. No matrix coverage. If this is intentional, raise per-package floor to 20 to match.
- **6 high-severity CVEs in `tar` via `sqlite3` transitive** (GHSA-34x7, -8qq5, -83g3, -qffp, -9ppj, -r6q2). devDep path; production users unaffected, but exercised in CI native-module compilation.
- **`memcache@^1.4.0`** is unmaintained (last publish 2013) — also why it has the `minimumReleaseAge` exclusion. Migrate to `memjs` or similar.
- **`CONTRIBUTING.md` documents `minimumReleaseAge: 7200`** but the actual workspace value is `2880`. Stale docs.

### Repo hygiene

- **`storage/sqlite/test/testdb*.sqlite` are tracked in git** and routinely modified by tests. Add `*.sqlite` to `.gitignore`, `git rm --cached` the existing files. (Also why `git status` keeps showing those files dirty across sessions.)

---

## Minor (post-launch / nits)

- `core/storely/src/storely.ts:418` — `let rawData;` with biome-ignore for implicit-any. Initialize with explicit type.
- `StorelyMapAny = Map<any,any> | any` — union with `any` collapses to `any`. (`core/storely/src/types/storely.ts:13`)
- `StorelyStats` exposes live `Map` instances via `hitKeys`/`missKeys` getters; external mutation can corrupt the LRU invariant.
- `BigMap`'s `MapInterfacee` interface name has a double-`e` typo (public exported type — breaking to fix).
- `StorelyHooks` doc-comment references `storely.on(...)` but the API is `addHook` / `hook`. (`core/storely/src/types/storely.ts:55`)
- `core/test-suite` has no concurrency tests — `await get` interleaved with `await delete` not exercised.
- Memory adapter's iterator yields `entry.value` (an object) but `iterator()` calls `decode(raw as string)` — type-lies but happens to work because `decode` branches on `typeof`.
- `compress-gzip` `Options` type intersects deflate + inflate option types; semantically incoherent. (`compression/compress-gzip/src/types.ts`)
- Brotli compression defaults to quality 11 (max CPU). Document or default to 4-6 for cache use.
- All compression adapters buffer entire value in memory (no streaming path). Document for large-blob users.
- `compress-lz4/package.json` declares `engines.node: >=18` while monorepo requires `>=20`.
- `biome.json` sets `vcs.enabled: false` — Biome ignores `.gitignore`. Mitigated by `files.includes` glob.
- Root `clean` script deletes `pnpm-lock.yaml` — surprising default that risks dependency drift.
- No `CHANGELOG.md` anywhere. Acceptable at alpha but establish before GA.
- Compression packages may have committed `coverage/` and `dist/` directories (worth a clean-room verification).
- Most packages are `6.0.0-alpha.4` — alpha is fine; document the breaking-change cadence and any release plan.
- `AEAD_MODES` in `encrypt-node` includes the loose label `"stream"` instead of an explicit ChaCha20-Poly1305 check. Could mismatch future Node ciphers.

---

## Recommended remediation order

If the goal is to ship something defensible, do these in order. Each cluster can be its own brainstorm → spec → plan → impl cycle.

**Cluster 1 — release-pipeline & disclosure (1 day)**
- Make `release.yml` depend on `ci.yml`.
- Switch `SECURITY.md` to private advisory flow.
- Add `--provenance` + `id-token: write` to publish job.
- Add `pnpm -r exec tsc --noEmit` job to CI.

**Cluster 2 — fix the data-loss / deadlock bugs (1-2 days)**
- Mongo `initConnection` reject path.
- Dynamo `clear()` pagination loop.
- Dynamo silent 6h default TTL — either remove the default or document and surface as `defaultTtl`.
- Redis (and KeyDB) TTL=0 semantics.
- MySQL pool singleton: turn into per-instance pool with proper `await endPool` on disconnect.

**Cluster 3 — fix the batch-op hangs (2-3 days)**
- Add command-level timeouts to KeyDB (and Redis) via `socket.commandTimeout`.
- Memcache: replace the `memcache` package with `memjs` (or wrap each op in a Promise.race timeout); make `getMany` use a real `gets` multi-key call where supported.
- Add equivalent guards to Valkey's `deleteMany`.

**Cluster 4 — fix the supply-chain & repo-hygiene items (half day)**
- `.gitignore *.sqlite` + `git rm --cached` the existing files.
- Update `sqlite3` (or override `tar` resolution) to clear the 6 CVEs.
- Reconcile `CONTRIBUTING.md` `minimumReleaseAge` doc.

**Cluster 5 — fix the misnomer/correctness items (1 day)**
- Rename `compress-gzip` to `compress-deflate`, OR switch internals to `pako.gzip`/`ungzip`.
- Fix RocksDB iterator truncation contract (paginate or yield-all).
- Etcd lease lifecycle: revoke per-set leases on completion or migrate to a single keep-alive lease.

**Cluster 6 — encryption hardening (1 day)**
- Replace bare-SHA-256 string-key derivation with PBKDF2 (or document "this is a key, not a password" prominently and reject low-entropy inputs).
- Add ciphertext-version byte and document key-rotation pattern.

**Cluster 7 — core API refinements (1-2 days)**
- `setMany` per-entry success/failure tracking.
- `BridgeAdapter.setMany` use the underlying result.
- `BigMap.set()` return `this`.
- Document or default `throwOnEmptyListeners=false`.
- Document `undefined`-vs-missing semantic gap.

After Clusters 1-4, Storely is defensible for redis/sqlite/postgres backends in production. KeyDB/Memcache/Etcd/DynamoDB should remain experimental until their respective clusters land.

---

## Methodology / caveats

- This audit is a static read. No load tests, no chaos runs, no fuzzing of the test suite were performed.
- Adapter integration tests run against real backends via Docker per `AGENTS.md`; the audit trusted that signal but did not run the suite end-to-end.
- The bench-hang root cause analysis (Cluster 3) is inferred from the adapter source and the bench-removal commit body (`9e32f1f`); reproduction requires bringing the bench infrastructure back temporarily or adding targeted unreachability tests.
- "Production-ready" in this audit means: handles transient failures without deadlock or data loss, has a credible release/security policy, and behaves consistently across documented APIs. It does not assess scale (no perf signal post-bench-removal) or operability (no observability framework).
