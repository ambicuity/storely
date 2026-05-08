# KeyDB Storage Adapter Design

**Package**: `@storely/keydb`
**Version**: 6.0.0-alpha.4
**Date**: 2026-05-07
**Approach**: Thin wrapper — clone Redis adapter patterns with KeyDB branding

## Summary

Add a `@storely/keydb` storage adapter that connects to KeyDB using the `@redis/client` (node-redis) library. KeyDB is fully Redis-protocol compatible, so this adapter mirrors the existing `@storely/redis` implementation with KeyDB-specific branding and types. No KeyDB-specific features (active-replica, flash storage) are included in this initial version.

## Package Structure

```
storage/keydb/
  src/
    index.ts           # StorelyKeyDB class
    types.ts            # StorelyKeyDBOptions, connection types, error messages
    create.ts           # Factory: createStorelyKeyDB(), createStorelyKeyDBNonBlocking()
  test/
    suite.test.ts       # Standard @storely/test-suite integration
    main.test.ts        # Core operations
    get.test.ts         # Get-specific tests
    set.test.ts         # Set-specific tests
    delete.test.ts      # Delete-specific tests
    has.test.ts         # Has/hasMany tests
    iterator.test.ts    # Iterator tests
    namespace.test.ts   # Namespace isolation tests
    get-client.test.ts  # Connection management tests
    create-storely.test.ts # Factory function tests
    cluster.test.ts     # Cluster mode tests
    sentinel.test.ts    # Sentinel mode tests
    types.test.ts       # Type definition tests
  tls/                  # TLS certificates for testing (copied from redis adapter)
  package.json
  tsconfig.json
  tsdown.config.ts
  vitest.config.ts
  README.md
  LICENSE
```

## Core Class: `StorelyKeyDB<T>`

- Extends `Hookified`, implements `StorelyStorageAdapter`
- Uses `@redis/client` (node-redis v5) for KeyDB communication
- Supports standalone, cluster, and sentinel connection modes

### Constructor

```typescript
constructor(
  connect?: string | RedisClientOptions | RedisClusterOptions | RedisSentinelOptions | RedisClientConnectionType,
  options?: StorelyKeyDBOptions
)
```

### Methods

| Method | Signature | Behavior |
|--------|-----------|----------|
| `get<U>` | `get<U = T>(key: string): Promise<U \| undefined>` | Prefix key with namespace, call `GET`, deserialize |
| `set` | `set(key: string, value: unknown, ttl?: number): Promise<boolean>` | `SET` with optional `PX` TTL, returns boolean |
| `getMany<U>` | `getMany<U>(keys: string[]): Promise<Array<U \| undefined>>` | `MGET` with cluster-safe slot grouping |
| `setMany<Value>` | `setMany<Value>(entries): Promise<boolean[] \| undefined>` | `MULTI/EXEC` pipeline, cluster-safe slot grouping |
| `has` | `has(key: string): Promise<boolean>` | `EXISTS` command |
| `hasMany` | `hasMany(keys: string[]): Promise<boolean[]>` | Batch `EXISTS` via `MULTI/EXEC`, cluster-safe |
| `delete` | `delete(key: string): Promise<boolean>` | `UNLINK` (default) or `DEL` based on `useUnlink` option |
| `deleteMany` | `deleteMany(keys: string[]): Promise<boolean[]>` | Batch `UNLINK`/`DEL`, cluster-safe |
| `clear` | `clear(): Promise<void>` | `SCAN` + batched `UNLINK`/`DEL`; `FLUSHDB` if `noNamespaceAffectsAll` |
| `iterator<U>` | `async *iterator<U>(): AsyncGenerator<[string, U \| undefined]>` | `SCAN` cursor-based iteration |
| `disconnect` | `disconnect(force?: boolean): Promise<void>` | `force=true` calls `destroy()`, otherwise `close()` |

### Key Prefixing

- Format: `{namespace}::{key}` (configurable separator, default `"::"`)
- When no namespace is set, keys are stored as-is
- `createKeyPrefix(key, namespace?)` and `getKeyWithoutPrefix(key, namespace?)` helpers

## Configuration: `StorelyKeyDBOptions`

```typescript
type StorelyKeyDBOptions = {
  namespace?: string;              // Key namespace (default: undefined)
  keyPrefixSeparator?: string;    // Separator between namespace and key (default: "::")
  clearBatchSize?: number;        // Batch size for clear operations (default: 1000)
  useUnlink?: boolean;            // Use UNLINK instead of DEL (default: true)
  noNamespaceAffectsAll?: boolean; // FLUSHDB when clearing without namespace (default: false)
  throwOnConnectError?: boolean;  // Throw on connection errors (default: true)
  throwOnErrors?: boolean;        // Throw on command errors (default: false)
  connectionTimeout?: number;     // Connection timeout in ms (default: undefined)
}
```

## Factory Functions

```typescript
function createStorelyKeyDB(
  connect?: string | RedisClientOptions | RedisClusterOptions | RedisSentinelOptions | RedisClientConnectionType,
  options?: StorelyKeyDBOptions
): Storely;

function createStorelyKeyDBNonBlocking(
  connect?: string | RedisClientOptions | RedisClusterOptions | RedisSentinelOptions | RedisClientConnectionType,
  options?: StorelyKeyDBOptions
): Storely;
```

The non-blocking variant disables `throwOnErrors`, disables reconnect strategy, and disables offline queue — matching the Redis adapter pattern.

## Cluster Support

Same approach as the Redis adapter:
- `isCluster()` detects cluster mode from the client type
- `getSlotMap(keys)` groups keys by hash slot using `cluster-key-slot`
- `mget<T>()` splits multi-key operations by slot for cluster safety
- `clearWithClusterSupport()` handles clear in cluster mode
- `getSlotMaster(slot)` routes commands to the correct cluster node

## Sentinel Support

Same approach as the Redis adapter:
- `isSentinel()` detects sentinel mode from the client type
- Sentinel configuration passed through to `@redis/client`

## Connection Management

- Lazy connection: `getClient()` establishes connection on first use with optional timeout
- Exponential backoff with jitter for reconnection (matching Redis adapter default strategy)
- Event forwarding: `error`, `connect`, `disconnect`, `reconnecting` events emitted through `Hookified`
- `initClient()` wires up event listeners after connection establishment

## Docker Integration

### docker-compose.yaml addition

```yaml
storely_keydb:
  image: eqalpha/keydb:latest
  ports:
    - 6378:6379
storely_keydb_tls:
  image: eqalpha/keydb:latest
  command: keydb-server --port 0 --tls-port 6379 --tls-cert-file /tls/redis.crt --tls-key-file /tls/redis.key --tls-ca-cert-file /tls/ca.crt --tls-auth-clients no
  ports:
    - 6381:6379
  volumes:
    - ../storage/keydb/tls:/tls
```

Port 6378 on the host maps to KeyDB's default port 6379 in the container. This avoids conflicts with Redis (6379), Redis TLS (6380), and Valkey (6370).

### Environment Variables for Tests

- `KEYDB_HOST` — KeyDB host (default: `localhost`)
- `KEYDB_PORT` — KeyDB port (default: `6378`)

### TLS Support

The adapter includes TLS test support mirroring the Redis adapter:
- `tls/` directory contains test certificates (copied from `storage/redis/tls/`)
- A `storely_keydb_tls` Docker Compose service will be added for TLS-mode KeyDB on port 6381
- TLS tests verify connection with certificate-based authentication

- Uses `@storely/test-suite` `storageTestSuite()` and `storelyTestSuite()` for compliance
- Docker-based integration tests against a real KeyDB instance
- Test structure mirrors `@storely/redis`:
  - `suite.test.ts` — Standard compliance suite
  - `main.test.ts` — Core operations
  - `get.test.ts`, `set.test.ts`, `delete.test.ts`, `has.test.ts` — Individual operation tests
  - `iterator.test.ts` — Iterator tests
  - `namespace.test.ts` — Namespace isolation
  - `get-client.test.ts` — Connection management
  - `create-storely.test.ts` — Factory function tests
  - `cluster.test.ts` — Cluster mode tests
  - `sentinel.test.ts` — Sentinel mode tests
  - `types.test.ts` — Type definition tests

## Package Metadata

```json
{
  "name": "@storely/keydb",
  "version": "6.0.0-alpha.4",
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
    "test": "pnpm lint && vitest run --coverage",
    "test:ci": "pnpm lint:ci && vitest --run --sequence.setupFiles=list --coverage",
    "clean": "rimraf ./node_modules ./coverage ./dist"
  },
  "dependencies": {
    "@redis/client": "^5.10.0",
    "cluster-key-slot": "^1.1.2",
    "hookified": "^2.0.0"
  },
  "peerDependencies": {
    "storely": "workspace:^"
  },
  "devDependencies": {
    "@storely/test-suite": "workspace:^",
    "timekeeper": "^2.3.1"
  }
}
```

Same dependencies as `@storely/redis` since KeyDB uses the same client library.

## Error Handling

- `KeyDBClientNotConnectedThrown` error constant (mirroring `RedisClientNotConnectedThrown`)
- `throwOnConnectError` controls whether connection errors throw or emit
- `throwOnErrors` controls whether command errors throw or emit
- All errors forwarded through `Hookified.emit('error', ...)` event system

## Exclusions (Future Scope)

The following are explicitly excluded from this initial version but can be added later:
- KeyDB active-replica mode (read from replicas)
- KeyDB flash storage awareness
- KeyDB-specific INFO fields or statistics
- KeyDB sub-millisecond EXPIRE (`PEXPIRE` sub-ms extensions)