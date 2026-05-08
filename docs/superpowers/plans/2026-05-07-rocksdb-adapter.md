# RocksDB Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `@storely/rocksdb` storage adapter that wraps `@nxtedition/rocksdb`'s `RocksLevel` class as a Storely `StorelyStorageAdapter`.

**Architecture:** The adapter mirrors the SQLite adapter pattern — embedded database, file-based or temp-directory storage, TTL via stored timestamps, lazy expiration, optional `clearExpiredInterval` timer. It bridges `AbstractLevel`'s promise-based API (`db.open()`, `db.get()`, `db.put()`, `db.del()`, `db.clear()`, `db.batch()`, `db.iterator()`, `db.getMany()`) to Storely's `StorelyStorageAdapter` interface. Namespace is handled via key prefixing with range-based `db.clear()`. No Docker needed for testing.

**Tech Stack:** TypeScript, `@nxtedition/rocksdb` (RocksLevel class extending AbstractLevel), `hookified`, `storely` (peer), `vitest`, `@storely/test-suite`

---

## File Structure

```
storage/rocksdb/
  src/
    index.ts           # StorelyRocksDB class (main adapter)
    types.ts            # StorelyRocksDBOptions, RocksDBCompression, RocksDBLogLevel, error messages
    create.ts           # Factory: createStorelyRocksDB(), createStorelyRocksDBNonBlocking()
  test/
    suite.test.ts       # @storely/test-suite compliance
    main.test.ts        # Core CRUD operations
    get.test.ts         # get/getMany tests
    set.test.ts         # set/setMany tests
    delete.test.ts      # delete/deleteMany tests
    has.test.ts         # has/hasMany tests
    iterator.test.ts    # Iterator tests
    namespace.test.ts   # Namespace isolation tests
    create-storely.test.ts  # Factory function tests
    types.test.ts       # Type definition tests
    expiration.test.ts  # TTL, lazy deletion, clearExpired, clearExpiredInterval
  package.json
  tsconfig.json
  tsdown.config.ts
  vitest.config.ts
  README.md
  LICENSE
```

---

### Task 1: Package scaffolding and configuration

**Files:**
- Create: `storage/rocksdb/package.json`
- Create: `storage/rocksdb/tsconfig.json`
- Create: `storage/rocksdb/tsdown.config.ts`
- Create: `storage/rocksdb/vitest.config.ts`
- Create: `storage/rocksdb/LICENSE`

- [x] **Step 1: Create package.json**

```json
{
	"name": "@storely/rocksdb",
	"version": "6.0.0-alpha.4",
	"description": "RocksDB storage adapter for Storely",
	"type": "module",
	"main": "./dist/index.mjs",
	"module": "./dist/index.mjs",
	"types": "./dist/index.d.mts",
	"exports": {
		".": {
			"require": {
				"types": "./dist/index.d.cts",
				"default": "./dist/index.cjs"
			},
			"import": {
				"types": "./dist/index.d.mts",
				"default": "./dist/index.mjs"
			}
		}
	},
	"scripts": {
		"build": "tsdown",
		"prepublishOnly": "pnpm build",
		"lint": "biome check --write --error-on-warnings",
		"lint:ci": "biome check --error-on-warnings",
		"test": "pnpm lint && vitest run --coverage",
		"test:ci": "pnpm lint:ci && vitest --run --sequence.setupFiles=list --coverage",
		"clean": "rimraf ./node_modules ./coverage ./dist ./test/tmp"
	},
	"keywords": [
		"rocksdb",
		"storely",
		"storage",
		"adapter",
		"key",
		"value",
		"store",
		"cache",
		"ttl",
		"embedded"
	],
	"author": "Ritesh Rana <contact@riteshrana.engineer>",
	"license": "MIT",
	"dependencies": {
		"@nxtedition/rocksdb": "^15.4.1",
		"hookified": "^2.0.0"
	},
	"peerDependencies": {
		"storely": "workspace:^"
	},
	"devDependencies": {
		"@storely/test-suite": "workspace:^"
	},
	"tsd": {
		"directory": "test"
	},
	"engines": {
		"node": ">= 18"
	},
	"files": [
		"dist",
		"LICENSE"
	]
}
```

- [x] **Step 2: Create tsconfig.json**

Copy the exact pattern from `storage/sqlite/tsconfig.json`:

```json
{
	"extends": "../../tsconfig.json",
	"compilerOptions": {
		"outDir": "./dist"
	},
	"include": ["src"]
}
```

Read `storage/sqlite/tsconfig.json` first to verify the exact format, then create the RocksDB version.

- [x] **Step 3: Create tsdown.config.ts**

Copy the exact pattern from `storage/sqlite/tsdown.config.ts`:

```typescript
import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/create.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
});
```

- [x] **Step 4: Create vitest.config.ts**

Copy the exact pattern from `storage/sqlite/vitest.config.ts`. Read it first.

- [x] **Step 5: Create LICENSE**

Copy the MIT LICENSE from `storage/sqlite/LICENSE`, replacing the year and copyright holder with `2026 Ritesh Rana`.

- [x] **Step 6: Add rocksdb workspace to root pnpm-workspace.yaml**

Read `pnpm-workspace.yaml` and verify `storage/rocksdb` would be covered by any existing glob (e.g., `storage/*`). If not, add it.

- [x] **Step 7: Install dependencies**

Run: `pnpm install`

Expected: Installation succeeds, `@nxtedition/rocksdb` native module compiles (may require `node-gyp` and C++ build tools).

- [x] **Step 8: Verify package builds**

Run: `cd storage/rocksdb && pnpm build`

Expected: Build fails because `src/` doesn't exist yet. This confirms the scaffolding is wired up correctly.

- [x] **Step 9: Commit scaffolding**

```bash
git add storage/rocksdb/package.json storage/rocksdb/tsconfig.json storage/rocksdb/tsdown.config.ts storage/rocksdb/vitest.config.ts storage/rocksdb/LICENSE pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "rocksdb - chore: scaffold package configuration"
```

---

### Task 2: Types and error messages

**Files:**
- Create: `storage/rocksdb/src/types.ts`

- [x] **Step 1: Create types.ts**

```typescript
export type RocksDBCompression = "none" | "snappy" | "zstd" | "zlib" | "bzip2";

export type RocksDBLogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "header" | null;

export type StorelyRocksDBOptions = {
	/**
	 * Connection URI for RocksDB.
	 * - `rocksdb://:memory:` for in-memory (temp directory) storage
	 * - `rocksdb:///absolute/path/to/db` for file-based storage
	 * - `rocksdb://./relative/path` for relative path storage
	 * @default 'rocksdb://:memory:'
	 */
	uri?: string;

	/**
	 * Open database in read-only mode.
	 * @default false
	 */
	readOnly?: boolean;

	/**
	 * Create database if it doesn't exist.
	 * @default true
	 */
	createIfMissing?: boolean;

	/**
	 * Throw error if database already exists.
	 * @default false
	 */
	errorIfExists?: boolean;

	/**
	 * RocksDB compression type.
	 * @default 'snappy'
	 */
	compression?: RocksDBCompression;

	/**
	 * Interval in milliseconds between automatic expired-entry cleanup runs.
	 * 0 disables automatic cleanup.
	 * @default 0
	 */
	clearExpiredInterval?: number;

	/**
	 * Number of entries to fetch per iteration batch.
	 * @default 100
	 */
	iterationLimit?: number;

	/**
	 * RocksDB log verbosity level.
	 * `null` disables logging entirely.
	 * @default 'warn'
	 */
	infoLogLevel?: RocksDBLogLevel;
};

export enum RocksDBErrorMessages {
	/**
	 * Error message when the database is not open.
	 */
	DBNotOpen = "Database is not open",
	/**
	 * Error message when the URI format is invalid.
	 */
	InvalidURI = "Invalid RocksDB URI format",
	/**
	 * Error message when the database is opened in read-only mode and a write is attempted.
	 */
	ReadOnly = "Database is opened in read-only mode",
	/**
	 * Error message when the database already exists and errorIfExists is true.
	 */
	DBExists = "Database already exists",
}
```

- [x] **Step 2: Verify types compile**

Run: `cd storage/rocksdb && npx tsc --noEmit`

Expected: Type errors may occur since other files don't exist yet. Just verify types.ts syntax is valid TypeScript.

- [x] **Step 3: Commit types**

```bash
git add storage/rocksdb/src/types.ts
git commit -m "rocksdb - feat: add type definitions and error messages"
```

---

### Task 3: Main adapter class — StorelyRocksDB

**Files:**
- Create: `storage/rocksdb/src/index.ts`

This is the largest file. It contains the full `StorelyRocksDB` class that implements `StorelyStorageAdapter`.

- [x] **Step 1: Write the failing test — suite.test.ts**

Create `storage/rocksdb/test/suite.test.ts`:

```typescript
import { storageTestSuite, storelyTestSuite } from "@storely/test-suite";
import Storely from "storely";
import StorelyRocksDB from "../src/index.js";
import { it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;

const store = () => {
	const db = new StorelyRocksDB({ uri: `rocksdb://${join(tempDir, "testdb")}` });
	return db;
};

storelyTestSuite(it, Storely, store);
storageTestSuite(it, store, { ttl: false });

beforeEach(async () => {
	tempDir = mkdtempSync(join(tmpdir(), "storely-rocksdb-test-"));
});

afterEach(async () => {
	try {
		rmSync(tempDir, { recursive: true, force: true });
	} catch {}
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd storage/rocksdb && pnpm test`

Expected: FAIL — `StorelyRocksDB` class doesn't exist yet.

- [x] **Step 3: Write the StorelyRocksDB class — storage/rocksdb/src/index.ts**

This is the core implementation. Follow the SQLite adapter pattern closely. Key implementation differences from SQLite:

1. **No SQL** — Uses `RocksLevel` API (`db.open()`, `db.get()`, `db.put()`, `db.del()`, `db.clear()`, `db.batch()`, `db.iterator()`, `db.getMany()`, `db.close()`)
2. **Not-found handling** — `db.get()` throws `LEVEL_NOT_FOUND` (ModuleError with code `'LEVEL_NOT_FOUND'`) instead of returning `undefined`. Catch this and return `undefined`.
3. **Value format** — All values stored as JSON strings: `JSON.stringify({ value, expires })`
4. **Key prefixing** — `{namespace}:{key}` format, stripped on read
5. **Range-based clear** — `db.clear({ gte, lt })` for namespace-scoped clearing
6. **Temp directory for `:memory:`** — Create a temp dir, clean up on `disconnect()`
7. **`db.getMany()`** — Returns array with `undefined` for missing keys natively
8. **Iterator** — Use `for await (const [key, value] of db.iterator({...}))` with `gte`/`lt` bounds

Write the complete `index.ts` following the SQLite adapter's structure (constructor, getters/setters, get/set/getMany/setMany/delete/deleteMany/has/hasMany/clear/iterator/clearExpired/disconnect methods). Key method implementations:

**Constructor:**
```typescript
constructor(storelyOptions?: StorelyRocksDBOptions | string) {
    super({ throwOnEmptyListeners: false });
    if (typeof storelyOptions === "string") {
        this._uri = storelyOptions;
    } else if (storelyOptions) {
        this.setOptions(storelyOptions);
    }
    // Parse URI, resolve db path, create RocksLevel instance
    const dbPath = this.resolveDbPath();
    this._db = new RocksLevel(dbPath, { createIfMissing: this._createIfMissing, errorIfExists: this._errorIfExists, readOnly: this._readOnly });
    this.ready = this._db.open().then(() => {}).catch((error) => { this.emit("error", error); throw error; });
    this.ready.catch(() => {});
    this.startClearExpiredTimer();
}
```

**get():**
```typescript
async get<Value>(key: string): Promise<Value | undefined> {
    await this.ready;
    const strippedKey = this.removeKeyPrefix(key);
    try {
        const raw = await this._db.get(strippedKey);
        if (raw === undefined) return undefined;
        const data = JSON.parse(raw as string);
        if (data.expires !== null && data.expires !== undefined && data.expires <= Date.now()) {
            await this._db.del(strippedKey);
            return undefined;
        }
        return data.value as Value;
    } catch (error) {
        if ((error as any)?.code === "LEVEL_NOT_FOUND") return undefined;
        this.emit("error", error);
        return undefined;
    }
}
```

**set():**
```typescript
async set(key: string, value: any): Promise<boolean> {
    await this.ready;
    const strippedKey = this.removeKeyPrefix(key);
    try {
        const data = { value, expires: null };
        await this._db.put(strippedKey, JSON.stringify(data));
        return true;
    } catch (error) {
        this.emit("error", error);
        return false;
    }
}
```

Wait — the SQLite adapter's `set()` extracts `expires` from the value that Storely core passes in. Storely core passes `JSON.stringify({ value, expires })` where `expires` is a timestamp. So our `set()` needs to extract `expires` from the passed value, same as SQLite does with `getExpiresFromValue()`. Let me document this properly.

**set() correctly:**
```typescript
async set(key: string, value: any): Promise<boolean> {
    await this.ready;
    const strippedKey = this.removeKeyPrefix(key);
    const expires = this.getExpiresFromValue(value);
    try {
        // value is already serialized by Storely core as JSON like {"value":"...","expires":...}
        // We store it as-is since it already contains the value and expires fields
        await this._db.put(strippedKey, typeof value === "string" ? value : JSON.stringify(value));
        return true;
    } catch (error) {
        this.emit("error", error);
        return false;
    }
}
```

Actually, looking more carefully at the SQLite adapter, Storely core passes the serialized string `{"value":"actual-data","expires":1234567890}` to `set()`. The SQLite adapter stores this string directly in the `value` column and also extracts `expires` for the `expires` column. For RocksDB, we store the entire serialized string as the value — it already contains both `value` and `expires`. No need to re-serialize.

**Key implementation notes:**

- `removeKeyPrefix(key)` — If `this._namespace` is set and key starts with `namespace:`, strip it
- `getExpiresFromValue(value)` — Parse the JSON value to extract the `expires` field (same as SQLite)
- `getNamespaceValue()` — Return `this._namespace ?? ""` (for consistency, though not used for column queries)
- `resolveDbPath()` — Parse URI, return file path or temp directory path
- `clearExpired()` — Iterate all entries, collect expired keys, batch-delete them
- `startClearExpiredTimer()` / `stopClearExpiredTimer()` — Same pattern as SQLite adapter

Write this file completely. It will be ~600-800 lines, similar to the SQLite adapter's index.ts.

- [x] **Step 4: Run tests to verify suite.test.ts passes**

Run: `cd storage/rocksdb && pnpm test`

Expected: The `@storely/test-suite` compliance tests should pass. Individual method tests don't exist yet but will be added in subsequent tasks.

- [x] **Step 5: Build the package**

Run: `cd storage/rocksdb && pnpm build`

Expected: Build succeeds, producing `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.mts`, `dist/index.d.cts`, `dist/create.mjs`, `dist/create.cjs`, `dist/create.d.mts`, `dist/create.d.cts`.

- [x] **Step 6: Commit main adapter class**

```bash
git add storage/rocksdb/src/index.ts storage/rocksdb/test/suite.test.ts
git commit -m "rocksdb - feat: implement StorelyRocksDB adapter class with test-suite compliance"
```

---

### Task 4: Factory functions — createStorelyRocksDB

**Files:**
- Create: `storage/rocksdb/src/create.ts`

- [x] **Step 1: Write the failing test — create-storely.test.ts**

```typescript
import Storely from "storely";
import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStorelyRocksDB, createStorelyRocksDBNonBlocking } from "../src/create.js";

let tempDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "storely-rocksdb-test-"));
});

afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

it("createStorelyRocksDB creates a Storely instance", (t) => {
    const storely = createStorelyRocksDB({ uri: `rocksdb://${join(tempDir, "testdb")}` });
    expect(storely).toBeInstanceOf(Storely);
});

it("createStorelyRocksDB with string URI", (t) => {
    const storely = createStorelyRocksDB(`rocksdb://${join(tempDir, "testdb")}`);
    expect(storely).toBeInstanceOf(Storely);
});

it("createStorelyRocksDBNonBlocking creates a Storely instance", (t) => {
    const storely = createStorelyRocksDBNonBlocking({ uri: `rocksdb://${join(tempDir, "testdb")}` });
    expect(storely).toBeInstanceOf(Storely);
});

it("createStorelyRocksDBNonBlocking sets throwOnErrors to false", (t) => {
    const storely = createStorelyRocksDBNonBlocking({ uri: `rocksdb://${join(tempDir, "testdb")}` });
    expect(storely.throwOnErrors).toBe(false);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd storage/rocksdb && pnpm vitest run test/create-storely.test.ts`

Expected: FAIL — import fails because `create.ts` doesn't exist yet.

- [x] **Step 3: Write create.ts**

```typescript
import { Storely } from "storely";
import StorelyRocksDB from "./index.js";
import type { StorelyRocksDBOptions } from "./types.js";

/**
 * Creates a Storely instance with the RocksDB adapter.
 * @param storelyOptions - A RocksDB connection URI string or a StorelyRocksDBOptions configuration object.
 * @returns A new Storely instance backed by RocksDB.
 */
export const createStorelyRocksDB = (storelyOptions?: StorelyRocksDBOptions | string): Storely => {
	const adapter = new StorelyRocksDB(storelyOptions);

	if (typeof storelyOptions === "object" && storelyOptions?.namespace) {
		return new Storely(adapter, { namespace: storelyOptions.namespace });
	}

	return new Storely(adapter);
};

/**
 * Creates a Storely instance with the RocksDB adapter in non-blocking mode.
 * Disables throwOnErrors and does not await the connection promise.
 * @param storelyOptions - A RocksDB connection URI string or a StorelyRocksDBOptions configuration object.
 * @returns A new Storely instance backed by RocksDB.
 */
export const createStorelyRocksDBNonBlocking = (storelyOptions?: StorelyRocksDBOptions | string): Storely => {
	const storely = createStorelyRocksDB(storelyOptions);
	const store = storely.store as StorelyRocksDB;
	store.throwOnErrors = false;
	storely.throwOnErrors = false;
	return storely;
};
```

Wait — we need `throwOnErrors` on the StorelyRocksDB class. Add it as a property (default `false`). Also re-export the types and class from index.ts.

- [x] **Step 4: Update index.ts exports at the bottom**

Add these exports to `storage/rocksdb/src/index.ts`:

```typescript
export { RocksDBErrorMessages } from "./types.js";
export type { StorelyRocksDBOptions, RocksDBCompression, RocksDBLogLevel } from "./types.js";
export { createStorelyRocksDB, createStorelyRocksDBNonBlocking } from "./create.js";
```

- [x] **Step 5: Run tests to verify they pass**

Run: `cd storage/rocksdb && pnpm vitest run test/create-storely.test.ts`

Expected: PASS

- [x] **Step 6: Commit factory functions**

```bash
git add storage/rocksdb/src/create.ts storage/rocksdb/src/index.ts storage/rocksdb/test/create-storely.test.ts
git commit -m "rocksdb - feat: add createStorelyRocksDB factory functions"
```

---

### Task 5: Individual method tests

**Files:**
- Create: `storage/rocksdb/test/main.test.ts`
- Create: `storage/rocksdb/test/get.test.ts`
- Create: `storage/rocksdb/test/set.test.ts`
- Create: `storage/rocksdb/test/delete.test.ts`
- Create: `storage/rocksdb/test/has.test.ts`
- Create: `storage/rocksdb/test/iterator.test.ts`
- Create: `storage/rocksdb/test/namespace.test.ts`
- Create: `storage/rocksdb/test/expiration.test.ts`

Each test file should follow the same patterns as the SQLite adapter tests but adapted for RocksDB (using `rocksdb://` URIs, temp directories, no Docker). All tests create a StorelyRocksDB instance with a unique temp directory and clean up after themselves.

Common test setup pattern:

```typescript
import { faker } from "@faker-js/faker";
import Storely from "storely";
import StorelyRocksDB from "../src/index.js";
import { it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "storely-rocksdb-test-"));
    dbPath = join(tempDir, "testdb");
});

afterEach(async () => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});
```

- [x] **Step 1: Write main.test.ts** — Tests for constructor options, property getters/setters, string URI, read-only mode, clearExpired, clearExpiredInterval, property defaults. Model after the SQLite `test.ts` tests for property getters, URI string, keySize, etc. Adapt for RocksDB-specific options (readOnly, createIfMissing, compression, infoLogLevel, etc.).

```typescript
// Key tests:
// - constructor with no options (default :memory: URI)
// - constructor with string URI
// - constructor with options object
// - property getters: uri, readOnly, createIfMissing, compression, iterationLimit, clearExpiredInterval, namespace
// - setters work correctly
// - read-only mode throws on write operations
// - errorIfExists throws when database already exists
```

- [x] **Step 2: Write get.test.ts** — Tests for `get()` and `getMany()` operations including expired value handling.

```typescript
// Key tests:
// - get returns value for existing key
// - get returns undefined for non-existent key
// - get returns undefined for expired key and deletes it
// - getMany returns multiple values
// - getMany returns undefined for missing keys
// - getMany handles expired keys correctly
```

- [x] **Step 3: Write set.test.ts** — Tests for `set()` and `setMany()` operations.

```typescript
// Key tests:
// - set stores value and returns true
// - set overwrites existing value
// - setMany stores multiple values
// - setMany upserts existing keys
// - set returns false on write error (closed database)
```

- [x] **Step 4: Write delete.test.ts** — Tests for `delete()` and `deleteMany()`.

```typescript
// Key tests:
// - delete returns true for existing key
// - delete returns false for non-existent key
// - deleteMany deletes multiple keys
// - deleteMany returns booleans for each key
```

- [x] **Step 5: Write has.test.ts** — Tests for `has()` and `hasMany()`.

```typescript
// Key tests:
// - has returns true for existing key
// - has returns false for non-existent key
// - has returns false and deletes expired key
// - hasMany returns correct booleans
// - hasMany handles expired keys
```

- [x] **Step 6: Write iterator.test.ts** — Tests for async iterator.

```typescript
// Key tests:
// - iterator returns all key-value pairs
// - iterator respects iterationLimit
// - iterator skips expired entries
// - iterator with no entries returns empty
// - iterator works with Storely instance
```

- [x] **Step 7: Write namespace.test.ts** — Tests for namespace isolation.

```typescript
// Key tests:
// - namespace prefix is stripped from keys
// - two Storely instances with different namespaces don't interfere
// - clear only clears the current namespace
```

- [x] **Step 8: Write expiration.test.ts** — Tests for TTL and clearExpired.

```typescript
// Key tests:
// - clearExpired removes expired entries
// - clearExpiredInterval auto-cleans expired entries
// - clearExpiredInterval setter restarts timer
// - clearExpiredInterval set to 0 disables timer
// - lazy expiration on get/has/getMany/hasMany
```

- [x] **Step 9: Run all tests**

Run: `cd storage/rocksdb && pnpm test`

Expected: All tests pass.

- [x] **Step 10: Run lint**

Run: `cd storage/rocksdb && pnpm lint:ci`

Expected: No lint errors.

- [x] **Step 11: Commit all test files**

```bash
git add storage/rocksdb/test/
git commit -m "rocksdb - test: add comprehensive test suite for all adapter operations"
```

---

### Task 6: Types test (tsd)

**Files:**
- Create: `storage/rocksdb/test/types.test.ts`

- [x] **Step 1: Write types.test.ts**

Follow the pattern from `storage/keydb/test/types.test.ts` or `storage/redis/test/types.test.ts`. Test that the TypeScript types are correct — StorelyRocksDB constructor accepts string URI, options object, etc.

- [x] **Step 2: Run types test**

Run: `cd storage/rocksdb && pnpm vitest run test/types.test.ts`

Expected: PASS

- [x] **Step 3: Commit types test**

```bash
git add storage/rocksdb/test/types.test.ts
git commit -m "rocksdb - test: add TypeScript type definition tests"
```

---

### Task 7: README documentation

**Files:**
- Create: `storage/rocksdb/README.md`

- [x] **Step 1: Write README.md**

Follow the exact pattern from `storage/sqlite/README.md` or `storage/redis/README.md`. Include:
- Package name and description
- Installation
- Usage examples (string URI, options object, namespace, clearExpired, etc.)
- API reference (constructor, methods, options)
- License

Read `storage/sqlite/README.md` for the exact format.

- [x] **Step 2: Commit README**

```bash
git add storage/rocksdb/README.md
git commit -m "rocksdb - docs: add README"
```

---

### Task 8: Update root README and workspace

**Files:**
- Modify: `README.md` (root) — add `rocksdb/` to project structure and `@storely/rocksdb` to Storage Adapters section

- [x] **Step 1: Read root README**

Read `/Users/ritesh/Downloads/submission_folder/storely/README.md` to see the current project structure and storage adapters list.

- [x] **Step 2: Add rocksdb entries**

Add `rocksdb/` to the project structure directory listing and `@storely/rocksdb` to the Storage Adapters table.

- [x] **Step 3: Commit README update**

```bash
git add README.md
git commit -m "docs: add @storely/rocksdb to root README"
```

---

### Task 9: Full build and lint verification

**Files:**
- No new files

- [x] **Step 1: Run full monorepo build**

Run: `pnpm build`

Expected: All 22 packages (including the new `@storely/rocksdb`) build successfully.

- [x] **Step 2: Run lint on all packages**

Run: `npx biome check --error-on-warnings .`

Expected: No errors, no warnings.

- [x] **Step 3: Run RocksDB adapter tests one more time**

Run: `cd storage/rocksdb && pnpm test`

Expected: All tests pass.

- [x] **Step 4: Run non-Docker core tests to verify nothing is broken**

Run: `pnpm -r --filter './core/*' --filter './serialization/*' --filter './compression/*' --filter './encryption/*' --filter './core/bigmap' test`

Expected: All existing tests still pass.

- [x] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "rocksdb - chore: final build and lint fixes"
```