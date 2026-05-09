> RocksDB storage adapter for Storely using `@nxtedition/rocksdb` binding.

> ℹ️ **Native build required.** `@nxtedition/rocksdb` is a native Node.js
> addon that compiles from source on `npm install` / `pnpm install`. Your
> environment needs a working C++ toolchain (gcc/clang, make, Python). This
> rules out minimal Docker images such as `node:20-alpine` (without
> `apk add g++ make python3`) or distroless. Prebuilt binaries are not
> distributed.

[![npm](https://img.shields.io/npm/v/@storely/rocksdb.svg)](https://www.npmjs.com/package/@storely/rocksdb)
[![npm](https://img.shields.io/npm/dm/@storely/rocksdb)](https://npmjs.com/package/@storely/rocksdb)

RocksDB storage adapter for Storely.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Using createStorelyRocksDB](#using-createstorelyrocksdb)
- [Constructor Options](#constructor-options)
- [Properties](#properties)
  - [namespace](#namespace)
  - [uri](#uri)
  - [db](#db)
  - [readOnly](#readonly)
  - [createIfMissing](#createifmissing)
  - [errorIfExists](#errorifexists)
  - [compression](#compression)
  - [iterationLimit](#iterationlimit)
  - [clearExpiredInterval](#clearexpiredinterval)
  - [infoLogLevel](#infologlevel)
  - [ready](#ready)
  - [opts](#opts)
- [Methods](#methods)
  - [.set(key, value, ttl?)](#setkey-value-ttl)
  - [.setMany(entries)](#setmanyentries)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.clearExpired()](#clearexpired)
  - [.iterator()](#iterator)
  - [.disconnect()](#disconnect)
- [Clearing Expired Keys](#clearing-expired-keys)
- [License](#license)

# Install

```shell
npm install --save storely @storely/rocksdb
```

# Usage

```js
import Storely from 'storely';
import StorelyRocksDB from '@storely/rocksdb';

const storely = new Storely({ store: new StorelyRocksDB('rocksdb:///tmp/mydb') });
storely.on('error', err => console.error(err));
```

You can specify additional options:

```js
const storelyRocksDB = new StorelyRocksDB({
  uri: 'rocksdb:///tmp/mydb',
  compression: 'snappy',
  clearExpiredInterval: 60_000,
});
const storely = new Storely({ store: storelyRocksDB });
```

In-memory (temp directory) storage:

```js
const storelyRocksDB = new StorelyRocksDB('rocksdb://:memory:');
```

# Using createStorelyRocksDB

The `createStorelyRocksDB` helper creates a `Storely` instance with `StorelyRocksDB` as the store in one call:

```js
import { createStorelyRocksDB } from '@storely/rocksdb';

// With a URI string
const storely = createStorelyRocksDB('rocksdb:///tmp/mydb');

// With an options object
const storely = createStorelyRocksDB({
  uri: 'rocksdb:///tmp/mydb',
  compression: 'zstd',
});
```

# Using createStorelyRocksDBNonBlocking

The `createStorelyRocksDBNonBlocking` helper creates a `Storely` instance with `StorelyRocksDB` as the store in non-blocking mode. This disables `throwOnErrors` and does not await the database connection promise:

```js
import { createStorelyRocksDBNonBlocking } from '@storely/rocksdb';

const storely = createStorelyRocksDBNonBlocking('rocksdb://:memory:');
```

# Constructor Options

`StorelyRocksDB` accepts a connection URI string or an options object:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `'rocksdb://:memory:'` | RocksDB connection URI. Use `rocksdb://:memory:` for temp directory storage, `rocksdb:///path/to/db` for absolute path, `rocksdb://./path` for relative path |
| `readOnly` | `boolean` | `false` | Open database in read-only mode |
| `createIfMissing` | `boolean` | `true` | Create database if it doesn't exist |
| `errorIfExists` | `boolean` | `false` | Throw error if database already exists |
| `compression` | `'none' \| 'snappy' \| 'zstd' \| 'zlib' \| 'bzip2'` | `'snappy'` | RocksDB compression type |
| `clearExpiredInterval` | `number` | `0` | Interval in milliseconds to automatically clear expired entries (0 = disabled) |
| `iterationLimit` | `number` | `100` | Number of entries fetched per batch during iteration |
| `infoLogLevel` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal' \| 'header' \| null` | `'warn'` | RocksDB log verbosity level |

# Properties

## namespace

Get or set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()` and `iterator()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new StorelyRocksDB('rocksdb://:memory:');
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

## uri

Get the RocksDB connection URI.

- Type: `string`
- Default: `'rocksdb://:memory:'`

```js
const store = new StorelyRocksDB('rocksdb:///tmp/mydb');
console.log(store.uri); // 'rocksdb:///tmp/mydb'
```

## db

Get the resolved file path for the RocksDB database, derived from the URI. For `:memory:` URIs, this is a temporary directory path.

- Type: `string`
- Default: `':memory:'`

```js
const store = new StorelyRocksDB('rocksdb:///tmp/mydb');
console.log(store.db); // '/tmp/mydb'
```

## readOnly

Get whether the database is opened in read-only mode.

- Type: `boolean`
- Default: `false`

```js
const store = new StorelyRocksDB({ uri: 'rocksdb:///tmp/mydb', readOnly: true });
console.log(store.readOnly); // true
```

## createIfMissing

Get whether the database will be created if it doesn't exist.

- Type: `boolean`
- Default: `true`

```js
const store = new StorelyRocksDB({ uri: 'rocksdb:///tmp/mydb', createIfMissing: false });
console.log(store.createIfMissing); // false
```

## errorIfExists

Get whether to throw an error if the database already exists.

- Type: `boolean`
- Default: `false`

```js
const store = new StorelyRocksDB({ uri: 'rocksdb:///tmp/mydb', errorIfExists: true });
console.log(store.errorIfExists); // true
```

## compression

Get the RocksDB compression type.

- Type: `'none' | 'snappy' | 'zstd' | 'zlib' | 'bzip2'`
- Default: `'snappy'`

```js
const store = new StorelyRocksDB({ uri: 'rocksdb://:memory:', compression: 'zstd' });
console.log(store.compression); // 'zstd'
```

## iterationLimit

Get or set the number of entries to fetch per iteration batch. Must be a positive integer.

- Type: `number`
- Default: `100`

```js
const store = new StorelyRocksDB({ uri: 'rocksdb://:memory:', iterationLimit: 50 });
console.log(store.iterationLimit); // 50
```

## clearExpiredInterval

Get or set the interval in milliseconds between automatic expired-entry cleanup runs. When set to a value greater than 0, the adapter will automatically call `clearExpired()` at the specified interval. The timer uses `unref()` so it won't keep the Node.js process alive. Setting to 0 disables the automatic cleanup.

- Type: `number`
- Default: `0` (disabled)

```js
// Clean up expired entries every 60 seconds
const store = new StorelyRocksDB({
  uri: 'rocksdb:///tmp/mydb',
  clearExpiredInterval: 60_000,
});
console.log(store.clearExpiredInterval); // 60000

// Disable it later
store.clearExpiredInterval = 0;
```

## infoLogLevel

Get the RocksDB log verbosity level.

- Type: `'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'header' | null`
- Default: `'warn'`

```js
const store = new StorelyRocksDB({ uri: 'rocksdb://:memory:', infoLogLevel: 'debug' });
console.log(store.infoLogLevel); // 'debug'
```

## ready

A promise that resolves when the database connection is complete. You can optionally await this before the first operation to ensure the adapter is fully initialized.

- Type: `Promise<void>`

```js
const store = new StorelyRocksDB('rocksdb:///tmp/mydb');
await store.ready; // connection complete
```

## opts

Get all current settings as a plain object. This getter exists for backward compatibility.

- Type: `StorelyRocksDBOptions`

```js
const store = new StorelyRocksDB({
  uri: 'rocksdb://:memory:',
  compression: 'zstd',
});
console.log(store.uri); // 'rocksdb://:memory:'
console.log(store.compression); // 'zstd'
```

# Methods

## .set(key, value, ttl?)

Set a key-value pair. Returns `true` on success, `false` on failure.

- `key` *(string)* - The key to set.
- `value` *(any)* - The value to store.
- `ttl` *(number, optional)* - Time to live in milliseconds.
- Returns: `Promise<boolean>`

```js
await storely.set('foo', 'bar');
await storely.set('foo', 'bar', 5000); // expires in 5 seconds
```

## .setMany(entries)

Set multiple key-value pairs at once using `db.batch()`. More efficient than calling `.set()` in a loop for bulk operations. Returns a `boolean[]` with per-entry success tracking.

```js
const results = await storely.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux' },
]); // [true, true]
```

## .get(key)

Get a value by key. Returns `undefined` if the key does not exist.

```js
const value = await storely.get('foo'); // 'bar'
```

## .getMany(keys)

Get multiple values at once. Returns an array of values in the same order as the keys, with `undefined` for missing keys.

```js
const values = await storely.getMany(['foo', 'baz']); // ['bar', 'qux']
```

## .has(key)

Check if a key exists. Returns a boolean.

```js
const exists = await storely.has('foo'); // true
```

## .hasMany(keys)

Check if multiple keys exist. Returns an array of booleans in the same order as the input keys.

```js
const results = await storely.hasMany(['foo', 'baz', 'unknown']); // [true, true, false]
```

## .delete(key)

Delete a key. Returns `true` if the key existed, `false` otherwise.

```js
const deleted = await storely.delete('foo'); // true
```

## .deleteMany(keys)

Delete multiple keys at once using `db.batch()`. Returns a `boolean[]` indicating whether each key existed.

```js
const results = await storely.deleteMany(['foo', 'baz']); // [true, true]
```

## .clear()

Clear all keys in the current namespace. Uses range-scoped `db.clear()` when a namespace is set.

```js
await storely.clear();
```

## .clearExpired()

Utility helper method to delete all expired entries from the store. Iterates over all entries (respecting namespace bounds) and batch-deletes any whose `expires` timestamp is in the past.

```js
await store.clearExpired();
```

## .iterator()

Iterate over all key-value pairs. The iterator uses the namespace configured on the instance. Uses range bounds (`gte`/`lt`) when a namespace is set, and the `limit` option controlled by the `iterationLimit` property.

```js
const iterator = storely.iterator();
for await (const [key, value] of iterator) {
  console.log(key, value);
}
```

## .disconnect()

Disconnect from the RocksDB database and release resources. Stops the automatic expired-entry cleanup interval if running, closes the underlying database connection, and removes the temp directory if the database was opened with `:memory:`.

```js
await store.disconnect();
```

# Clearing Expired Keys

When a key is stored with a TTL, the adapter records the expiration timestamp. Storely core enforces TTL automatically -- expired keys return `undefined` from `get()` and `false` from `has()`, and are lazily deleted from the store when accessed.

However, expired entries that are never accessed again will remain in the database. The `clearExpired()` method and `clearExpiredInterval` option provide bulk cleanup to remove these stale entries efficiently.

## Automatic cleanup

Set the `clearExpiredInterval` option (in milliseconds) to automatically remove expired entries on a recurring timer. The timer uses `unref()` so it won't keep the Node.js process alive.

```js
const store = new StorelyRocksDB({
  uri: 'rocksdb:///tmp/mydb',
  clearExpiredInterval: 60_000, // clean up every 60 seconds
});
```

You can change or disable the interval at runtime:

```js
// Change to every 5 minutes
store.clearExpiredInterval = 300_000;

// Disable automatic cleanup
store.clearExpiredInterval = 0;
```

## Manual cleanup

Call `clearExpired()` directly to remove all expired entries on demand:

```js
await store.clearExpired();
```

# License

[MIT](LICENCE)