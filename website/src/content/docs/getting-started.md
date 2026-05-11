---
title: "Getting started"
description: "Install Storely, choose a backend, and start storing keys and values."
section: "Start"
order: 1
---

## Overview

Storely is a small, consistent interface over a long list of key-value backends.
Pick a storage adapter that fits your environment — SQLite for local work,
Redis or Postgres in production, DynamoDB on AWS — and the same API works
across all of them. It supports TTL-based expiry, namespacing, pluggable
serialization, compression, and encryption.

## Install

```sh
npm install @ambicuity/ambicore
```

By default, everything is stored in an in-memory `Map`. To persist beyond the
process or share across instances, install one of the storage adapters listed
below.

### Production-ready adapters

```sh
npm install @ambicuity/redis
npm install @ambicuity/postgres
npm install @ambicuity/sqlite
```

### Beta adapters

```sh
npm install @ambicuity/mysql
npm install @ambicuity/mongo
npm install @ambicuity/valkey
npm install @ambicuity/rocksdb
```

### Experimental adapters

```sh
npm install @ambicuity/keydb
npm install @ambicuity/memcache
npm install @ambicuity/etcd
npm install @ambicuity/dynamo
```

You can also use [third-party storage adapters](/third-party/) that implement
the `Map`-like contract.

## Your first instance

Pass a connection string and Storely loads the matching adapter for you:

```ts
import Storely from "@ambicuity/ambicore";

const store = new Storely("sqlite://./data.sqlite");

await store.set("hello", "world");
await store.get("hello"); // "world"
```

### Constructor

| Parameter | Type   | Required | Description                                                                                  |
| --------- | ------ | -------- | -------------------------------------------------------------------------------------------- |
| `uri`     | string | no       | Connection string. Merged into `options.uri`. Default: `undefined`.                          |
| `options` | object | no       | Adapter and Storely options. Passed through to the storage adapter. See the next table.      |

### Options

| Option       | Type            | Description                                                                                             |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------------- |
| `namespace`  | string          | Prefix applied to all keys. Default: `undefined`.                                                       |
| `ttl`        | number          | Default TTL in milliseconds. Overridable per-call on `set()`. Default: `undefined`.                     |
| `store`      | adapter         | Pre-constructed adapter instance. Default: in-memory `Map`.                                             |
| `serialization` | adapter      | Custom serializer. Default: built-in `StorelyJsonSerializer` (binary/BigInt round-trip + sentinel optimization). |
| `compression`| adapter         | Compression adapter. See [Compression](/docs/compression/).                                             |
| `encryption` | adapter         | Encryption adapter. See [Encryption](/docs/encryption/).                                                |

## Connect with a URI

```ts
import Storely from "@ambicuity/ambicore";

const store = new Storely("mongodb://user:pass@localhost:27017/dbname");

store.on("error", (err) => console.error("Connection error", err));
```

## Bring your own store

`quick-lru` (or anything else that implements the `Map` API) plugs in directly:

```ts
import Storely from "@ambicuity/ambicore";
import QuickLRU from "quick-lru";

const lru = new QuickLRU({ maxSize: 1000 });
const store = new Storely({ store: lru });
```

## Set, get, delete

```ts
const store = new Storely("redis://user:pass@localhost:6379");

await store.set("foo", "expires in 1 second", 1000);
await store.set("bar", "never expires");

await store.get("foo");        // "expires in 1 second" (until ttl elapses)
await store.delete("foo");      // true
```

`set(key, value, ttl?)` accepts an optional TTL in milliseconds. `delete(key)`
returns `true` if the key was present, `false` otherwise.

## Namespaces

Namespacing scopes a Storely instance so multiple consumers can share the same
backend without colliding. `clear()` only removes keys under the current
namespace.

```ts
const users = new Storely("redis://localhost:6379", { namespace: "users" });
const cache = new Storely("redis://localhost:6379", { namespace: "cache" });

await users.set("foo", "users");
await cache.set("foo", "cache");

await users.get("foo"); // "users"
await cache.get("foo"); // "cache"

await users.clear(); // wipes only the "users" namespace
```

## Compression

Storely ships three official compression adapters: `gzip`, `brotli`, and `lz4`.
Install whichever fits your CPU / size tradeoff, then pass it in.

```sh
npm install @ambicuity/compress-gzip
```

```ts
import Storely from "@ambicuity/ambicore";
import StorelyGzip from "@ambicuity/compress-gzip";

const store = new Storely({ compression: new StorelyGzip() });
```

Brotli and lz4 follow the same pattern (`@ambicuity/compress-brotli`,
`@ambicuity/compress-lz4`). `lz4` requires Node 20+.

### Build your own

A compression adapter is anything that implements:

```ts
interface CompressionAdapter {
	compress(value: unknown, options?: unknown): Promise<unknown>;
	decompress(value: unknown, options?: unknown): Promise<unknown>;
	serialize(value: unknown): Promise<unknown>;
	deserialize(value: unknown): Promise<unknown>;
}
```

Compliance tests live in `@ambicuity/test-suite`:

```ts
import { storelyCompressionTests } from "@ambicuity/test-suite";
import StorelyGzip from "@ambicuity/compress-gzip";

storelyCompressionTests(test, new StorelyGzip());
```

## Embed Storely in your own module

You can expose a `cache` option in your library so consumers can plug in
whatever backend they like:

```ts
class AwesomeModule {
	cache: Storely;
	constructor(opts: { cache?: string | object } = {}) {
		this.cache = new Storely({
			uri: typeof opts.cache === "string" ? opts.cache : undefined,
			store: typeof opts.cache !== "string" ? opts.cache : undefined,
			namespace: "awesome-module",
		});
	}
}

const mod = new AwesomeModule({ cache: "redis://localhost" });
```

The `namespace` here protects your consumer's other data from `clear()`
operations against your module's cache.
