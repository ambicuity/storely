# Benchmark Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 6 unmeasured `@storely/*` storage adapters (memcache, etcd, valkey, keydb, dynamo, rocksdb) to the competitive benchmark suite and regenerate `website/site/docs/benchmarks.md` from the resulting full sweep.

**Architecture:** One new `BackendFactory` file per adapter under `benchmarks/src/backends/`, each implementing `available()` (TCP probe for network backends, module-load probe for embedded rocksdb) and `build(mode)` (returns `BenchClient[]` — three for competitive backends, one for storely-only). Wire each into `benchmarks/src/backends/index.ts` and extend `BackendName` in `benchmarks/src/types.ts`. Final task runs the full sweep, regenerates the docs page, promotes `baseline.json`.

**Tech Stack:** TypeScript, pnpm workspaces, benchmark.js, tsx, Vitest, Docker (test services), `@redis/client`, `@keyv/{memcache,etcd,valkey,redis}`, `@storely/{memcache,etcd,valkey,keydb,dynamo,rocksdb}`, RocksDB native binding, AWS SDK v3 (DynamoDB Local).

**Spec:** `docs/superpowers/specs/2026-05-09-bench-coverage-design.md`

---

## File Structure

```
benchmarks/src/backends/
  memcache.ts                              — new: competitive (storely + keyv + cm)
  etcd.ts                                  — new: competitive
  valkey.ts                                — new: competitive
  keydb.ts                                 — new: competitive (keyv side via @keyv/redis on keydb's port)
  dynamo.ts                                — new: storely-only
  rocksdb.ts                               — new: storely-only, embedded
  index.ts                                 — modify: register the 6 new factories
benchmarks/src/
  types.ts                                 — modify: extend BackendName union
benchmarks/
  package.json                             — modify: add 3 @keyv deps + 6 @storely deps
  README.md                                — modify: extend Sanity bands table with 6 new rows
.github/workflows/
  ci.yml                                   — modify: bump bench-gate timeout-minutes 45 → 120
benchmarks/
  baseline.json                            — replace: post-sweep snapshot (gate --promote)
benchmarks/results/
  merged-<new-timestamp>.{json,md}         — new: full-sweep merged baseline
website/site/docs/
  benchmarks.md                            — regenerate via `pnpm bench` (no --skip-docs)
```

**Branch:** stay on `benchmark-supremacy` (current). All commits land sequentially. Each task ends in a working, testable state.

**Reference commands:**
- Smoke a backend: `pnpm bench --backend=<name> --suite=crud --mode=defaults --skip-docs`
- Full sweep: `pnpm bench` (regenerates docs page automatically)
- Gate: `pnpm --filter @storely/benchmarks gate`
- Promote baseline: `pnpm --filter @storely/benchmarks gate -- --promote`
- Services up: `pnpm test:services:start`

---

## Phase 0 — Setup

### Task 0: Add dependencies and verify resolution

**Files:**
- Modify: `benchmarks/package.json`

The 6 storely workspace deps and 3 keyv npm deps must resolve before any factory file can import them.

- [ ] **Step 1: Add the 9 new deps to `benchmarks/package.json`**

Locate the `dependencies` block. Add these entries alphabetically:

```jsonc
"@keyv/etcd": "^2.1.1",
"@keyv/memcache": "^2.0.2",
"@keyv/valkey": "^1.0.11",
"@storely/dynamo": "workspace:^",
"@storely/etcd": "workspace:^",
"@storely/keydb": "workspace:^",
"@storely/memcache": "workspace:^",
"@storely/rocksdb": "workspace:^",
"@storely/valkey": "workspace:^"
```

`@keyv/redis`, `@storely/redis`, etc. are already present and stay unchanged.

- [ ] **Step 2: Run pnpm install**

Run: `pnpm install`
Expected: lockfile updates; no errors. New `@keyv/*` versions are resolved from npm; `@storely/*` resolve from the workspace.

- [ ] **Step 3: Verify resolution**

Run: `ls benchmarks/node_modules/@keyv/ benchmarks/node_modules/@storely/ | sort -u`
Expected: each of `etcd`, `memcache`, `valkey` appear under `@keyv/`; each of `dynamo`, `etcd`, `keydb`, `memcache`, `rocksdb`, `valkey` appear under `@storely/`.

- [ ] **Step 4: Build the new workspace deps so the bench can import them**

Run: `pnpm -F @storely/memcache -F @storely/etcd -F @storely/valkey -F @storely/keydb -F @storely/dynamo -F @storely/rocksdb build`
Expected: each package reports `Build complete`. No errors.

- [ ] **Step 5: Commit**

```bash
git add benchmarks/package.json pnpm-lock.yaml
git commit -m "benchmarks - chore: add @keyv/{memcache,etcd,valkey} and @storely workspace deps"
```

---

## Phase 1 — Backend factories (one task per adapter)

Each task in this phase: extend `BackendName`, create the factory file, register in the index, smoke-test via a targeted `pnpm bench` run, commit. After each task the registry has one more entry and the bench can be invoked with `--backend=<name>` to exercise that backend in isolation.

### Task 1: memcache backend (competitive)

**Files:**
- Create: `benchmarks/src/backends/memcache.ts`
- Modify: `benchmarks/src/backends/index.ts`
- Modify: `benchmarks/src/types.ts`

- [ ] **Step 1: Extend `BackendName` in `benchmarks/src/types.ts`**

Replace the existing union (lines 3-9):

```typescript
export type BackendName =
	| "memory"
	| "redis"
	| "sqlite"
	| "mysql"
	| "postgres"
	| "mongo"
	| "memcache";
```

- [ ] **Step 2: Create the factory file**

Write `benchmarks/src/backends/memcache.ts`:

```typescript
import KeyvMemcache from "@keyv/memcache";
import StorelyMemcache from "@storely/memcache";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const MEMCACHE_URI = process.env.MEMCACHE_URI ?? "localhost:11211";

export const memcacheBackend: BackendFactory = {
	name: "memcache",
	async available() {
		return await probeTcp("localhost", 11211);
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({ mode, store: new StorelyMemcache(MEMCACHE_URI) }),
			buildKeyvClient({ mode, store: new KeyvMemcache(MEMCACHE_URI) }),
			buildCacheManagerClient({ mode, store: new KeyvMemcache(MEMCACHE_URI) }),
		];
	},
};
```

- [ ] **Step 3: Register in the index**

Edit `benchmarks/src/backends/index.ts`. Add the import and the array entry:

```typescript
import type { BackendFactory } from "../types.js";
import { memcacheBackend } from "./memcache.js";
import { memoryBackend } from "./memory.js";
import { mongoBackend } from "./mongo.js";
import { mysqlBackend } from "./mysql.js";
import { postgresBackend } from "./postgres.js";
import { redisBackend } from "./redis.js";
import { sqliteBackend } from "./sqlite.js";

export const allBackends: BackendFactory[] = [
	memoryBackend,
	redisBackend,
	sqliteBackend,
	mysqlBackend,
	postgresBackend,
	mongoBackend,
	memcacheBackend,
];
```

- [ ] **Step 4: Smoke-test the new backend**

Run:

```bash
pnpm test:services:start  # if not already running
pnpm bench --backend=memcache --suite=crud --mode=defaults --skip-docs
```

Expected:
- Console prints `[memcache/defaults] get value=32B` (and similar lines for has/set/delete at three value sizes).
- Each cell prints three rows: `storely`, `keyv`, `cache-manager`.
- A new `benchmarks/results/<timestamp>.json` is written.
- Process exits 0.

If the service isn't reachable on port 11211, the run prints `[memcache] backend not available, skipping` and exits 0 (this is the expected fall-through; not a smoke-test pass).

- [ ] **Step 5: Verify the result JSON shape**

Run:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const dir = 'benchmarks/results';
const files = fs.readdirSync(dir).filter(f => !f.startsWith('merged-') && f.endsWith('.json')).map(f => ({f, m: fs.statSync(path.join(dir, f)).mtimeMs})).sort((a,b) => b.m - a.m);
const data = JSON.parse(fs.readFileSync(path.join(dir, files[0].f), 'utf8'));
const memRows = data.rows.filter(r => r.backend === 'memcache' && r.mode === 'defaults' && r.operation === 'get' && r.valueSize === 32);
console.log('memcache get 32B defaults rows:', memRows.length, 'libraries:', memRows.map(r => r.library).sort().join(','));
"
```

Expected: `memcache get 32B defaults rows: 3 libraries: cache-manager,keyv,storely`.

- [ ] **Step 6: Commit**

```bash
git add benchmarks/src/types.ts benchmarks/src/backends/memcache.ts benchmarks/src/backends/index.ts
git commit -m "benchmarks - feat: add memcache backend (competitive: storely + keyv + cache-manager)"
```

---

### Task 2: etcd backend (competitive)

**Files:**
- Create: `benchmarks/src/backends/etcd.ts`
- Modify: `benchmarks/src/backends/index.ts`
- Modify: `benchmarks/src/types.ts`

- [ ] **Step 1: Extend `BackendName`**

Replace the existing union in `benchmarks/src/types.ts` lines 3-10 with:

```typescript
export type BackendName =
	| "memory"
	| "redis"
	| "sqlite"
	| "mysql"
	| "postgres"
	| "mongo"
	| "memcache"
	| "etcd";
```

- [ ] **Step 2: Create the factory file**

Write `benchmarks/src/backends/etcd.ts`:

```typescript
import KeyvEtcd from "@keyv/etcd";
import StorelyEtcd from "@storely/etcd";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const ETCD_URI_HOST = process.env.ETCD_HOST ?? "127.0.0.1";
const ETCD_URI_PORT = Number(process.env.ETCD_PORT ?? 2379);
const ETCD_STORELY_URI = `etcd://${ETCD_URI_HOST}:${ETCD_URI_PORT}`;
const ETCD_KEYV_URI = `${ETCD_URI_HOST}:${ETCD_URI_PORT}`;

export const etcdBackend: BackendFactory = {
	name: "etcd",
	async available() {
		return await probeTcp(ETCD_URI_HOST, ETCD_URI_PORT);
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({
				mode,
				store: new StorelyEtcd({ uri: ETCD_STORELY_URI, busyTimeout: 3000 }),
			}),
			buildKeyvClient({ mode, store: new KeyvEtcd(ETCD_KEYV_URI) }),
			buildCacheManagerClient({ mode, store: new KeyvEtcd(ETCD_KEYV_URI) }),
		];
	},
};
```

- [ ] **Step 3: Register in the index**

Edit `benchmarks/src/backends/index.ts`. Add the import alphabetically and the array entry:

```typescript
import type { BackendFactory } from "../types.js";
import { etcdBackend } from "./etcd.js";
import { memcacheBackend } from "./memcache.js";
import { memoryBackend } from "./memory.js";
import { mongoBackend } from "./mongo.js";
import { mysqlBackend } from "./mysql.js";
import { postgresBackend } from "./postgres.js";
import { redisBackend } from "./redis.js";
import { sqliteBackend } from "./sqlite.js";

export const allBackends: BackendFactory[] = [
	memoryBackend,
	redisBackend,
	sqliteBackend,
	mysqlBackend,
	postgresBackend,
	mongoBackend,
	memcacheBackend,
	etcdBackend,
];
```

- [ ] **Step 4: Smoke-test the new backend**

Run: `pnpm bench --backend=etcd --suite=crud --mode=defaults --skip-docs`
Expected: `[etcd/defaults] get value=32B` cycles run; three library rows per cell; result JSON written; process exits 0.

- [ ] **Step 5: Verify the result JSON shape**

Run:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const dir = 'benchmarks/results';
const files = fs.readdirSync(dir).filter(f => !f.startsWith('merged-') && f.endsWith('.json')).map(f => ({f, m: fs.statSync(path.join(dir, f)).mtimeMs})).sort((a,b) => b.m - a.m);
const data = JSON.parse(fs.readFileSync(path.join(dir, files[0].f), 'utf8'));
const rows = data.rows.filter(r => r.backend === 'etcd' && r.mode === 'defaults' && r.operation === 'get' && r.valueSize === 32);
console.log('etcd get 32B defaults rows:', rows.length, 'libraries:', rows.map(r => r.library).sort().join(','));
"
```

Expected: `etcd get 32B defaults rows: 3 libraries: cache-manager,keyv,storely`.

- [ ] **Step 6: Commit**

```bash
git add benchmarks/src/types.ts benchmarks/src/backends/etcd.ts benchmarks/src/backends/index.ts
git commit -m "benchmarks - feat: add etcd backend (competitive: storely + keyv + cache-manager)"
```

---

### Task 3: valkey backend (competitive)

**Files:**
- Create: `benchmarks/src/backends/valkey.ts`
- Modify: `benchmarks/src/backends/index.ts`
- Modify: `benchmarks/src/types.ts`

- [ ] **Step 1: Extend `BackendName`**

Replace the union in `benchmarks/src/types.ts` lines 3-11 with:

```typescript
export type BackendName =
	| "memory"
	| "redis"
	| "sqlite"
	| "mysql"
	| "postgres"
	| "mongo"
	| "memcache"
	| "etcd"
	| "valkey";
```

- [ ] **Step 2: Create the factory file**

Write `benchmarks/src/backends/valkey.ts`:

```typescript
import KeyvValkey from "@keyv/valkey";
import StorelyValkey from "@storely/valkey";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const VALKEY_HOST = process.env.VALKEY_HOST ?? "127.0.0.1";
const VALKEY_PORT = Number(process.env.VALKEY_PORT ?? 6370);
const VALKEY_URI = `redis://${VALKEY_HOST}:${VALKEY_PORT}`;

export const valkeyBackend: BackendFactory = {
	name: "valkey",
	async available() {
		return await probeTcp(VALKEY_HOST, VALKEY_PORT);
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({ mode, store: new StorelyValkey(VALKEY_URI) }),
			buildKeyvClient({ mode, store: new KeyvValkey(VALKEY_URI) }),
			buildCacheManagerClient({ mode, store: new KeyvValkey(VALKEY_URI) }),
		];
	},
};
```

- [ ] **Step 3: Register in the index**

Edit `benchmarks/src/backends/index.ts`. Add the import and array entry:

```typescript
import type { BackendFactory } from "../types.js";
import { etcdBackend } from "./etcd.js";
import { memcacheBackend } from "./memcache.js";
import { memoryBackend } from "./memory.js";
import { mongoBackend } from "./mongo.js";
import { mysqlBackend } from "./mysql.js";
import { postgresBackend } from "./postgres.js";
import { redisBackend } from "./redis.js";
import { sqliteBackend } from "./sqlite.js";
import { valkeyBackend } from "./valkey.js";

export const allBackends: BackendFactory[] = [
	memoryBackend,
	redisBackend,
	sqliteBackend,
	mysqlBackend,
	postgresBackend,
	mongoBackend,
	memcacheBackend,
	etcdBackend,
	valkeyBackend,
];
```

- [ ] **Step 4: Smoke-test**

Run: `pnpm bench --backend=valkey --suite=crud --mode=defaults --skip-docs`
Expected: cycles run; three library rows per cell; result JSON written.

- [ ] **Step 5: Verify the result JSON shape**

Run:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const dir = 'benchmarks/results';
const files = fs.readdirSync(dir).filter(f => !f.startsWith('merged-') && f.endsWith('.json')).map(f => ({f, m: fs.statSync(path.join(dir, f)).mtimeMs})).sort((a,b) => b.m - a.m);
const data = JSON.parse(fs.readFileSync(path.join(dir, files[0].f), 'utf8'));
const rows = data.rows.filter(r => r.backend === 'valkey' && r.mode === 'defaults' && r.operation === 'get' && r.valueSize === 32);
console.log('valkey get 32B defaults rows:', rows.length, 'libraries:', rows.map(r => r.library).sort().join(','));
"
```

Expected: `valkey get 32B defaults rows: 3 libraries: cache-manager,keyv,storely`.

- [ ] **Step 6: Commit**

```bash
git add benchmarks/src/types.ts benchmarks/src/backends/valkey.ts benchmarks/src/backends/index.ts
git commit -m "benchmarks - feat: add valkey backend (competitive: storely + keyv + cache-manager)"
```

---

### Task 4: keydb backend (competitive via @keyv/redis)

**Files:**
- Create: `benchmarks/src/backends/keydb.ts`
- Modify: `benchmarks/src/backends/index.ts`
- Modify: `benchmarks/src/types.ts`

- [ ] **Step 1: Extend `BackendName`**

Replace the union with:

```typescript
export type BackendName =
	| "memory"
	| "redis"
	| "sqlite"
	| "mysql"
	| "postgres"
	| "mongo"
	| "memcache"
	| "etcd"
	| "valkey"
	| "keydb";
```

- [ ] **Step 2: Create the factory file**

Write `benchmarks/src/backends/keydb.ts`:

```typescript
import KeyvRedis from "@keyv/redis";
import StorelyKeyDB from "@storely/keydb";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

// KeyDB is a redis-protocol fork. Storely uses @storely/keydb; the keyv side
// reuses @keyv/redis pointed at the keydb port. Bench labels the row "keydb"
// (per the factory's name) so it stays distinguishable from the existing
// "redis" row even though the keyv-side library is the same.
const KEYDB_HOST = process.env.KEYDB_HOST ?? "127.0.0.1";
const KEYDB_PORT = Number(process.env.KEYDB_PORT ?? 6378);
const KEYDB_URI = `redis://${KEYDB_HOST}:${KEYDB_PORT}`;

export const keydbBackend: BackendFactory = {
	name: "keydb",
	async available() {
		return await probeTcp(KEYDB_HOST, KEYDB_PORT);
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({ mode, store: new StorelyKeyDB(KEYDB_URI) }),
			buildKeyvClient({ mode, store: new KeyvRedis(KEYDB_URI) }),
			buildCacheManagerClient({ mode, store: new KeyvRedis(KEYDB_URI) }),
		];
	},
};
```

- [ ] **Step 3: Register in the index**

Edit `benchmarks/src/backends/index.ts`:

```typescript
import type { BackendFactory } from "../types.js";
import { etcdBackend } from "./etcd.js";
import { keydbBackend } from "./keydb.js";
import { memcacheBackend } from "./memcache.js";
import { memoryBackend } from "./memory.js";
import { mongoBackend } from "./mongo.js";
import { mysqlBackend } from "./mysql.js";
import { postgresBackend } from "./postgres.js";
import { redisBackend } from "./redis.js";
import { sqliteBackend } from "./sqlite.js";
import { valkeyBackend } from "./valkey.js";

export const allBackends: BackendFactory[] = [
	memoryBackend,
	redisBackend,
	sqliteBackend,
	mysqlBackend,
	postgresBackend,
	mongoBackend,
	memcacheBackend,
	etcdBackend,
	valkeyBackend,
	keydbBackend,
];
```

- [ ] **Step 4: Smoke-test**

Run: `pnpm bench --backend=keydb --suite=crud --mode=defaults --skip-docs`
Expected: cycles run; three library rows per cell.

- [ ] **Step 5: Verify the result JSON shape**

Run:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const dir = 'benchmarks/results';
const files = fs.readdirSync(dir).filter(f => !f.startsWith('merged-') && f.endsWith('.json')).map(f => ({f, m: fs.statSync(path.join(dir, f)).mtimeMs})).sort((a,b) => b.m - a.m);
const data = JSON.parse(fs.readFileSync(path.join(dir, files[0].f), 'utf8'));
const rows = data.rows.filter(r => r.backend === 'keydb' && r.mode === 'defaults' && r.operation === 'get' && r.valueSize === 32);
console.log('keydb get 32B defaults rows:', rows.length, 'libraries:', rows.map(r => r.library).sort().join(','));
"
```

Expected: `keydb get 32B defaults rows: 3 libraries: cache-manager,keyv,storely`.

- [ ] **Step 6: Commit**

```bash
git add benchmarks/src/types.ts benchmarks/src/backends/keydb.ts benchmarks/src/backends/index.ts
git commit -m "benchmarks - feat: add keydb backend (competitive: storely + keyv-via-redis + cache-manager)"
```

---

### Task 5: dynamo backend (storely-only)

**Files:**
- Create: `benchmarks/src/backends/dynamo.ts`
- Modify: `benchmarks/src/backends/index.ts`
- Modify: `benchmarks/src/types.ts`

- [ ] **Step 1: Extend `BackendName`**

Replace the union with:

```typescript
export type BackendName =
	| "memory"
	| "redis"
	| "sqlite"
	| "mysql"
	| "postgres"
	| "mongo"
	| "memcache"
	| "etcd"
	| "valkey"
	| "keydb"
	| "dynamo";
```

- [ ] **Step 2: Create the factory file**

Write `benchmarks/src/backends/dynamo.ts`:

```typescript
import StorelyDynamo from "@storely/dynamo";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

// DynamoDB Local listens on port 8000 by default. There is no @keyv/dynamodb
// on npm at time of writing, so this row is storely-only — the bench's
// markdown/json reporters render single-library cells correctly.
//
// If port 8000 is taken by an unrelated process (e.g. a local dev server),
// available() returns false and the bench skips this backend gracefully.
const DYNAMO_ENDPOINT = process.env.DYNAMO_ENDPOINT ?? "http://localhost:8000";
const DYNAMO_TABLE = process.env.DYNAMO_TABLE ?? "storely_bench";

export const dynamoBackend: BackendFactory = {
	name: "dynamo",
	async available() {
		const url = new URL(DYNAMO_ENDPOINT);
		return await probeTcp(url.hostname, Number(url.port || 8000));
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		const store = new StorelyDynamo({
			endpoint: DYNAMO_ENDPOINT,
			region: "local",
			tableName: DYNAMO_TABLE,
			credentials: { accessKeyId: "x", secretAccessKey: "x" },
		});
		return [buildStorelyClient({ mode, store })];
	},
};
```

- [ ] **Step 3: Register in the index**

Edit `benchmarks/src/backends/index.ts`:

```typescript
import type { BackendFactory } from "../types.js";
import { dynamoBackend } from "./dynamo.js";
import { etcdBackend } from "./etcd.js";
import { keydbBackend } from "./keydb.js";
import { memcacheBackend } from "./memcache.js";
import { memoryBackend } from "./memory.js";
import { mongoBackend } from "./mongo.js";
import { mysqlBackend } from "./mysql.js";
import { postgresBackend } from "./postgres.js";
import { redisBackend } from "./redis.js";
import { sqliteBackend } from "./sqlite.js";
import { valkeyBackend } from "./valkey.js";

export const allBackends: BackendFactory[] = [
	memoryBackend,
	redisBackend,
	sqliteBackend,
	mysqlBackend,
	postgresBackend,
	mongoBackend,
	memcacheBackend,
	etcdBackend,
	valkeyBackend,
	keydbBackend,
	dynamoBackend,
];
```

- [ ] **Step 4: Smoke-test**

Run: `pnpm bench --backend=dynamo --suite=crud --mode=defaults --skip-docs`

Expected one of two outcomes:
- **DynamoDB Local reachable on port 8000:** cycles run; **one library row per cell** (just `storely`); result JSON written.
- **Port 8000 in use by another process:** bench prints `[dynamo] backend not available, skipping` and exits 0. To exercise dynamo, free port 8000 and re-run.

- [ ] **Step 5: Verify the result JSON shape (when reachable)**

Run:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const dir = 'benchmarks/results';
const files = fs.readdirSync(dir).filter(f => !f.startsWith('merged-') && f.endsWith('.json')).map(f => ({f, m: fs.statSync(path.join(dir, f)).mtimeMs})).sort((a,b) => b.m - a.m);
const data = JSON.parse(fs.readFileSync(path.join(dir, files[0].f), 'utf8'));
const rows = data.rows.filter(r => r.backend === 'dynamo' && r.mode === 'defaults' && r.operation === 'get' && r.valueSize === 32);
console.log('dynamo get 32B defaults rows:', rows.length, 'libraries:', rows.map(r => r.library).sort().join(','));
"
```

Expected (when reachable): `dynamo get 32B defaults rows: 1 libraries: storely`. If dynamo was skipped for unavailability, this command prints `dynamo get 32B defaults rows: 0 libraries:` — that's also acceptable for this task; the wiring is verified by the no-error exit.

- [ ] **Step 6: Commit**

```bash
git add benchmarks/src/types.ts benchmarks/src/backends/dynamo.ts benchmarks/src/backends/index.ts
git commit -m "benchmarks - feat: add dynamo backend (storely-only; no @keyv/dynamodb on npm)"
```

---

### Task 6: rocksdb backend (storely-only, embedded)

**Files:**
- Create: `benchmarks/src/backends/rocksdb.ts`
- Modify: `benchmarks/src/backends/index.ts`
- Modify: `benchmarks/src/types.ts`

- [ ] **Step 1: Extend `BackendName`**

Replace the union with:

```typescript
export type BackendName =
	| "memory"
	| "redis"
	| "sqlite"
	| "mysql"
	| "postgres"
	| "mongo"
	| "memcache"
	| "etcd"
	| "valkey"
	| "keydb"
	| "dynamo"
	| "rocksdb";
```

- [ ] **Step 2: Create the factory file**

Write `benchmarks/src/backends/rocksdb.ts`:

```typescript
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildStorelyClient } from "../libraries/storely.js";

// RocksDB is embedded — no Docker service. available() probes module load:
// if @storely/rocksdb's native binding fails to load on this platform/node
// version, the import throws and the bench skips this backend.
//
// build() creates a fresh tmp directory per run via mkdtempSync, so back-
// to-back invocations don't fight over the same DB file. The directory is
// not deleted automatically — see benchmarks/README.md for the cleanup
// recipe.
export const rocksdbBackend: BackendFactory = {
	name: "rocksdb",
	async available() {
		try {
			await import("@storely/rocksdb");
			return true;
		} catch {
			return false;
		}
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		const StorelyRocksDB = (await import("@storely/rocksdb")).default;
		const dir = mkdtempSync(join(tmpdir(), "storely-bench-rocksdb-"));
		const store = new StorelyRocksDB({ uri: `rocksdb://${dir}` });
		return [buildStorelyClient({ mode, store })];
	},
};
```

- [ ] **Step 3: Register in the index**

Edit `benchmarks/src/backends/index.ts`:

```typescript
import type { BackendFactory } from "../types.js";
import { dynamoBackend } from "./dynamo.js";
import { etcdBackend } from "./etcd.js";
import { keydbBackend } from "./keydb.js";
import { memcacheBackend } from "./memcache.js";
import { memoryBackend } from "./memory.js";
import { mongoBackend } from "./mongo.js";
import { mysqlBackend } from "./mysql.js";
import { postgresBackend } from "./postgres.js";
import { redisBackend } from "./redis.js";
import { rocksdbBackend } from "./rocksdb.js";
import { sqliteBackend } from "./sqlite.js";
import { valkeyBackend } from "./valkey.js";

export const allBackends: BackendFactory[] = [
	memoryBackend,
	redisBackend,
	sqliteBackend,
	mysqlBackend,
	postgresBackend,
	mongoBackend,
	memcacheBackend,
	etcdBackend,
	valkeyBackend,
	keydbBackend,
	dynamoBackend,
	rocksdbBackend,
];
```

- [ ] **Step 4: Smoke-test**

Run: `pnpm bench --backend=rocksdb --suite=crud --mode=defaults --skip-docs`
Expected: cycles run; **one library row per cell** (just `storely`); a fresh directory `$TMPDIR/storely-bench-rocksdb-XXXXXX` is created (do not assert path; the suffix is random).

- [ ] **Step 5: Verify the result JSON shape**

Run:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const dir = 'benchmarks/results';
const files = fs.readdirSync(dir).filter(f => !f.startsWith('merged-') && f.endsWith('.json')).map(f => ({f, m: fs.statSync(path.join(dir, f)).mtimeMs})).sort((a,b) => b.m - a.m);
const data = JSON.parse(fs.readFileSync(path.join(dir, files[0].f), 'utf8'));
const rows = data.rows.filter(r => r.backend === 'rocksdb' && r.mode === 'defaults' && r.operation === 'get' && r.valueSize === 32);
console.log('rocksdb get 32B defaults rows:', rows.length, 'libraries:', rows.map(r => r.library).sort().join(','));
"
```

Expected: `rocksdb get 32B defaults rows: 1 libraries: storely`.

- [ ] **Step 6: Commit**

```bash
git add benchmarks/src/types.ts benchmarks/src/backends/rocksdb.ts benchmarks/src/backends/index.ts
git commit -m "benchmarks - feat: add rocksdb backend (storely-only, embedded; no @keyv/rocksdb on npm)"
```

---

## Phase 2 — Documentation & CI

### Task 7: Extend the README sanity bands

**Files:**
- Modify: `benchmarks/README.md`

- [ ] **Step 1: Locate the existing sanity-bands table**

The current table lives in the "Sanity bands" section. Grep to confirm placement:

```bash
grep -n 'Sanity bands' benchmarks/README.md
```

- [ ] **Step 2: Add 6 rows to the table**

Append these rows immediately before the closing of the sanity-bands table (after the existing `mongo (localhost) | get` row):

```markdown
| memcache (localhost) | `get` | 10k – 100k ops/s |
| etcd (localhost) | `get` | 100 – 2k ops/s (per-op cost dominated by Raft) |
| valkey (localhost) | `get` / `set` | 1k – 3k ops/s (redis-protocol shape) |
| keydb (localhost) | `get` / `set` | 1k – 3k ops/s |
| dynamo (Local, port 8000) | `get` | 100 – 2k ops/s (HTTP API even against Local) |
| rocksdb (embedded) | `get` | 50k – 500k ops/s (LSM tree, in-process) |
```

Add a paragraph immediately after the table:

```markdown
**dynamo port collision.** DynamoDB Local listens on port 8000. If another process already binds 8000 (e.g. a local dev server), the dynamo backend's `available()` returns false and the bench skips it. Free the port and re-run to capture dynamo numbers.

**rocksdb tmp directories.** Each rocksdb bench invocation creates a fresh `$TMPDIR/storely-bench-rocksdb-XXXXXX` and does not delete it. Clean up with: `rm -rf "$TMPDIR"/storely-bench-rocksdb-*`.
```

- [ ] **Step 3: Commit**

```bash
git add benchmarks/README.md
git commit -m "benchmarks - docs: add sanity bands and caveats for the 6 new backends"
```

---

### Task 8: Bump CI bench-gate timeout

**Files:**
- Modify: `.github/workflows/ci.yml`

The full sweep grows from ~60–90 min to ~90–135 min with 6 new backends; the existing 45-minute timeout would no longer fit.

- [ ] **Step 1: Locate the bench-gate job**

```bash
grep -n 'timeout-minutes\|bench-gate' .github/workflows/ci.yml
```

The existing line is `timeout-minutes: 45` under the `bench-gate` job header.

- [ ] **Step 2: Edit the timeout**

Change the line:

```yaml
    timeout-minutes: 45
```

to:

```yaml
    # Full sweep across 12 backends × 2 modes × {crud, batch} suites.
    # Empirically ~90–135 min on GH-hosted ubuntu-latest after the bench
    # coverage expansion. Bumped from 45 to 120 in the bench-coverage PR.
    timeout-minutes: 120
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci - chore: bump bench-gate timeout to 120 min for expanded backend sweep"
```

---

## Phase 3 — Full sweep, regenerate docs, promote baseline

### Task 9: Run full sweep, regenerate docs, promote baseline

**Files:**
- Modify (replace): `benchmarks/baseline.json`
- Add: `benchmarks/results/merged-<new-timestamp>.{json,md}`
- Replace (delete + add): `benchmarks/results/merged-<previous>.{json,md}` if you want only the latest merged tracked
- Regenerate: `website/site/docs/benchmarks.md`

- [ ] **Step 1: Ensure all Docker services are up**

Run: `pnpm test:services:start`
Expected: containers start without errors. Note: if dynamo's container fails (port 8000 conflict), that's acceptable — the dynamo backend will skip gracefully.

- [ ] **Step 2: Build all workspace packages**

Run: `pnpm build`
Expected: every package reports `Build complete`. The bench imports built dists.

- [ ] **Step 3: Run the full sweep**

Run: `pnpm bench`
Expected:
- Each backend section prints (memory, sqlite, redis, mysql, postgres, mongo, memcache, etcd, valkey, keydb, dynamo or skip, rocksdb).
- A new per-run JSON is written: `benchmarks/results/<timestamp>.json` plus its `.md`.
- `website/site/docs/benchmarks.md` is regenerated.
- Process exits 0.
- Wall-clock: ~90–135 min on this machine.

- [ ] **Step 4: Generate the merged baseline JSON**

The bench writes a per-run JSON; the merge step normalises it into the tracked `merged-<timestamp>.{json,md}` shape.

```bash
LATEST=$(ls -t benchmarks/results/*.json | grep -v 'merged-' | head -1 | xargs basename)
pnpm --filter @storely/benchmarks merge -- --in=results/$LATEST --skip-docs
```

Expected: prints `Wrote /…/benchmarks/results/merged-<new-timestamp>.json` and `.md`.

- [ ] **Step 5: Promote the new run as the baseline**

```bash
pnpm --filter @storely/benchmarks gate -- --promote
```

Expected: prints `✅ Promoted /…/results/<latest>.json → /…/baseline.json`.

- [ ] **Step 6: Verify the gate passes against the freshly promoted baseline**

Simulate a fresh post-promote run by copying the baseline back into a per-run-named file:

```bash
TS=$(date -u +%Y-%m-%dT%H-%M-%S-000Z)
cp benchmarks/baseline.json "benchmarks/results/${TS}.json"
pnpm --filter @storely/benchmarks gate
rm "benchmarks/results/${TS}.json"
```

Expected: `✅ No regressions vs baseline (~360 cells checked).`

- [ ] **Step 7: Verify the docs page shows all 12 backends**

```bash
grep -E '^## Backend:' website/site/docs/benchmarks.md
```

Expected: 11 or 12 lines depending on dynamo availability:
```
## Backend: memory
## Backend: sqlite
## Backend: redis
## Backend: mysql
## Backend: postgres
## Backend: mongo
## Backend: memcache
## Backend: etcd
## Backend: valkey
## Backend: keydb
## Backend: dynamo          # only if port 8000 was free
## Backend: rocksdb
```

If dynamo is missing, that's expected and not a failure of this task; the design accepts dynamo as conditional-on-availability.

- [ ] **Step 8: Replace the previous merged baseline**

The repo convention (per commit `978e4f4`) keeps one tracked merged baseline at a time. Find and remove the previous one, add the new one and the regenerated docs page:

```bash
PREV_MERGED=$(git ls-files 'benchmarks/results/merged-*.json' | head -1)
PREV_MD=$(echo "$PREV_MERGED" | sed 's/\.json$/.md/')
NEW_MERGED=$(ls -t benchmarks/results/merged-*.json | head -1)
NEW_MD=$(echo "$NEW_MERGED" | sed 's/\.json$/.md/')

git rm "$PREV_MERGED" "$PREV_MD"
git add benchmarks/baseline.json "$NEW_MERGED" "$NEW_MD" website/site/docs/benchmarks.md
git status --short benchmarks/ website/site/docs/benchmarks.md
```

Expected git status output: deleted previous merged JSON+md, added new merged JSON+md, modified baseline.json and benchmarks.md.

- [ ] **Step 9: Clean up the per-run JSON written by Step 3**

```bash
LATEST=$(ls -t benchmarks/results/*.json | grep -v 'merged-' | head -1)
LATEST_MD=$(echo "$LATEST" | sed 's/\.json$/.md/')
rm "$LATEST" "$LATEST_MD"
```

This keeps the working tree clean — only the merged baseline + the previous tracked per-run JSONs remain.

- [ ] **Step 10: Commit**

```bash
git commit -m "benchmarks - test: full sweep with 6 new backends; regenerate docs page; promote baseline"
```

The commit message body should also include the headline numbers from the new docs page if any cell shifted >25% from the prior baseline (which would have been the storely-only baseline limited to 6 backends). This is informational and helps reviewers understand the diff size.

---

## Final verification

- [ ] Run `pnpm test` (full monorepo). Expected: same pass/fail profile as before this branch (the bench changes don't touch adapter code).
- [ ] Run `biome check`. Expected: clean.
- [ ] Confirm the new merged baseline contains all available backends.
- [ ] Confirm `website/site/docs/benchmarks.md` renders the new sections (eyeball the file for table integrity — no truncated rows, no duplicate sections).
- [ ] Confirm `benchmarks/baseline.json` has ~360 storely cells (`jq '[.rows[] | select(.library=="storely")] | length' benchmarks/baseline.json`).

---

## Self-review summary

- **Spec coverage**: every section in `2026-05-09-bench-coverage-design.md` maps to a task. Architecture §1 (factories) → Tasks 1–6. Architecture §2 (wiring) → embedded in each of Tasks 1–6. Architecture §3 (deps) → Task 0. Validation flow → Task 9. Files-to-touch list → Tasks 0, 7, 8, 9. Risks → Tasks 7 and 8 (sanity bands paragraph + CI timeout). Out-of-scope items remain out-of-scope.
- **Placeholder scan**: each task's code is complete. Smoke-test commands, expected outputs, and commit messages are concrete.
- **Type consistency**: `BackendName` extension is incremental — each task adds exactly one variant in the canonical order. `BackendFactory.name` matches the union value 1:1. `buildStorelyClient`/`buildKeyvClient`/`buildCacheManagerClient` signatures are unchanged from the existing redis backend.
- **Granularity**: 10 tasks, each 4–10 minutes (most are 6 steps). Each ends in a working build and a commit.
