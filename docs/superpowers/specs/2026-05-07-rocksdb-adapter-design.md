# RocksDB Storage Adapter Design

**Package**: `@storely/rocksdb`
**Version**: 6.0.0-alpha.4
**Date**: 2026-05-07
**Approach**: Embedded database adapter — wraps `@nxtedition/rocksdb`'s `RocksLevel` (AbstractLevel API) as a Storely storage adapter

## Summary

Add a `@storely/rocksdb` storage adapter that wraps Facebook's RocksDB embedded key-value store using the `@nxtedition/rocksdb` Node.js binding. The binding exposes a `RocksLevel` class that extends `AbstractLevel` (the modern Level interface, not the deprecated `abstract-leveldown`). This gives us a promise-based API with `db.open()`, `db.get()`, `db.put()`, `db.del()`, `db.clear()`, `db.batch()`, and `db.iterator()`.

RocksDB is an embedded database (like SQLite), so no Docker is required for testing. The adapter bridges `AbstractLevel`'s API to Storely's `StorelyStorageAdapter` interface, adding TTL via stored timestamps, namespace key prefixing, and expiration management.

The `rocksdb` and `level-rocksdb` packages from the Level project are both discontinued. `@nxtedition/rocksdb` is an actively maintained fork with 310+ published versions, MIT license, and N-API prebuilt binaries for Linux, macOS, and Windows.

## Package Structure

```
storage/rocksdb/
  src/
    index.ts           # StorelyRocksDB class
    types.ts            # StorelyRocksDBOptions, error messages, type definitions
    create.ts           # Factory: createStorelyRocksDB(), createStorelyRocksDBNonBlocking()
  test/
    suite.test.ts       # Standard @storely/test-suite integration
    main.test.ts        # Core operations (get, set, delete, clear)
    get.test.ts         # Get/getMany-specific tests
    set.test.ts         # Set/setMany-specific tests
    delete.test.ts      # Delete/deleteMany tests
    has.test.ts         # Has/hasMany tests
    iterator.test.ts    # Iterator tests
    namespace.test.ts   # Namespace isolation tests
    create-storely.test.ts  # Factory function tests
    types.test.ts       # Type definition tests
    expiration.test.ts  # TTL/expiration tests
  package.json
  tsconfig.json
  tsdown.config.ts
  vitest.config.ts
  README.md
  LICENSE
```

## Core Class: `StorelyRocksDB`

- Extends `Hookified`, implements `StorelyStorageAdapter`
- Uses `@nxtedition/rocksdb` for RocksDB communication
- Supports file-based and in-memory storage modes
- No network layer — embedded database, single-process access

### Constructor

```typescript
constructor(storelyOptions?: StorelyRocksDBOptions | string)
```

If a string is provided, it's treated as the connection URI. If an options object is provided, all settings are extracted from it. Defaults to `rocksdb://:memory:`.

### Methods

| Method | Signature | Behavior |
|--------|-----------|----------|
| `get<Value>` | `get<Value>(key: string): Promise<Value \| undefined>` | Strip namespace prefix, `db.get()`, check expiration, return value |
| `set` | `set(key: string, value: any): Promise<boolean>` | Strip namespace prefix, store as `{ value, expires }`, `db.put()` |
| `getMany<Value>` | `getMany<Value>(keys: string[]): Promise<Array<Value \| undefined>>` | Use `db.getMany()` for batch retrieval, check expiration per entry |
| `setMany<Value>` | `setMany<Value>(entries: StorelyEntry<Value>[]): Promise<boolean[] \| undefined>` | Use `db.batch()` atomic multi-put |
| `has` | `has(key: string): Promise<boolean>` | `db.get()`, check expiration, return existence |
| `hasMany` | `hasMany(keys: string[]): Promise<boolean[]>` | `db.getMany()`, check expiration per entry |
| `delete` | `delete(key: string): Promise<boolean>` | `db.del()`, returns true if key existed |
| `deleteMany` | `deleteMany(keys: string[]): Promise<boolean[]>` | Use `db.batch()` for atomic multi-delete |
| `clear` | `clear(): Promise<void>` | `db.clear()` with namespace range bounds (`gte`/`lt`) |
| `iterator<Value>` | `async *iterator<Value>(): AsyncGenerator<[string, Value \| undefined]>` | `db.iterator()` with namespace prefix bounds, batch by `iterationLimit` |
| `clearExpired` | `clearExpired(): Promise<void>` | Iterate all entries, batch-delete where `expires <= Date.now()` |
| `disconnect` | `disconnect(): Promise<void>` | Stop cleanup timer, close database via `db.close()` |

## Key Storage Format

Keys are stored with namespace prefixing:

```
{namespace}:{key}  →  { value: <data>, expires: <timestamp | null> }
```

The stored value is a JSON string containing both the actual value and the expiration timestamp. This mirrors the SQLite adapter's approach since RocksDB has no native TTL support.

### Value Serialization

```typescript
// Stored format (JSON string in RocksDB — UTF-8 encoded)
"{\"value\":\"actual-data\",\"expires\":1715078400000}"

// Without expiration
"{\"value\":\"actual-data\",\"expires\":null}"
```

The `expires` field is extracted from the serialized value (same as SQLite's `getExpiresFromValue()` pattern) and stored as a separate field in the JSON wrapper. On read, expired entries are lazily deleted.

**Important:** Since `RocksLevel` supports both `utf8` and `buffer` encodings, our adapter stores values as UTF-8 encoded JSON strings. Keys are also stored as UTF-8 strings. This means binary values must be JSON-serializable before storage — the Storely core handles this via its serializer pipeline.

### Key Prefixing

- Format: `{namespace}:{key}` (single colon separator, matching Storely core convention)
- When no namespace is set, keys are stored as-is (no prefix)
- `removeKeyPrefix(key, namespace?)` helper strips namespace prefix before RocksDB operations
- `getNamespaceValue()` returns namespace or empty string

## Configuration: `StorelyRocksDBOptions`

```typescript
type StorelyRocksDBOptions = {
  uri?: string;                  // Connection URI, default 'rocksdb://:memory:'
  readOnly?: boolean;            // Open in read-only mode (default: false)
  createIfMissing?: boolean;     // Create DB if doesn't exist (default: true)
  errorIfExists?: boolean;       // Throw if DB already exists (default: false)
  compression?: RocksDBCompression;  // Compression type (default: 'snappy')
  clearExpiredInterval?: number; // Auto-cleanup interval ms (default: 0, disabled)
  iterationLimit?: number;      // Batch size for iterator (default: 100)
  infoLogLevel?: RocksDBLogLevel; // RocksDB log verbosity (default: 'warn')
}
```

### URI Format

- `rocksdb://:memory:` — In-memory database (creates a temp directory via `os.tmpdir()` that is cleaned up on `disconnect()`)
- `rocksdb:///absolute/path/to/db` — Absolute path
- `rocksdb://./relative/path` — Relative path (resolved from `process.cwd()`)
- `rocksdb:///tmp/mydb` — Specific temp location

**Note:** RocksDB is a file-based engine and doesn't have a true in-memory mode like SQLite's `:memory:`. The `:memory:` option creates a temporary directory that acts as an ephemeral database — it's deleted on `disconnect()`. For persistent storage, provide an explicit file path.

### Compression Options

```typescript
type RocksDBCompression = 'none' | 'snappy' | 'zstd' | 'zlib' | 'bzip2';
```

Maps to RocksDB's `CompressionType` options. Default is `snappy` (RocksDB's built-in default).

### Log Level Options

```typescript
type RocksDBLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'header' | null;
```

`null` disables RocksDB info logging entirely.

## Factory Functions

```typescript
function createStorelyRocksDB(
  storelyOptions?: StorelyRocksDBOptions | string
): Storely;

function createStorelyRocksDBNonBlocking(
  storelyOptions?: StorelyRocksDBOptions | string
): Storely;
```

The non-blocking variant:
- Disables `throwOnErrors`
- Disables `errorIfExists`
- Does not await `ready` before returning

## `@nxtedition/rocksdb` API Integration

The `RocksLevel` class from `@nxtedition/rocksdb` extends `AbstractLevel` and provides:

- **`RocksLevel`** — Constructor takes `(locationOrHandle, options)`. Static `RocksLevel.open(location, options)` factory.
- **`db.open(options?)`** — Open the database (returns promise). Options include `createIfMissing`, `errorIfExists`, `readOnly`, `infoLogLevel`.
- **`db.get(key, options?)`** — Get a value by key. Throws `LEVEL_NOT_FOUND` if key doesn't exist.
- **`db.getMany(keys, options?)`** — Get multiple values. Returns `undefined` for missing keys.
- **`db.put(key, value, options?)`** — Set a key-value pair.
- **`db.del(key, options?)`** — Delete a key.
- **`db.batch(operations)`** — Atomic batch of put/del operations.
- **`db.clear(options?)`** — Clear entries matching range options (`gte`, `lt`, etc.).
- **`db.iterator(options?)`** — Returns an async iterator with `gte`, `gt`, `lt`, `lte`, `limit`, `reverse` options.
- **`db.close()`** — Close the database.

Our adapter wraps these methods, adding namespace prefixing, TTL storage, and expiration management on top.

### Key: Value Encoding

`AbstractLevel` supports key and value encodings. We use `utf8` for both keys and values since Storely serializes values to JSON strings before storage. The `RocksLevel` constructor is called with `{ encodings: { utf8: true, buffer: true } }` to enable string encoding.

## Connection Management

### Initialization Flow

1. Parse URI → extract database path (or generate temp directory path for `:memory:`)
2. Create `RocksLevel` instance with options (`createIfMissing`, `compression`, etc.)
3. Call `db.open()` to initialize the database
4. Store a `ready: Promise<void>` that resolves when open completes
5. All subsequent operations await `ready` implicitly (via promise proxy pattern, same as SQLite)
6. For `:memory:` databases, track the temp directory so it can be cleaned up on `disconnect()`

### Lifecycle

- `ready` — Promise that resolves when the database is open and ready
- `disconnect()` — Stops cleanup timer, closes database via `db.close()`, and removes temp directory if using `:memory:` mode
- Error events forwarded through `Hookified.emit('error', ...)`
- For `:memory:` mode, a temp directory is created via `mkdtempSync()` and tracked in `_tempPath`. On `disconnect()`, this temp directory is removed via `rmSync()` with `{ recursive: true, force: true }`

## Iterator Design

Uses `RocksLevel`'s native `db.iterator()` with lexicographic key ordering:

```typescript
async *iterator<Value>() {
  const prefix = this._namespace ? `${this._namespace}:` : '';
  const limit = this._iterationLimit;

  for await (const [key, value] of this._db.iterator({
    gte: prefix || undefined,   // Start at namespace prefix (or beginning)
    lt: prefix ? `${prefix}~` : undefined,  // End before next namespace
    limit
  })) {
    // Check expiration (value is stored as JSON string)
    const parsed = JSON.parse(value as string);
    if (parsed.expires !== null && parsed.expires !== undefined && parsed.expires <= Date.now()) {
      await this._db.del(key);
      continue;
    }
    yield [this.removeKeyPrefix(key as string), parsed.value as Value];
  }
}
```

The `~` character (ASCII 126) is chosen as the upper bound because it's the highest printable ASCII character, ensuring all keys under a namespace prefix are captured. When no namespace is set, the iterator scans all entries without bounds.

### clear() Implementation

Uses `RocksLevel`'s native `db.clear()` with range options for efficient namespace clearing:

```typescript
async clear(): Promise<void> {
  if (this._namespace) {
    await this._db.clear({
      gte: `${this._namespace}:`,
      lt: `${this._namespace}:~`,
    });
  } else {
    await this._db.clear();
  }
}
```

This is much more efficient than the SQLite adapter's SQL-based `DELETE FROM` approach, as `db.clear()` operates at the RocksDB level.

## Expiration Handling

### Lazy Expiration (On Read)

- `get()`, `has()`, `getMany()`, `hasMany()` check the `expires` field on read
- If expired, the entry is deleted and `undefined`/`false` is returned
- This matches the SQLite adapter pattern

### Active Expiration (Optional Timer)

- `clearExpiredInterval` option enables periodic full-scan cleanup
- When set to a positive value, a `setInterval` runs `clearExpired()` periodically
- The timer is `unref()`'d so it doesn't prevent process exit
- `clearExpired()` iterates all entries and deletes expired ones
- Default: `0` (disabled) — users opt into active expiration if needed

### clearExpired() Implementation

```typescript
async clearExpired(): Promise<void> {
  const now = Date.now();
  const operations: Array<{ type: 'del'; key: string }> = [];

  for await (const [key, value] of this._db.iterator()) {
    const parsed = JSON.parse(value as string);
    if (parsed.expires !== null && parsed.expires !== undefined && parsed.expires <= now) {
      operations.push({ type: 'del', key: key as string });
    }
  }

  if (operations.length > 0) {
    await this._db.batch(operations);
  }
}
```

## Testing

### No Docker Required

Since RocksDB is an embedded database, all tests run locally without Docker. Each test creates a temporary database in a unique temp directory and cleans up after itself. The `:memory:` URI creates a temp directory that is automatically cleaned up.

### Test Setup

```typescript
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// For in-memory (temp dir) tests
const store = () => new StorelyRocksDB('rocksdb://:memory:');

// For file-based tests
const tempDir = mkdtempSync(join(tmpdir(), 'storely-rocksdb-test-'));
const store = () => new StorelyRocksDB(`rocksdb://${join(tempDir, 'testdb')}`);
```

### Test Files

| File | Purpose |
|------|---------|
| `suite.test.ts` | `@storely/test-suite` compliance (storageTestSuite + storelyTestSuite) |
| `main.test.ts` | Core CRUD operations |
| `get.test.ts` | Get/getMany with various value types |
| `set.test.ts` | Set/setMany, TTL behavior |
| `delete.test.ts` | Delete/deleteMany |
| `has.test.ts` | Has/hasMany with expiration |
| `iterator.test.ts` | Forward iteration, namespace filtering, expiration during iteration |
| `namespace.test.ts` | Namespace isolation, key prefixing |
| `create-storely.test.ts` | Factory function tests |
| `types.test.ts` | Type definition tests (tsd) |
| `expiration.test.ts` | TTL, lazy deletion, clearExpired, clearExpiredInterval |

### Cleanup

Tests that use file-based storage create databases in a temp directory. After each test suite, the temp directory is removed. In-memory tests need no external cleanup — the adapter's `disconnect()` method handles temp directory removal for `:memory:` databases.

```typescript
// In test setup
afterEach(async () => {
  await store.disconnect();
});

// For file-based tests — cleanup after all tests
afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});
```

## Package Metadata

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
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" },
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" }
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
  "engines": {
    "node": ">= 18"
  },
  "files": [
    "dist",
    "LICENSE"
  ]
}
```

## Differences from Other Adapters

| Feature | RocksDB | SQLite | Redis |
|---------|---------|--------|-------|
| Database Type | Embedded KV | Embedded SQL | Network server |
| Docker Required | No | No | Yes |
| TTL Support | Via stored timestamp (lazy) | Via stored timestamp (lazy) | Native EXPIRE/PX |
| Native Batch | `db.batch()` (atomic) | SQL transactions | MULTI/EXEC |
| Namespace | Key prefix + range clear | Separate column | Key prefix |
| Iterator | `db.iterator()` with bounds | SQL cursor with pagination | SCAN cursor |
| Clear | `db.clear()` range delete | `DELETE FROM` SQL | SCAN + UNLINK batch |
| Compression | Native (snappy/zstd/zlib) | None | N/A (server-side) |
| Concurrency | Single-process only | WAL mode for reads | Multi-process |
| Binding API | `AbstractLevel` | `better-sqlite3` sync API | `@redis/client` async API |

## Error Handling

```typescript
const RocksDBErrorMessages = {
  DB_NOT_OPEN: 'Database is not open',
  INVALID_URI: 'Invalid RocksDB URI format',
  KEY_REQUIRED: 'Key is required',
  READ_ONLY: 'Database is opened in read-only mode',
  DB_EXISTS: 'Database already exists',
  NOT_FOUND: 'LEVEL_NOT_FOUND',
} as const;
```

- All errors emitted through `Hookified.emit('error', ...)`
- `set()` returns `false` on write errors (matching SQLite pattern)
- `readOnly` mode throws on write operations
- `errorIfExists: true` throws during initialization if the database file already exists

### Not-Found Handling

`RocksLevel.db.get()` throws a `ModuleError` with `code: 'LEVEL_NOT_FOUND'` when a key doesn't exist, rather than returning `undefined`. Our adapter catches this error and returns `undefined` instead, matching the `StorelyStorageAdapter` interface. This is similar to how the `has()` method works — it catches `LEVEL_NOT_FOUND` and returns `false`.

## Exclusions (Future Scope)

The following are explicitly excluded from this initial version but can be added later:

- **Column Families** — RocksDB's native feature for logical partitioning. Using key prefixing instead for simplicity and cross-adapter consistency.
- **Snapshots** — RocksDB's point-in-time read snapshots.
- **Write-ahead log (WAL) tuning** — Custom WAL configuration options.
- **Compaction configuration** — Custom compaction strategy, trigger, and style options.
- **Block cache tuning** — Custom block cache size and sharding.
- **Merge operator** — RocksDB's atomic read-modify-write primitive.
- **Backup/restore** — Native RocksDB backup engine integration.
- **TTL at the RocksDB level** — `rocksdb::ttl_db` is not exposed by `@nxtedition/rocksdb`; we implement TTL at the Storely adapter level instead.