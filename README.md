> Simple key-value storage with support for multiple backends

# Adapter status

Not every adapter is at the same level of production hardening. Use this list
when picking a backend; check each package's README for adapter-specific
caveats.

- **Production-ready:** `redis`, `sqlite`, `postgres`
- **Beta** (use with caution; see audit): `mysql`, `mongo`, `valkey`, `rocksdb`
- **Experimental — known issues:** `keydb`, `memcache`, `etcd`, `dynamo` —
  see each package's README for the specific gaps. The experimental adapters
  ship for early integration work; do not put live traffic on them yet.

# Getting Started

Storely provides a consistent interface for key-value storage across multiple backends via storage adapters. It supports TTL-based expiry, making it suitable as a cache or a persistent key-value store.

Install Storely:

```
npm install @ambicuity/storely-core
```

By default everything is stored in memory. You can optionally install a storage adapter for persistent backends:

```
npm install @ambicuity/redis
```

Use it:

```js
import Storely from '@ambicuity/storely-core';

const store = new Storely();
await store.set('foo', 'bar');
await store.get('foo'); // 'bar'
```

# Project Structure

This monorepo is organized into categorized directories:

```
core/             Core packages
  storely/          Main Storely library
  test-suite/       Shared test suite for API compliance
  bigmap/           Scalable in-memory Map
serialization/    Serialization packages
  superjson/        SuperJSON serializer (@ambicuity/serialize-superjson)
  msgpackr/         MessagePack serializer (@ambicuity/serialize-msgpackr)
encryption/       Encryption adapters
  encrypt-node/     Node.js crypto encryption (@ambicuity/encrypt-node)
  encrypt-web/      Web Crypto API encryption (@ambicuity/encrypt-web)
compression/      Compression adapters
  compress-brotli/
  compress-gzip/
  compress-lz4/
storage/          Storage adapters
  redis/  postgres/  mysql/  mongo/  sqlite/
  keydb/  memcache/  etcd/  valkey/  dynamo/  rocksdb/
website/          Documentation website
```

# Packages

* [storely](core/storely) - Simple key-value storage with support for multiple backends
* [test-suite](core/test-suite) - Test suite for Storely API compliance
* [bigmap](core/bigmap) - Scalable in-memory Map

## Storage Adapters
* [dynamo](storage/dynamo) - DynamoDB storage adapter
* [etcd](storage/etcd) - Etcd storage adapter
* [keydb](storage/keydb) - KeyDB storage adapter
* [memcache](storage/memcache) - Memcache storage adapter
* [mongo](storage/mongo) - MongoDB storage adapter
* [mysql](storage/mysql) - MySQL/MariaDB storage adapter
* [postgres](storage/postgres) - PostgreSQL storage adapter
* [redis](storage/redis) - Redis storage adapter
* [rocksdb](storage/rocksdb) - RocksDB storage adapter for Storely
* [sqlite](storage/sqlite) - SQLite storage adapter
* [valkey](storage/valkey) - Valkey (Open Source Redis) storage adapter

## Encryption Adapters

* [encrypt-node](encryption/encrypt-node) - Node.js crypto encryption adapter (@ambicuity/encrypt-node)
* [encrypt-web](encryption/encrypt-web) - Web Crypto API encryption adapter (@ambicuity/encrypt-web)

## Compression Adapters

* [compress-brotli](compression/compress-brotli) - Brotli compression adapter
* [compress-gzip](compression/compress-gzip) - Gzip compression adapter
* [compress-lz4](compression/compress-lz4) - LZ4 compression adapter

## Serialization

The default serializer (`StorelyJsonSerializer`) is built into the core `storely` package. Alternative serializers are available as separate packages:

* [serialize-superjson](serialization/superjson) - SuperJSON serializer with Date, Map, Set, BigInt support (@ambicuity/serialize-superjson)
* [serialize-msgpackr](serialization/msgpackr) - High-performance MessagePack serializer (@ambicuity/serialize-msgpackr)

## Third-party Storage Adapters

We love the community and the third-party storage adapters they have built. They enable Storely to be used with even more backends and use cases.

# Contributing

We welcome contributions! Here are some ways to get involved:

* **Pull Requests** - Fork the repo, make your changes, run `pnpm test`, and open a PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed instructions.
* **Issues** - Report bugs or request features by [opening an issue](../../issues). For bugs, include replication steps and error messages.
* **Questions** - Create an issue with the label "question" and include relevant context.
* **Storage Adapter Requests** - Create an issue with the label "storage adapter." Requests are given 30-60 days for community interest before being triaged.
* **Security** - See our [security policy](SECURITY.md) for reporting vulnerabilities.
* **Code of Conduct** - Please review our [Code of Conduct](CODE_OF_CONDUCT.md).

# License

MIT © Ritesh Rana