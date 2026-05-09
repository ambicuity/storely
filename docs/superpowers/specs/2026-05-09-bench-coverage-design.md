# Benchmark coverage: add the 6 unmeasured storage adapters

## Context

The competitive benchmark suite at `benchmarks/` measures storely against keyv and cache-manager on six backends: memory, redis, sqlite, mysql, postgres, mongo. The monorepo ships 11 storage adapters total. The other six — memcache, etcd, valkey, keydb, dynamo, rocksdb — have working code and tests but are not benched against competitors. Today there is no signal about whether storely's implementation of those six is competitive or regressing on perf.

`website/site/docs/benchmarks.md` is generated from the latest merged bench JSON. After the bench-config fix landed (`96a32bb`) and the new merged baseline was committed (`978e4f4`), the docs page still reflected the older `2026-05-08T00-28-17-160Z` snapshot — the page is regenerated whenever `pnpm bench` runs without `--skip-docs`.

Competitor coverage in the keyv ecosystem (verified against npm and `node_modules`):

| storely adapter  | keyv counterpart                       | strategy        |
|------------------|----------------------------------------|-----------------|
| memcache         | `@keyv/memcache@2.0.2`                 | competitive (storely + keyv + cache-manager) |
| etcd             | `@keyv/etcd@2.1.1`                     | competitive     |
| valkey           | `@keyv/valkey@1.0.11`                  | competitive     |
| keydb            | none — uses `@keyv/redis` against keydb's redis-protocol port | competitive     |
| dynamo           | none on npm                            | storely-only    |
| rocksdb          | none on npm (native binding)           | storely-only    |

The Docker compose at `scripts/docker-compose-arm64.yaml` already brings up all the network services (`storely_memcached`, `storely_etcd`, `storely_valkey`, `storely_keydb`, `storely_dynamo`). No infra additions are needed.

## Goals

- Every storely storage adapter that ships is on the benchmark.
- For adapters with a keyv counterpart, the bench produces head-to-head numbers (storely vs keyv vs cache-manager) using the same `crud` and `batch` suites and `defaults` and `json` modes already in use.
- For adapters without a keyv counterpart (dynamo, rocksdb), the bench produces storely-only rows so regressions are caught.
- `website/site/docs/benchmarks.md` is regenerated to show all 11 backends after this PR.
- The regression gate (`benchmarks/regression-check.ts`) covers the new cells. The promoted `benchmarks/baseline.json` includes them.
- No change to bench methodology (benchmark.js deferred async, key-pool rotation, the existing fairness rules).

## Non-goals

- Implementing missing competitor adapters. We do not author `@keyv/dynamodb` or `@keyv/rocksdb` here.
- Perf optimization on the underlying `@storely/*` adapters. The new bench rows may surface real lags (or wins); chasing them is follow-up work.
- Methodology changes. The deferred-async harness, fairness rules, and report shape stay as-is.
- Bumping the CI runner size or restructuring CI parallelism.

## Architecture

Three cooperating changes, one PR boundary.

### 1. Six new backend factories

One new file per backend under `benchmarks/src/backends/`. Each implements the existing `BackendFactory` shape from `benchmarks/src/types.ts`:

```ts
interface BackendFactory {
  name: BackendName;
  available(): Promise<boolean>;
  build(mode: Mode): Promise<BenchClient[]>;
}
```

`available()` does a TCP probe for network backends (`probeTcp` already exists in `benchmarks/src/backends/util.ts`) and a module-load probe for the embedded `rocksdb`. `build(mode)` returns the per-library `BenchClient[]` — three entries for competitive backends, one entry for storely-only.

**`benchmarks/src/backends/memcache.ts`** — competitive, port 11211.
```ts
import KeyvMemcache from "@keyv/memcache";
import StorelyMemcache from "@storely/memcache";
import type { BackendFactory, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const URI = process.env.MEMCACHE_URI ?? "localhost:11211";

export const memcacheBackend: BackendFactory = {
  name: "memcache",
  async available() {
    return await probeTcp("localhost", 11211);
  },
  async build(mode: Mode) {
    return [
      buildStorelyClient({ mode, store: new StorelyMemcache(URI) }),
      buildKeyvClient({ mode, store: new KeyvMemcache(URI) }),
      buildCacheManagerClient({ mode, store: new KeyvMemcache(URI) }),
    ];
  },
};
```

**`benchmarks/src/backends/etcd.ts`** — competitive, port 2379. Same shape; substitute `@storely/etcd`, `@keyv/etcd`, `etcd://localhost:2379` URI.

**`benchmarks/src/backends/valkey.ts`** — competitive, port 6370 (valkey's docker-compose-mapped port). Substitute `@storely/valkey`, `@keyv/valkey`.

**`benchmarks/src/backends/keydb.ts`** — competitive, port 6378 (keydb's docker-compose-mapped port). Storely uses `@storely/keydb`. The competitive side reuses the already-installed `@keyv/redis` configured with the keydb URL — keydb is a redis-protocol fork, so this is the same pattern storely's keydb adapter already uses internally:

```ts
import KeyvRedis from "@keyv/redis";
import StorelyKeyDB from "@storely/keydb";

const URI = process.env.KEYDB_URI ?? "redis://localhost:6378";

export const keydbBackend: BackendFactory = {
  name: "keydb",
  async available() { return await probeTcp("localhost", 6378); },
  async build(mode: Mode) {
    return [
      buildStorelyClient({ mode, store: new StorelyKeyDB(URI) }),
      buildKeyvClient({ mode, store: new KeyvRedis(URI) }),
      buildCacheManagerClient({ mode, store: new KeyvRedis(URI) }),
    ];
  },
};
```

The bench labels the row `keydb` (per the factory's `name`), so it's distinguishable from the existing `redis` row even though the keyv side uses the same library against a different port.

**`benchmarks/src/backends/dynamo.ts`** — storely-only, default port 8000.
```ts
import StorelyDynamo from "@storely/dynamo";
import type { BackendFactory, Mode } from "../types.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const ENDPOINT = process.env.DYNAMO_ENDPOINT ?? "http://localhost:8000";

export const dynamoBackend: BackendFactory = {
  name: "dynamo",
  async available() {
    const url = new URL(ENDPOINT);
    return await probeTcp(url.hostname, Number(url.port || 8000));
  },
  async build(mode: Mode) {
    return [
      buildStorelyClient({
        mode,
        store: new StorelyDynamo({ endpoint: ENDPOINT, region: "local", credentials: { accessKeyId: "x", secretAccessKey: "x" } }),
      }),
    ];
  },
};
```

**`benchmarks/src/backends/rocksdb.ts`** — storely-only, embedded.
```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendFactory, Mode } from "../types.js";
import { buildStorelyClient } from "../libraries/storely.js";

export const rocksdbBackend: BackendFactory = {
  name: "rocksdb",
  async available() {
    try { await import("@storely/rocksdb"); return true; } catch { return false; }
  },
  async build(mode: Mode) {
    const StorelyRocksDB = (await import("@storely/rocksdb")).default;
    const dir = mkdtempSync(join(tmpdir(), "storely-bench-rocksdb-"));
    return [ buildStorelyClient({ mode, store: new StorelyRocksDB({ path: dir }) }) ];
  },
};
```

### 2. Wiring

**`benchmarks/src/backends/index.ts`** — import and register the 6 factories alongside the existing `allBackends` array.

**`benchmarks/src/types.ts`** — extend `BackendName`:
```ts
export type BackendName =
  | "memory" | "redis" | "sqlite" | "mysql" | "postgres" | "mongo"
  | "memcache" | "etcd" | "valkey" | "keydb" | "dynamo" | "rocksdb";
```

The runner (`benchmarks/src/runner.ts`) iterates `allBackends`, gates on `available()`, and runs the suites — no logic change needed; new backends flow through automatically.

### 3. Dependencies

**`benchmarks/package.json`** — add to `dependencies`:

- `@keyv/memcache` (matching the version installed elsewhere; check root lockfile)
- `@keyv/etcd`
- `@keyv/valkey`
- `@storely/memcache` (workspace:^)
- `@storely/etcd` (workspace:^)
- `@storely/valkey` (workspace:^)
- `@storely/keydb` (workspace:^)
- `@storely/dynamo` (workspace:^)
- `@storely/rocksdb` (workspace:^)

`@keyv/redis` is already a dep, used by keydb's competitive cell.

`pnpm install` updates the lockfile. The deps install during `pnpm install --frozen-lockfile` in CI without further action.

## Validation

### Local validation flow

```bash
pnpm test:services:start    # brings up all docker services
pnpm install                # picks up new deps
pnpm build                  # builds the new @storely deps the bench imports
```

**Per-backend smoke tests** (each verifies the factory wires up):

```bash
pnpm bench --backend=memcache --suite=crud --mode=defaults --skip-docs
pnpm bench --backend=etcd     --suite=crud --mode=defaults --skip-docs
pnpm bench --backend=valkey   --suite=crud --mode=defaults --skip-docs
pnpm bench --backend=keydb    --suite=crud --mode=defaults --skip-docs
pnpm bench --backend=dynamo   --suite=crud --mode=defaults --skip-docs
pnpm bench --backend=rocksdb  --suite=crud --mode=defaults --skip-docs
```

For each: confirm the per-run JSON in `benchmarks/results/` has the expected library count (3 for the four competitive backends, 1 for dynamo and rocksdb), and the `hz` values fall inside the sanity bands documented in `benchmarks/README.md` (see below).

**Full sweep**:

```bash
pnpm bench                                         # writes per-run JSON; regenerates docs page
pnpm --filter @storely/benchmarks merge -- --in=results/<latest>.json --skip-docs
pnpm --filter @storely/benchmarks gate -- --promote
git add benchmarks/baseline.json benchmarks/results/merged-*.{json,md} website/site/docs/benchmarks.md
```

### Acceptance criteria

1. `pnpm bench` (full sweep) completes without thrown errors. Backends whose services aren't available fall through their `available()` check cleanly; the run continues.
2. The new merged JSON contains rows for all backends that were available at run-time. Total backends in the registry: 12 (memory + 11 storage adapters). Total expected storely cells: ~360 = current 210 plus ~150 from the 6 new backends (each contributes ~15 ops × 2 modes × 1–3 value sizes depending on op).
3. `website/site/docs/benchmarks.md` regenerates and contains 12 backend sections, conditional on availability: memory, sqlite, redis, mysql, postgres, mongo, memcache, etcd, valkey, keydb, dynamo, rocksdb. Backends whose `available()` returned `false` are absent from the page; this is the existing convention.
4. `pnpm gate` passes against the freshly promoted baseline (sanity check of the gate's logic on the wider data).
5. Storely-only backends render correctly: the markdown report shows just the storely column for those rows, no `undefined` placeholders, no broken table.
6. CI workflow's `bench-gate` job completes within its timeout (see Risks).

## Files to touch

**New files (6):**

- `benchmarks/src/backends/memcache.ts`
- `benchmarks/src/backends/etcd.ts`
- `benchmarks/src/backends/valkey.ts`
- `benchmarks/src/backends/keydb.ts`
- `benchmarks/src/backends/dynamo.ts`
- `benchmarks/src/backends/rocksdb.ts`

**Modified files (5):**

- `benchmarks/src/backends/index.ts` — register the 6 new factories in the `allBackends` array.
- `benchmarks/src/types.ts` — extend the `BackendName` union with the 6 new names.
- `benchmarks/package.json` — add the 9 new deps listed in the Architecture section.
- `benchmarks/README.md` — extend the "Sanity bands" table with the 6 new backends:
  - memcache `get` 10k–100k ops/s
  - etcd `get` 100–2k ops/s (etcd's per-op cost is dominated by Raft)
  - valkey `get` 1k–3k ops/s (redis-protocol over TCP, similar shape to redis)
  - keydb `get` 1k–3k ops/s
  - dynamo `get` 100–2k ops/s (HTTP API, even Local)
  - rocksdb `get` 50k–500k ops/s (embedded LSM)
- `.github/workflows/ci.yml` — bump `bench-gate.timeout-minutes` from 45 to 120. The full sweep grows from ~60–90 min to ~90–135 min with the new backends.

**Generated / replaced (3):**

- `benchmarks/baseline.json` — promoted from the new full-sweep run; grows from 210 to ~360 storely cells.
- `benchmarks/results/merged-<timestamp>.{json,md}` — new merged baseline; previous one is replaced (same pattern as commit `978e4f4`).
- `website/site/docs/benchmarks.md` — auto-regenerated by `pnpm bench`.

## Risks and mitigations

- **DynamoDB Local port collision** with the user's `sms-gateway-api` on port 8000. The factory's `available()` returns `false` on TCP probe failure, so `pnpm bench` skips dynamo gracefully. Locally, dynamo numbers won't appear without freeing the port. Documented in `benchmarks/README.md` under the dynamo sanity band.
- **rocksdb tmp-dir accumulation**: each run creates `os.tmpdir()/storely-bench-rocksdb-XXX` via `mkdtempSync` and does not delete it. Acceptable; documented in `benchmarks/README.md` with a one-line cleanup recipe (`rm -rf "$TMPDIR"/storely-bench-rocksdb-*`).
- **etcd library-pattern mismatch.** `@keyv/etcd` and `@storely/etcd` may use different client libraries or different API tiers (v2 vs v3, lease-based TTL vs application-managed expiry). The bench measures whatever each library actually does end-to-end; large head-to-head gaps in either direction are likely real architectural choices, not perf bugs. The bench surfaces them; this design does not adjudicate. Documented in the report's caveats section.
- **Bench wall-clock grows.** The full sweep adds 5 sweep-eligible backends out of 11. Empirically this scales linearly: 60–90 min → 90–135 min. CI's `bench-gate` timeout bumps from 45 → 120 minutes. If wall-clock becomes a concern later, sharding by backend in CI is a follow-up.
- **`@storely/dynamo` requires AWS SDK init** even against DynamoDB Local. The factory passes a fake `accessKeyId`/`secretAccessKey` because Local accepts any non-empty credentials. If the adapter throws on missing region or credentials at construction, `available()` may need to wrap the construction itself in a try/catch. Documented as a follow-up if encountered during smoke testing.
- **Embedded rocksdb opens a directory**: if two `pnpm bench --backend=rocksdb` runs collide on the same machine, `mkdtempSync` produces unique paths so they don't share state. Single-run safety is enough.
- **Out-of-tree storely adapters** (any `@storely/*` not in this monorepo) aren't affected; the registry is closed.

## Out of scope (deliberately deferred)

- Authoring `@keyv/dynamodb` or `@keyv/rocksdb` to give those backends competitive rows. Keyv's ecosystem is what it is; if those adapters land later, this design's storely-only rows can be upgraded to competitive trivially.
- Shorten or shard the bench wall-clock for CI. Bumping the timeout is the minimum-viable response.
- Make the regression gate aware of "storely-only" cells differently. The gate compares storely-to-baseline, which works the same whether or not competitor rows exist.
- Add per-adapter README perf snippets. Once the docs page is regenerated, the data is centralized there.
- Replace `benchmark.js` deferred-async with a tighter timing harness. That's a separate methodology decision.
