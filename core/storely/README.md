<h1 align="center">Storely</h1>

> Simple key-value storage with support for multiple backends

Storely provides a consistent interface for key-value storage across multiple backends via storage adapters. It supports TTL based expiry, making it suitable as a cache or a persistent key-value store.

# Features

There are a few existing modules similar to Storely, however Storely is different because it:

- Isn't bloated
- Has a simple Promise based API
- Suitable as a TTL based cache or persistent key-value store
- [Easily embeddable](#add-cache-support-to-your-module) inside another module
- Works with any storage that implements the [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) API
- Handles all JSON types plus `Buffer` and `BigInt` via the built-in `StorelyJsonSerializer`
- Supports namespaces
- Wide range of [**efficient, well tested**](#official-storage-adapters) storage adapters
- Connection errors are passed through (db failures won't kill your app)
- Supports the current active LTS version of Node.js or higher

## Breaking changes

### Default serialization for in-memory stores is now off

When constructed with an in-memory store (a `Map`, a `StorelyMemoryAdapter`, or
no store argument at all) and no explicit `serialization` option, `Storely` no
longer installs the default JSON serializer. This matches the behavior of `keyv`'s
in-memory store and removes 4–80× per-op overhead.

To restore the previous behavior, pass an explicit serializer:

```ts
import { Storely, StorelyJsonSerializer } from "@ambicuity/storely";
const cache = new Storely({
    store: new Map(),
    serialization: new StorelyJsonSerializer(),
});
```

### JSON wire format omits empty envelopes

The `StorelyJsonSerializer` now omits the `{value, expires}` envelope when
`expires` is undefined, prefixing the bare value with `*` instead. The decoder
still accepts the legacy `{value, expires}` form, so reading data written by
older versions continues to work. Code that hand-rolls the wire format
(uncommon) needs updating.

# Table of Contents
- [Usage](#usage)
- [Type-safe Usage](#type-safe-usage)
- [Using Storage Adapters](#using-storage-adapters)
- [Namespaces](#namespaces)
- [Events](#events)
- [Hooks](#hooks)
- [Serialization](#serialization)
- [Official Storage Adapters](#official-storage-adapters)
- [Third-party Storage Adapters](#third-party-storage-adapters)
- [Using BigMap to Scale](#using-bigmap-to-scale)
- [Compression](#compression)
- [Capability Detection](#capability-detection)
- [API](#api)
  - [new Storely([storage-adapter], [options]) or new Storely([options])](#new-storelystorage-adapter-options-or-new-storelyoptions)
  - [.namespace](#namespace)
  - [.ttl](#ttl)
  - [.store](#store)
  - [.serialization](#serialization-1)
  - [.compression](#compression)
  - [.useKeyPrefix](#usekeyprefix)
  - [.emitErrors](#emiterrors)
  - [.throwOnErrors](#throwonerrors)
  - [.stats](#stats)
  - [.sanitize](#sanitize)
  - [Storely Instance](#storely-instance)
	- [.set(key, value, [ttl])](#setkey-value-ttl)
	- [.setMany(entries)](#setmanyentries)
	- [.get(key, [options])](#getkey-options)
	- [.getMany(keys, [options])](#getmanykeys-options)
  - [.getRaw(key)](#getrawkey)
  - [.getManyRaw(keys)](#getmanyrawkeys)
  - [.setRaw(key, value)](#setrawkey-value)
  - [.setManyRaw(entries)](#setmanyrawentries)
	- [.delete(key)](#deletekey)
	- [.deleteMany(keys)](#deletemanykeys)
	- [.clear()](#clear)
	- [.has(key)](#haskey)
	- [.hasMany(keys)](#hasmanykeys)
	- [.disconnect()](#disconnect)
	- [.iterator()](#iterator)
- [Bun Support](#bun-support)
- [How to Contribute](#how-to-contribute)
- [License](#license)

# Usage

Install Storely.

```
npm install --save storely
```

By default everything is stored in memory, you can optionally also install a storage adapter.

```
npm install --save @ambicuity/redis
npm install --save @ambicuity/valkey
npm install --save @ambicuity/mongo
npm install --save @ambicuity/sqlite
npm install --save @ambicuity/postgres
npm install --save @ambicuity/mysql
npm install --save @ambicuity/etcd
npm install --save @ambicuity/memcache
npm install --save @ambicuity/dynamo
```

First, create a new Storely instance. 

```js
import Storely from '@ambicuity/storely';
```

# Type-safe Usage

You can create a `Storely` instance with a generic type to enforce type safety for the values stored. Additionally, both the `get` and `set` methods support specifying custom types for specific use cases.

## Example with Instance-level Generic Type:

```ts
const storely = new Storely<number>(); // Instance handles only numbers
await storely.set('key1', 123);
const value = await storely.get('key1'); // value is inferred as number
```

## Example with Method-level Generic Type:

You can also specify a type directly in the `get` or `set` methods, allowing flexibility for different types of values within the same instance.

```ts
const storely = new Storely(); // Generic type not specified at instance level

await storely.set<string>('key2', 'some string'); // Method-level type for this value
const strValue = await storely.get<string>('key2'); // Explicitly typed as string

await storely.set<number>('key3', 456); // Storing a number in the same instance
const numValue = await storely.get<number>('key3'); // Explicitly typed as number
```

This makes `Storely` highly adaptable to different data types while maintaining type safety.

# Using Storage Adapters

Once you have created your Storely instance you can use it as a simple key-value store with `in-memory` by default. To use a storage adapter, create an instance of the adapter and pass it to the Storely constructor. Here are some examples:

```js
// redis
import StorelyRedis from '@ambicuity/redis';

const storely = new Storely(new StorelyRedis('redis://user:pass@localhost:6379'));
```

You can also pass in a storage adapter with other options such as `ttl` and `namespace` (example using `sqlite`):

```js
//sqlite
import StorelySqlite from '@ambicuity/sqlite';

const storelySqlite = new StorelySqlite('sqlite://path/to/database.sqlite');
const storely = new Storely({ store: storelySqlite, ttl: 5000, namespace: 'cache' });
```

To handle an event you can do the following:

```js
// Handle DB connection errors
storely.on('error', err => console.log('Connection Error', err));
```

Now lets do an end-to-end example using `Storely` and the `Redis` storage adapter:

```js
import Storely from '@ambicuity/storely';
import StorelyRedis from '@ambicuity/redis';

const storelyRedis = new StorelyRedis('redis://user:pass@localhost:6379');
const storely = new Storely({ store: storelyRedis });

await storely.set('foo', 'expires in 1 second', 1000); // true
await storely.set('foo', 'never expires'); // true
await storely.get('foo'); // 'never expires'
await storely.delete('foo'); // true
await storely.clear(); // undefined
```

It's is just that simple! Storely is designed to be simple and easy to use.

# Namespaces

You can namespace your Storely instance to avoid key collisions and allow you to clear only a certain namespace while using the same database.

```js
const users = new Storely(new StorelyRedis('redis://user:pass@localhost:6379'), { namespace: 'users' });
const cache = new Storely(new StorelyRedis('redis://user:pass@localhost:6379'), { namespace: 'cache' });

await users.set('foo', 'users'); // true
await cache.set('foo', 'cache'); // true
await users.get('foo'); // 'users'
await cache.get('foo'); // 'cache'
await users.clear(); // undefined
await users.get('foo'); // undefined
await cache.get('foo'); // 'cache'
```

# Events

Storely is a custom `EventEmitter` and will emit an `'error'` event if there is an error.
If there is no listener for the `'error'` event, an uncaught exception will be thrown.
To disable the `'error'` event, pass `emitErrors: false` in the constructor options.

```js
const storely = new Storely({ emitErrors: false });
```

In addition it will emit `clear` and `disconnect` events when the corresponding methods are called.

```js
const storely = new Storely();
const handleConnectionError = err => console.log('Connection Error', err);
const handleClear = () => console.log('Cache Cleared');
const handleDisconnect = () => console.log('Disconnected');

storely.on('error', handleConnectionError);
storely.on('clear', handleClear);
storely.on('disconnect', handleDisconnect);
```

## Cleaning up listeners

`Storely` extends [`Hookified`](https://www.npmjs.com/package/hookified) so it
exposes the standard `EventEmitter` surface: `off()` removes a single handler
and `removeAllListeners()` removes every handler for a given event. If you
attach listeners that close over heavy state (loggers, request contexts) and
the `Storely` instance lives for the lifetime of the process, detach them
explicitly when the owning unit is torn down to avoid retaining that state.

```js
const handler = (err) => log.error(err);
storely.on('error', handler);
// ...later
storely.off('error', handler);
```

# Hooks

Storely supports hooks for `get`, `set`, and `delete` methods. Hooks are useful for logging, debugging, and other custom functionality. Here is a list of all the hooks:

```
PRE_GET
POST_GET
PRE_GET_RAW
POST_GET_RAW
PRE_GET_MANY
POST_GET_MANY
PRE_GET_MANY_RAW
POST_GET_MANY_RAW
PRE_SET
POST_SET
PRE_SET_RAW
POST_SET_RAW
PRE_SET_MANY_RAW
POST_SET_MANY_RAW
PRE_DELETE
POST_DELETE
```

You can access this by importing `StorelyHooks` from the main Storely package.

```js
import Storely, { StorelyHooks } from '@ambicuity/storely';
```

## Get Hooks

The `POST_GET` and `POST_GET_RAW` hooks fire on both cache hits and misses. When a cache miss occurs (key doesn't exist or is expired), the hooks receive `undefined` as the value.

```js
// POST_GET hook - fires on both hits and misses
const storely = new Storely();
storely.hooks.addHandler(StorelyHooks.POST_GET, (data) => {
  if (data.value === undefined) {
    console.log(`Cache miss for key: ${data.key}`);
  } else {
    console.log(`Cache hit for key: ${data.key}`, data.value);
  }
});

await storely.get('existing-key'); // Logs cache hit with value
await storely.get('missing-key');  // Logs cache miss with undefined
```

```js
// POST_GET_RAW hook - same behavior as POST_GET
const storely = new Storely();
storely.hooks.addHandler(StorelyHooks.POST_GET_RAW, (data) => {
  console.log(`Key: ${data.key}, Value:`, data.value);
});

await storely.getRaw('foo'); // Logs with value or undefined
```

## Set Hooks

```js
//PRE_SET hook
const storely = new Storely();
storely.hooks.addHandler(StorelyHooks.PRE_SET, (data) => console.log(`Setting key ${data.key} to ${data.value}`));

//POST_SET hook
const storely = new Storely();
storely.hooks.addHandler(StorelyHooks.POST_SET, ({key, value}) => console.log(`Set key ${key} to ${value}`));
```

In these examples you can also manipulate the value before it is set. For example, you could add a prefix to all keys.

```js
const storely = new Storely();
storely.hooks.addHandler(StorelyHooks.PRE_SET, (data) => {
  console.log(`Manipulating key ${data.key} and ${data.value}`);
  data.key = `prefix-${data.key}`;
  data.value = `prefix-${data.value}`;
});
```

Now this key will have prefix- added to it before it is set.

## Delete Hooks

In `PRE_DELETE` and `POST_DELETE` hooks, the value could be a single item or an `Array`. This is based on the fact that `delete` can accept a single key or an `Array` of keys.


# Serialization

By default, Storely uses its built-in `StorelyJsonSerializer` — a JSON-based serializer with support for `Buffer` and `BigInt` types. This works out of the box with all storage adapters.

## Official Serializers

In addition to the built-in serializer, Storely offers two official serialization packages:

### SuperJSON

[`@ambicuity/serialize-superjson`](../../serialization/superjson) supports `Date`, `RegExp`, `Map`, `Set`, `BigInt`, `undefined`, `Error`, and `URL` types.

```js
import Storely from '@ambicuity/storely';
import { superJsonSerializer } from '@ambicuity/serialize-superjson'; // using the helper function that does new StorelySuperJsonSerializer()

const storely = new Storely({ serialization: superJsonSerializer });
```

### MessagePack (msgpackr)

[`@ambicuity/serialize-msgpackr`](../../serialization/msgpackr) is a binary serializer that supports `Date`, `RegExp`, `Map`, `Set`, `Error`, `undefined`, `NaN`, and `Infinity` types.

```js
import Storely from '@ambicuity/storely';
import { StorelyMsgpackrSerializer } from '@ambicuity/serialize-msgpackr';

const storely = new Storely({ serialization: new StorelyMsgpackrSerializer() });
```

## Custom Serializers

You can provide your own serializer by implementing the `StorelySerializationAdapter` interface with `stringify` and `parse` methods:

```typescript
interface StorelySerializationAdapter {
  stringify: (object: unknown) => string | Promise<string>;
  parse: <T>(data: string) => T | Promise<T>;
}
```

## Disabling Serialization

You can disable serialization entirely by passing `false`. This stores data as raw objects, which works for in-memory `Map` storage where string conversion is not needed:

```js
const storely = new Storely({ serialization: false });
```

## Pipeline

When serialization and/or compression are configured, Storely applies them in this order:

**On set:** serialize (optional) → compress (optional) → store

**On get:** store → decompress (optional) → parse (optional) → value

If compression is configured without a serializer, Storely will use `JSON.stringify`/`JSON.parse` as a minimum fallback since compression adapters require string input.

# Official Storage Adapters

The official storage adapters are covered by over 150 integration tests to guarantee consistent behaviour. They are lightweight, efficient wrappers over the DB clients making use of indexes and native TTLs where available.

Database | Adapter | Native TTL
---|---|---
Redis | [@ambicuity/redis](../../storage/redis) | Yes
Valkey | [@ambicuity/valkey](../../storage/valkey) | Yes
MongoDB | [@ambicuity/mongo](../../storage/mongo) | Yes
SQLite | [@ambicuity/sqlite](../../storage/sqlite) | No
PostgreSQL | [@ambicuity/postgres](../../storage/postgres) | No
MySQL | [@ambicuity/mysql](../../storage/mysql) | No
Etcd | [@ambicuity/etcd](../../storage/etcd) | Yes
Memcache | [@ambicuity/memcache](../../storage/memcache) | Yes
DynamoDB | [@ambicuity/dynamo](../../storage/dynamo) | Yes

# Third-party Storage Adapters

We love the community and the third-party storage adapters they have built. They enable Storely to be used with even more backends and use cases.

You can also use third-party storage adapters or build your own. Storely will wrap these storage adapters in TTL functionality and handle complex types internally.

```js
import Storely from '@ambicuity/storely';
import myAdapter from 'my-adapter';

const storely = new Storely({ store: myAdapter });
```

Any store that follows the [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) api will work.

```js
new Storely({ store: new Map() });
```

For example, [`quick-lru`](https://github.com/sindresorhus/quick-lru) is a completely unrelated module that implements the Map API.

```js
import Storely from '@ambicuity/storely';
import QuickLRU from 'quick-lru';

const lru = new QuickLRU({ maxSize: 1000 });
const storely = new Storely({ store: lru });
```

View the complete list of third-party storage adapters and learn how to build your own in the Storely documentation.

# Using BigMap to Scale

## Understanding JavaScript Map Limitations

JavaScript's built-in `Map` object has a practical limit of approximately **16.7 million entries** (2^24). When you try to store more entries than this limit, you'll encounter performance degradation or runtime errors. This limitation is due to how JavaScript engines internally manage Map objects.

For applications that need to cache millions of entries in memory, this becomes a significant constraint. Common scenarios include:
- High-traffic caching layers
- Session stores for large-scale applications
- In-memory data processing of large datasets
- Real-time analytics with millions of data points

## Why BigMap?

`@ambicuity/bigmap` solves this limitation by using a **distributed hash approach** with multiple internal Map instances. Instead of storing all entries in a single Map, BigMap distributes entries across multiple Maps using a hash function. This allows you to scale beyond the 16.7 million entry limit while maintaining the familiar Map API.

### Key Benefits:
- **Scales beyond Map limits**: Store 20+ million entries without issues
- **Map-compatible API**: Drop-in replacement for standard Map
- **Performance**: Uses efficient DJB2 hashing for fast key distribution
- **Type-safe**: Built with TypeScript and supports generics
- **Customizable**: Configure store size and hash functions

## Using BigMap with Storely

BigMap can be used directly with Storely as a storage adapter, providing scalable in-memory storage with full TTL support.

### Installation

```bash
npm install --save storely @ambicuity/bigmap
```

### Basic Usage

The simplest way to use BigMap with Storely is through the `createStorely` helper function:

```js
import { createStorely } from '@ambicuity/bigmap';

const storely = createStorely();

// Set values with TTL (time in milliseconds)
await storely.set('user:1', { name: 'Alice', email: 'alice@example.com' }, 60000); // Expires in 60 seconds

// Get values
const user = await storely.get('user:1');
console.log(user); // { name: 'Alice', email: 'alice@example.com' }

// Delete values
await storely.delete('user:1');

// Clear all values
await storely.clear();
```

For more details about BigMap, see the [@ambicuity/bigmap documentation](../../core/bigmap).

# Compression

Storely supports `gzip`, `brotli` and `lz4` compression. To enable compression, pass the `compress` option to the constructor.

```js
import Storely from '@ambicuity/storely';
import StorelyGzip from '@ambicuity/compress-gzip';

const storelyGzip = new StorelyGzip();
const storely = new Storely({ compression: storelyGzip });
```

```js
import Storely from '@ambicuity/storely';
import StorelyBrotli from '@ambicuity/compress-brotli';

const storelyBrotli = new StorelyBrotli();
const storely = new Storely({ compression: storelyBrotli });
```

```js
import Storely from '@ambicuity/storely';
import StorelyLz4 from '@ambicuity/compress-lz4';

const storelyLz4 = new StorelyLz4();
const storely = new Storely({ compression: storelyLz4 });
```

You can also pass a custom compression function to the `compression` option. Following the pattern of the official compression adapters.

## Want to build your own StorelyCompressionAdapter?

Great! Storely is designed to be easily extended. You can build your own compression adapter by following the pattern of the official compression adapters based on this interface:

```typescript
interface StorelyCompressionAdapter {
	compress(value: any, options?: any): Promise<any>;
	decompress(value: any, options?: any): Promise<any>;
}
```

In addition to the interface, you can test it with our compression test suite using @ambicuity/test-suite:

```js
import { storelyCompressionTests } from '@ambicuity/test-suite';
import StorelyGzip from '@ambicuity/compress-gzip';

storelyCompressionTests(test, new StorelyGzip());
```

# Encryption

Storely provides a `StorelyEncryptionAdapter` interface for encryption support. This interface is available for custom implementations but is not yet wired into the core pipeline.

```typescript
interface StorelyEncryptionAdapter {
  encrypt: (data: string) => string | Promise<string>;
  decrypt: (data: string) => string | Promise<string>;
}
```

# Capability Detection

Storely exports helper functions to check whether an object implements the expected interface for a Storely instance, storage adapter, compression adapter, serialization adapter, or encryption adapter. Each function returns an object with boolean flags for every capability, plus a top-level boolean indicating whether the object fully satisfies the interface.

```ts
import {
  detectStorely,
  detectStorelyStorage,
  detectStorelyCompression,
  detectStorelySerialization,
  detectStorelyEncryption,
  detectCapabilities,
} from '@ambicuity/storely';
```

## detectStorely(obj)

Returns a `StorelyCapability` with a boolean for each Storely method/property. The `storely` flag is `true` only when **all** capabilities are present.

```ts
import Storely, { detectStorely } from '@ambicuity/storely';

detectStorely(new Storely());
// { storely: true, get: true, set: true, delete: true, clear: true, has: true,
//   getMany: true, setMany: true, deleteMany: true, hasMany: true,
//   disconnect: true, getRaw: true, getManyRaw: true, setRaw: true,
//   setManyRaw: true, hooks: true, stats: true, iterator: true }

detectStorely(new Map());
// { storely: false, get: true, set: true, ... }
```

## detectStorelyStorage(obj)

Returns a `StorelyStorageCapability`. The `storelyStorage` flag is `true` when the object has `get`, `set`, `delete`, `clear`, `has`, `setMany`, `deleteMany`, and `hasMany`.

The result also includes:
- **`mapLike`** — `true` when the object has synchronous `get`, `set`, `delete`, `has`, `entries`, and `keys` methods (i.e. it behaves like a `Map`)
- **`methodTypes`** — a record mapping each method name to `"sync"`, `"async"`, or `"none"` (not present)

```ts
import { detectStorelyStorage } from '@ambicuity/storely';

// Map-like object
const result = detectStorelyStorage(new Map());
result.mapLike; // true
result.methodTypes.get; // "sync"
result.methodTypes.set; // "sync"

// Async storage adapter
const adapter = {
  get: async () => {}, set: async () => {}, delete: async () => {},
  clear: async () => {}, has: async () => {}, setMany: async () => {},
  deleteMany: async () => {}, hasMany: async () => {},
};
const adapterResult = detectStorelyStorage(adapter);
adapterResult.storelyStorage; // true
adapterResult.mapLike; // false
adapterResult.methodTypes.get; // "async"
```

## detectStorelyCompression(obj)

Returns a `StorelyCompressionCapability`. The `storelyCompression` flag is `true` when both `compress` and `decompress` methods are present.

```ts
import { detectStorelyCompression } from '@ambicuity/storely';

detectStorelyCompression({ compress: (d) => d, decompress: (d) => d });
// { storelyCompression: true, compress: true, decompress: true }
```

## detectStorelySerialization(obj)

Returns a `StorelySerializationCapability`. The `storelySerialization` flag is `true` when both `stringify` and `parse` methods are present.

```ts
import { detectStorelySerialization } from '@ambicuity/storely';

detectStorelySerialization(JSON);
// { storelySerialization: true, stringify: true, parse: true }
```

## detectStorelyEncryption(obj)

Returns a `StorelyEncryptionCapability`. The `storelyEncryption` flag is `true` when both `encrypt` and `decrypt` methods are present.

```ts
import { detectStorelyEncryption } from '@ambicuity/storely';

detectStorelyEncryption({ encrypt: (d) => d, decrypt: (d) => d });
// { storelyEncryption: true, encrypt: true, decrypt: true }
```

## detectCapabilities(obj, spec)

A generic helper for building your own capability checks. Accepts a `CapabilitySpec` describing which methods and properties to look for, which are required, and the name of the composite boolean key.

```ts
import { detectCapabilities } from '@ambicuity/storely';

const result = detectCapabilities(myObject, {
  methods: ['read', 'write'],
  properties: ['name'],
  requiredKeys: ['read', 'write', 'name'],
  compositeKey: 'isValid',
});
// { isValid: true/false, read: true/false, write: true/false, name: true/false }
```

# API

## new Storely([storage-adapter], [options]) or new Storely([options])

Returns a new Storely instance.

The Storely instance is also an `EventEmitter` that will emit an `'error'` event if the storage adapter connection fails.

## storage-adapter

Type: `StorelyStorageAdapter`<br />
Default: `undefined`

The storage adapter instance to be used by Storely.

## .namespace

Type: `String`
Default: `undefined`

This is the namespace for the current instance. When you set it it will set it also on the storage adapter.

## options

Type: `Object`

The options object is also passed through to the storage adapter. Check your storage adapter docs for any extra options.

## options.namespace

Type: `String`<br />
Default: `undefined`

Namespace for the current instance.

## options.ttl

Type: `Number`<br />
Default: `undefined`

Default TTL. Can be overridden by specififying a TTL on `.set()`.

## options.compression

Type: `StorelyCompressionAdapter`<br />
Default: `undefined`

Compression package to use. See [Compression](#compression) for more details.

## options.serialization

Type: `StorelySerializationAdapter | false`<br />
Default: `StorelyJsonSerializer` (built-in)

A serialization object with `stringify` and `parse` methods. Set to `false` to disable serialization and store raw objects. See [Serialization](#serialization) for more details.

## options.store

Type: `Storage adapter instance`<br />
Default: `new Map()`

The storage adapter instance to be used by Storely.

# Storely Instance

Keys must always be strings. Values can be of any type.

## .set(key, value, [ttl])

Set a value.

By default keys are persistent. You can set an expiry TTL in milliseconds.

Returns a promise which resolves to `true`.

## .setMany(entries)

Set multiple values using `StorelyEntry<Value>` objects (`{ key: string, value: Value, ttl?: number }`). The `Value` type is inferred from the entries provided.

## .get(key, [options])

Returns a promise which resolves to the retrieved value.

## .getMany(keys, [options])

Returns a promise which resolves to an array of retrieved values.

## .getRaw(key)

Returns a promise which resolves to the raw stored data for the key or `undefined` if the key does not exist or is expired.

## .getManyRaw(keys)

Returns a promise which resolves to an array of raw stored data for the keys or `undefined` if the key does not exist or is expired.

## .setRaw(key, value)

Sets a raw value in the store without wrapping. This is the write-side counterpart to `.getRaw()`. The caller provides the `StorelyValue` envelope directly (`{ value, expires? }`) instead of having Storely wrap it. The envelope is still serialized before storing so that all read paths (`get()`, `getRaw()`, `has()`, `getManyRaw()`) work consistently. If you need TTL-based expiration, set `expires` on the value directly (e.g. `{ value: 'bar', expires: Date.now() + 60000 }`). The store-level TTL is derived automatically from `value.expires`.

Returns a promise which resolves to `true`.

```js
const storely = new Storely();

// Set a raw value with expiration
await storely.setRaw('foo', { value: 'bar', expires: Date.now() + 60000 });

// Set a raw value without expiration
await storely.setRaw('foo', { value: 'bar' });

// Round-trip: get raw, modify, set raw
const raw = await storely.getRaw('foo');
if (raw) {
  raw.value = 'updated';
  await storely.setRaw('foo', raw);
}
```

## .setManyRaw(entries)

Sets many raw values in the store without wrapping. Each entry should have a `key` and a `value` (`StorelyValue` envelope). Like `setRaw()`, the envelopes are serialized before storing and the store-level TTL is derived from each entry's `value.expires`.

Returns a promise which resolves to an array of booleans.

```js
const storely = new Storely();
await storely.setManyRaw([
  { key: 'foo', value: { value: 'bar' } },
  { key: 'baz', value: { value: 'qux', expires: Date.now() + 60000 } },
]);
```

## .delete(key)

Deletes an entry.

Returns a promise which resolves to `true` if the key existed, `false` if not.

## .deleteMany(keys)
Deletes multiple entries.

Returns a promise resolving to `boolean[]`, one entry per input key, in the same order as `keys`. Each element is `true` if the key existed and was deleted, `false` if it did not exist. Example:

```js
await storely.set('a', 1);
await storely.set('c', 3);
await storely.deleteMany(['a', 'b', 'c']); // [true, false, true]
```

**Performance note.** Byte-store adapters (`@ambicuity/redis`, `@ambicuity/mysql`, `@ambicuity/postgres`, `@ambicuity/mongo`, `@ambicuity/sqlite`) implement `deleteMany` as a `SELECT` of existing keys followed by a batched `DELETE`, so the per-key boolean is accurate. That costs roughly 2× the wall-clock of a bulk `DELETE … WHERE id IN (?)` that returns only "how many rows were affected." If you don't need the per-key signal and you're deleting large batches, consider using `clear()` (when scoped via namespace), or calling the underlying adapter's wire-level delete directly. Storely chose this trade because silently returning a single boolean for a batch makes existence-sensitive callers (e.g. cache invalidation pipelines) hard to reason about.

## .clear()

Delete all entries in the current namespace.

Returns a promise which is resolved when the entries have been cleared.

## .has(key)

Check if a key exists in the store.

Returns a promise which resolves to `true` if the key exists, `false` if not.

```js
await storely.set('foo', 'bar');
await storely.has('foo'); // true
await storely.has('unknown'); // false
```

## .hasMany(keys)

Check if multiple keys exist in the store.

Returns a promise which resolves to an array of booleans indicating if each key exists.

```js
await storely.set('foo', 'bar');
await storely.hasMany(['foo', 'unknown']); // [true, false]
```

## .disconnect()

Disconnect from the storage adapter. Emits a `'disconnect'` event.

Returns a promise which is resolved when the connection has been closed.

```js
await storely.disconnect();
```

## .iterator()

Iterate over all key-value pairs in the store. Automatically deserializes values, filters out expired entries, and deletes them.

Returns an async generator that yields `[key, value]` pairs. Use with `for await...of`:

```js
for await (const [key, value] of storely.iterator()) {
  console.log(key, value);
}
```

The iterator works with any storage backend:
- **Map stores**: iterates using the built-in `Symbol.iterator`
- **Storage adapters**: delegates to the adapter's `iterator()` method (e.g., Redis SCAN, SQL cursor)
- **Unsupported stores**: emits an `error` event if the store does not support iteration

# API - Properties

## .namespace

Type: `String`

The namespace for the current instance. This will define the namespace for the current instance and the storage adapter. If you set the namespace to `undefined` it will no longer do key prefixing.

```js
const storely = new Storely({ namespace: 'my-namespace' });
console.log(storely.namespace); // 'my-namespace'
```

here is an example of setting the namespace to `undefined`:

```js
const storely = new Storely();
console.log(storely.namespace); // undefined which is default
storely.namespace = undefined;
console.log(storely.namespace); // undefined
```

## .ttl

Type: `Number`<br />
Default: `undefined`

Default TTL. Can be overridden by specififying a TTL on `.set()`. If set to `undefined` it will never expire.

```js
const storely = new Storely({ ttl: 5000 });
console.log(storely.ttl); // 5000
storely.ttl = undefined;
console.log(storely.ttl); // undefined (never expires)
```

## .store

Type: `Storage adapter instance`<br />
Default: `new Map()`

The storage adapter instance to be used by Storely. This will wire up the iterator, events, and more when a set happens. If it is not a valid Map or Storage Adapter it will throw an error. 

```js
import StorelySqlite from '@ambicuity/sqlite';
const storely = new Storely();
console.log(storely.store instanceof Map); // true
storely.store = new StorelySqlite('sqlite://path/to/database.sqlite');
console.log(storely.store instanceof StorelySqlite); // true
```

## .serialization

Type: `StorelySerializationAdapter | false | undefined`<br />
Default: `StorelyJsonSerializer` (built-in)

The serialization object used for storing and retrieving values. Set to `false` or `undefined` to disable serialization and use raw object pass-through. See [Serialization](#serialization) for more details.

```js
const storely = new Storely();
console.log(storely.serialization); // StorelyJsonSerializer (default)
storely.serialization = false; // disable serialization
console.log(storely.serialization); // undefined
```

## .compression

Type: `StorelyCompressionAdapter`<br />
Default: `undefined`

This is the compression package to use. See [Compression](#compression) for more details. If it is undefined it will not compress (default).

```js
import StorelyGzip from '@ambicuity/compress-gzip';

const storely = new Storely();
console.log(storely.compression); // undefined
storely.compression = new StorelyGzip();
console.log(storely.compression); // StorelyGzip
```

## .useKeyPrefix

Type: `Boolean`<br />
Default: `true`

If set to `true` Storely will prefix all keys with the namespace. This is useful if you want to avoid collisions with other data in your storage.

```js
const storely = new Storely({ useKeyPrefix: false });
console.log(storely.useKeyPrefix); // false
storely.useKeyPrefix = true;
console.log(storely.useKeyPrefix); // true
```

With many of the storage adapters you will also need to set the `namespace` option to `undefined` to have it work correctly. This is because in `v5` we started the transition to having the storage adapter handle the namespacing and `Storely` will no longer handle it internally via KeyPrefixing. Here is an example of doing it with `StorelySqlite`:

```js
import Storely from '@ambicuity/storely';
import StorelySqlite from '@ambicuity/sqlite';

const store = new StorelySqlite('sqlite://path/to/database.sqlite');
const storely = new Storely({ store });
storely.useKeyPrefix = false; // disable key prefixing
store.namespace = undefined; // disable namespacing in the storage adapter

await storely.set('foo', 'bar'); // true
await storely.get('foo'); // 'bar'
await storely.clear();
```

## .emitErrors

Type: `Boolean`<br />
Default: `true`

If set to `true`, Storely will emit an `'error'` event when an error occurs. Set to `false` to suppress error events.

```js
const storely = new Storely({ emitErrors: false });
console.log(storely.emitErrors); // false
storely.emitErrors = true;
console.log(storely.emitErrors); // true
```

## .throwOnErrors

Type: `Boolean`<br />
Default: `false`

If set to `true`, Storely will throw an error if any operation fails. This is useful if you want to ensure that all operations are successful and you want to handle errors.

```js
const storely = new Storely({ throwOnErrors: true });
console.log(storely.throwOnErrors); // true
storely.throwOnErrors = false;
console.log(storely.throwOnErrors); // false
```

A good example of this is with the `@ambicuity/redis` storage adapter. If you want to handle connection errors, retries, and timeouts more gracefully, you can use the `throwOnErrors` option. This will throw an error if any operation fails, allowing you to catch it and handle it accordingly:

```js
import Storely from '@ambicuity/storely';
import StorelyRedis from '@ambicuity/redis';

// create redis instance that will throw on connection error
const storelyRedis = new StorelyRedis('redis://user:pass@localhost:6379', { throwOnConnectErrors: true });

const storely = new Storely({ store: storelyRedis, throwOnErrors: true });
```

What this does is it only throw on connection errors with the Redis client.

## .stats
Type: `StorelyStats`<br />
Default: `StorelyStats` instance with `enabled: false`

The stats property provides access to statistics tracking for cache operations. When enabled via the `stats` option during initialization, it tracks hits, misses, sets, deletes, and errors. It also maintains LRU-bounded per-key frequency maps for each event type, allowing you to see which keys are accessed most.

### Enabling Stats:
```js
const storely = new Storely({ stats: true });
console.log(storely.stats.enabled); // true
```

### Available Statistics:

**Aggregate counters:**
- `hits`: Number of successful cache retrievals
- `misses`: Number of failed cache retrievals
- `sets`: Number of set operations
- `deletes`: Number of delete operations
- `errors`: Number of errors encountered

**Per-key LRU frequency maps** (each capped at `maxEntries`, default 1000):
- `hitKeys`: `Map<string, number>` — key to hit count
- `missKeys`: `Map<string, number>` — key to miss count
- `setKeys`: `Map<string, number>` — key to set count
- `deleteKeys`: `Map<string, number>` — key to delete count
- `errorKeys`: `Map<string, number>` — key to error count

### Accessing Stats:
```js
const storely = new Storely({ stats: true });

await storely.set('foo', 'bar');
await storely.get('foo'); // cache hit
await storely.get('nonexistent'); // cache miss
await storely.delete('foo');

console.log(storely.stats.hits);    // 1
console.log(storely.stats.misses);  // 1
console.log(storely.stats.sets);    // 1
console.log(storely.stats.deletes); // 1

// Per-key frequency maps
console.log(storely.stats.hitKeys.get('foo'));          // 1
console.log(storely.stats.missKeys.get('nonexistent')); // 1
```

### Resetting Stats:
```js
storely.stats.reset();
console.log(storely.stats.hits); // 0
console.log(storely.stats.hitKeys.size); // 0
```

### Manual Control:
You can also manually enable/disable stats tracking at runtime. Disabling stats will automatically unsubscribe from events:
```js
const storely = new Storely({ stats: false });
storely.stats.enabled = true; // Enable stats tracking
// ... perform operations ...
storely.stats.enabled = false; // Disable stats tracking and unsubscribe
```

### Standalone Usage:
You can create a `StorelyStats` instance independently and subscribe it to a Storely instance:
```js
import { StorelyStats } from '@ambicuity/storely';

const stats = new StorelyStats({ enabled: true, maxEntries: 500, emitter: storely });
```

## .sanitize
Type: `boolean | StorelySanitizeOptions`<br />
Default: `false`

Detects and strips dangerous patterns from keys and namespaces to protect against SQL injection, MongoDB operator injection, path traversal, and control character attacks. Harmless characters like quotes, slashes, and dollar signs pass through unchanged — only dangerous *patterns* are stripped.

Results are cached in an LRU cache (10,000 entries) for fast repeated lookups.

### Pattern Categories

| Category | Patterns Stripped | Purpose |
|----------|------------------|---------|
| `sql` | `;` `--` `/*` | Prevents SQL injection |
| `mongo` | leading `$`, `{$` sequences | Prevents MongoDB operator injection |
| `escape` | `\0` `\r` `\n` | Strips null bytes, CRLF injection |
| `path` | `../` `..\` | Prevents path traversal |

### Targets

| Target | Default | Description |
|--------|---------|-------------|
| `keys` | `true` (when enabled) | Sanitize keys on all operations |
| `namespace` | `true` (when enabled) | Sanitize namespace on construction and setter |

### Usage

Enable all sanitization:
```js
const storely = new Storely({ sanitize: true });
await storely.set("test; DROP TABLE", "value");
// Key is stored as "test DROP TABLE"

// Harmless characters pass through
await storely.set("user's-data", "value");
// Key is stored as "user's-data" (unchanged)
```

Disable all sanitization (default):
```js
const storely = new Storely({ sanitize: false });
```

Granular control per target and category:
```js
const storely = new Storely({
  sanitize: {
    keys: { sql: true, mongo: false },     // only SQL patterns on keys
    namespace: { path: true, sql: false },  // only path patterns on namespace
  }
});
```

Disable namespace sanitization only:
```js
const storely = new Storely({
  sanitize: { keys: true, namespace: false }
});
```

Change at runtime:
```js
storely.sanitize = false; // disable
storely.sanitize = true;  // enable all
storely.sanitize = { keys: { sql: true, mongo: false } }; // granular
```

Sanitization is applied to all key-accepting methods: `get`, `set`, `delete`, `has`, `getMany`, `setMany`, `deleteMany`, `hasMany`, `getRaw`, `getManyRaw`, `setRaw`, and `setManyRaw`. Namespace sanitization is applied at construction and when the `namespace` setter is used.

# Bun Support

We make a best effort to support [Bun](https://bun.sh/) as a runtime. Our default and primary target is Node.js, but we run tests against Bun to ensure compatibility. If you encounter any issues while using Storely with Bun, please report them.

# How to Contribute

We welcome contributions to Storely! Here are some guides to get you started with contributing:

* [Contributing](../../CONTRIBUTING.md) - Learn about how to contribute to Storely
* [Code of Conduct](../../CODE_OF_CONDUCT.md) - Learn about the Storely Code of Conduct
* [How to Contribute](../../README.md) - How to develop in the Storely mono repo! 

# License

[MIT © Ritesh Rana](LICENSE)
