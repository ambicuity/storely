# API Stability

This document tiers Storely's public surface. Use it to decide what you can build on, what you should migrate off of, and what you should avoid in production.

See [`DEPRECATION_POLICY.md`](./DEPRECATION_POLICY.md) for the support-window contract.

## Stable

These exports are covered by SemVer. Breaking changes require a major version bump and a deprecation cycle.

### Core

- `Storely` (default export of the `storely` package).
- `StorelyHookTypes` (the modern hook-name enum).
- `StorelyEvents` (event-name constants emitted by Storely instances).
- `StorelyStats` (telemetry stats subscriber).
- `StorelyJsonSerializer` (built-in default serializer).
- `StorelyValue`, `StorelyHookData`, `StorelyTelemetryEvent` (envelope and event types).
- `StorelyStorageAdapter` (the adapter interface).
- `StorelyCompressionAdapter`, `StorelyEncryptionAdapter`, `StorelySerializationAdapter` (the pluggable-adapter interfaces).
- `BigMap` (sharded in-memory map).

### Storage adapters (production-supported)

- `@storely/redis`
- `@storely/postgres`
- `@storely/mysql`
- `@storely/mongo`
- `@storely/sqlite`
- `@storely/valkey`
- `@storely/rocksdb`

### Serialization

- `@storely/serialize-superjson`
- `@storely/serialize-msgpackr`

### Compression

- `@storely/compress-brotli`
- `@storely/compress-gzip`
- `@storely/compress-lz4`

### Encryption

- `@storely/encrypt-node`
- `@storely/encrypt-web`
- The wire format magic prefix `STv0` is a stable contract; future major envelopes (`STv1`, etc.) will be additive and decryption will continue to accept `STv0` for at least one major release.

## Stable (deprecated)

Functional and tested, but a replacement exists. Removal target: `7.0.0`.

| Deprecated | Replacement | Notes |
|---|---|---|
| `StorelyStorage` type | `StorelyStorageAdapter` | Type alias; same runtime contract. (`core/storely/src/types/adapters.ts:74`) |
| `StorelyCompression` type | `StorelyCompressionAdapter` | Type alias. (`core/storely/src/types/adapters.ts:79`) |
| `StorelyData` type | `StorelyValue` | Envelope rename. (`core/storely/src/types/storely.ts:31`) |
| `StorelyHooks.BEFORE_SET` and the rest of the `StorelyHooks` enum | Corresponding `StorelyHookTypes` enum members | The new enum is the supported one going forward. (`core/storely/src/types/storely.ts:63-117`) |

## Experimental

**No SemVer guarantees.** May change shape, be relocated, or be removed without a deprecation cycle.

| Entity | Why experimental |
|---|---|
| `@storely/keydb` | Production hardening still in flight; do not put live traffic on this without your own integration tests. |
| `@storely/memcache` | Underlying `memcache@1.x` client unmaintained since 2013. Permanent experimental for the `6.0.x` line; migration to a maintained client is post-`6.0.0` work. |
| `@storely/etcd` | Iterator + lease lifecycle are recent; not yet load-tested. |
| `@storely/dynamo` | Pagination + TTL semantics corrected in Cluster 2, but not yet load-tested under heavy parallel write traffic. |

## Internal (not exported)

Anything reachable only via deep imports (`storely/dist/...`, package internals) is not covered by this document. Don't reach into internals — they will move.

## Wire formats

These are stable and any change requires a major bump:

- **Storely envelope** — `{ value, expires? }` JSON shape (or msgpack equivalent).
- **Encrypted envelope** — `STv0` magic + IV + (AuthTag) + Ciphertext. Legacy "no-magic" decoding is also stable for the `6.0.x` line.
- **Storage row schemas** — the table/collection/key schemas in each SQL/document/KV adapter are stable for the `6.0.x` line. Migrations between majors will ship with a documented upgrade path.
