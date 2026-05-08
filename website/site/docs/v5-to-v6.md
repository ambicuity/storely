---
title: 'v5 to v6 Migration'
order: 3
---

# Storely v6 (In Progress)

We are pleased to announce Storely v6 with major enhancements and some breaking changes. This guide will help you understand how to migrate from v5 to v6. For most users, the transition will be straightforward.

**Important:** With the release of v6, Storely v5 will move to maintenance mode. This means v5 will only receive security fixes and minor maintenance updates. We encourage all users to migrate to v6 to take advantage of the latest features and improvements. You can view the `v5` branch in the mono repo.

## Table of Contents

- [Roadmap & Progress](#roadmap--progress)
- [Quick Migration Guide](#quick-migration-guide)
- [Breaking Changes](#breaking-changes)
  - [Namespace Overhaul](#namespace-overhaul)
  - [`opts` Property Removed](#opts-property-removed)
  - [Serialization Replaces `stringify` and `parse`](#serialization-replaces-stringify-and-parse)
  - [Hookified for Events and Hooks](#hookified-for-events-and-hooks)
  - [`deleteMany` Returns `boolean[]`](#deletemany-returns-boolean)
  - [`setMany` Uses `StorelyEntry[]` and Returns `boolean[]`](#setmany-uses-storelyentry-and-returns-boolean)
  - [`get` and `getMany` No Longer Support Raw](#get-and-getmany-no-longer-support-raw)
  - [Iterator Changes](#iterator-changes)
  - [Removed `.ttlSupport` from Storage Adapters](#removed-ttlsupport-from-storage-adapters)
  - [Returns `undefined` Instead of `null`](#returns-undefined-instead-of-null)
  - [Compression Adapter Interface Change](#compression-adapter-interface-change)
  - [`@storely/memcache` Moves from `memjs` to `memcache`](#storelymemcache-moves-from-memjs-to-memcache)
- [New Features](#new-features)
  - [Storely v6 Versioning](#storely-v6-versioning)
  - [Storely v5 Maintenance Mode](#storely-v5-maintenance-mode)
  - [Browser Compatibility](#browser-compatibility)
  - [Serialization Adapters](#serialization-adapters)
  - [Encryption Adapters](#encryption-adapters)
  - [New Identification Functions](#new-identification-functions)
  - [Memory Adapter](#memory-adapter)

---

## Roadmap & Progress

| Task | Status |
|------|--------|
| Remove `opts` property in Storely and Storage Adapters | IN PROGRESS |
| Add encryption adapters | NOT STARTED |
| Browser compatibility | NOT STARTED |
| Stats System to be Event Driven | NOT STARTED |
| Test Suite Overhaul | NOT STARTED |
| Refactor iterator implementation | COMPLETED |
| Update `deleteMany` return type | COMPLETED |
| Update `setMany` signature and return type | COMPLETED |
| Add compression interface standardization | COMPLETED |
| Integrate Hookified library in Storely | COMPLETE |
| Storely core does not do keyPrefixing | COMPLETED |
| Update `@storely/sqlite`  | COMPLETE |
| Update `@storely/dynamo`  | COMPLETE |
| Update `@storely/etcd`  | COMPLETE |
| Update `@storely/valkey`  | COMPLETE |
| Finalize namespace handling in storage adapters | COMPLETE |
| Add `getRaw` and `getManyRaw` methods | COMPLETE |
| Implement `StorelyMemoryAdapter` | COMPLETE |
| Add serialization adapters | COMPLETE |
| Migrate `@storely/memcache` from `memjs` to `memcache` | COMPLETE |
| Update `@storely/bigmap`  | COMPLETE |
| Update `@storely/mongo`  | COMPLETE |
| Update `@storely/mysql`  | COMPLETE |
| Update `@storely/postgres`  | COMPLETE |
| Update `@storely/redis`  | COMPLETE |
| Add GitHub Actions release workflow | COMPLETE |

---

## Quick Migration Guide

For most users, migrating from v5 to v6 involves a few key changes:

1. **Update property access** - The `opts` property has been removed. Use direct property access instead (`store.namespace` instead of the old `store.opts.namespace`)

2. **Update serialization** - Replace `serialize`/`deserialize` options with the new `serialization` adapter:
   ```javascript
   // v5
   const store = new Storely({ serialize: JSON.stringify, deserialize: JSON.parse });

   // v6
   import StorelySerialize from '@storely/serialize';
   const store = new Storely({ serialization: new StorelySerialize() });
   ```

3. **Update raw value access** - Replace `get(key, { raw: true })` with `getRaw(key)` and `getMany(keys, { raw: true })` with `getManyRaw(keys)`

4. **Handle new return types** - `deleteMany` and `setMany` now return `boolean[]` instead of a single `boolean`

For detailed information on each change, see the sections below.

---

## Breaking Changes

### Namespace Overhaul

We have finalized the transition (started in v5) to move all namespace handling to the storage adapters themselves. When you set the namespace on Storely, it passes it directly to the storage adapter.

**What changed:**
- `useKeyPrefix` property has been removed
- `keyPrefix` property has been removed
- Key prefixing is no longer done at the Storely layer

**v5 (before):**
```javascript
import Storely from 'storely';

const store = new Storely({
  namespace: 'myapp',
  useKeyPrefix: true,
  keyPrefix: 'prefix:'
});
```

**v6 (after):**
```javascript
import Storely from 'storely';

const store = new Storely({ namespace: 'myapp' });
// Namespace is handled directly by the storage adapter
```

For legacy storage adapters or `Map`-compatible stores, we have added `StorelyMemoryAdapter` which handles advanced features without overloading the main Storely codebase. See [Memory Adapter](#memory-adapter) for more details.

---

### `opts` Property Removed

In Storely v5, we began removing `opts` as a passed-around value. In v6, `opts` has been fully removed from the `StorelyStorageAdapter` interface and all storage adapters. The `dialect` property has also been removed. All properties are now directly part of the Storely class and each storage adapter.

**v5 (before):**
```javascript
const store = new Storely();
console.log(store.opts.namespace);
```

**v6 (after):**
```javascript
const store = new Storely();
console.log(store.namespace);
```

---

### Serialization Replaces `stringify` and `parse`

The `stringify` and `parse` options have been replaced with the new `serialization` property that accepts a serialization adapter.

**v5 (before):**
```javascript
import Storely from 'storely';

const store = new Storely({
  serialize: JSON.stringify,
  deserialize: JSON.parse
});
```

**v6 (after):**
```javascript
import Storely from 'storely';
import StorelySerialize from '@storely/serialize';

const store = new Storely({ serialization: new StorelySerialize() });
```

See [Serialization Adapters](#serialization-adapters) for more details.

---

### Hookified for Events and Hooks

Storely now extends [Hookified](https://hookified.org) directly, replacing the custom `EventManager` and `HooksManager` classes. This unifies the event/hook system across Storely and all storage adapters.

**Breaking Changes:**
- `store.hooks.addHandler(event, fn)` is replaced by `store.addHook(event, fn)`
- `store.hooks.removeHandler(event, fn)` is replaced by `store.removeHook({ event, handler: fn })`
- `store.hooks.handlers` is replaced by `store.hooks` (a `Map<string, IHook[]>`)
- Hook names changed from `pre`/`post` to `before:`/`after:` convention
- The `emitErrors` option has been removed
- `throwOnErrors` behavior changed: it now only throws when there are **no** error listeners registered (standard EventEmitter pattern). In v5, it would always re-throw after emitting.

**Hook Name Migration:**

| v5 Hook | v6 Hook |
|---------|---------|
| `StorelyHooks.PRE_SET` (`"preSet"`) | `StorelyHooks.BEFORE_SET` (`"before:set"`) |
| `StorelyHooks.POST_SET` (`"postSet"`) | `StorelyHooks.AFTER_SET` (`"after:set"`) |
| `StorelyHooks.PRE_GET` (`"preGet"`) | `StorelyHooks.BEFORE_GET` (`"before:get"`) |
| `StorelyHooks.POST_GET` (`"postGet"`) | `StorelyHooks.AFTER_GET` (`"after:get"`) |
| `StorelyHooks.PRE_DELETE` (`"preDelete"`) | `StorelyHooks.BEFORE_DELETE` (`"before:delete"`) |
| `StorelyHooks.POST_DELETE` (`"postDelete"`) | `StorelyHooks.AFTER_DELETE` (`"after:delete"`) |

The same pattern applies for `GET_MANY`, `GET_RAW`, `GET_MANY_RAW`, `SET_RAW`, `SET_MANY_RAW` hooks.

The old `PRE_`/`POST_` enum values are deprecated but still work. Storely will emit deprecation warnings when they are used.

**v5 (before):**
```javascript
import Storely, { StorelyHooks } from 'storely';

const store = new Storely();
store.hooks.addHandler(StorelyHooks.PRE_SET, (data) => {
  console.log(`Setting ${data.key}`);
});
```

**v6 (after):**
```javascript
import Storely, { StorelyHooks } from 'storely';

const store = new Storely();
store.addHook(StorelyHooks.BEFORE_SET, (data) => {
  console.log(`Setting ${data.key}`);
});
```

**Events:**
Events work the same as before, but now use Hookified internally:

```javascript
import Storely from 'storely';

const store = new Storely();

store.on('error', (err) => {
  console.error('Storely error:', err);
});

store.on('disconnect', () => {
  console.log('Disconnected');
});
```

**Error Handling:**
The `throwOnErrors` option still works and defaults to `false`. When enabled, errors will throw if there are **no** error listeners registered (via hookified's `throwOnEmitError`). If you have an error listener, the error is passed to the listener instead of being thrown. This follows the standard Node.js EventEmitter pattern.

```javascript
const store = new Storely({ throwOnErrors: true });

// Error will throw because there is no error listener
await store.get('key'); // throws if the store errors

// Error will NOT throw because there is a listener handling it
store.on('error', (err) => console.error(err));
await store.get('key'); // error passed to listener instead
```

Additionally, `throwOnEmptyListeners` is now enabled by default. This means that if an error event is emitted with **no** error listeners registered, it will always throw — even without `throwOnErrors` enabled. This is the standard Node.js EventEmitter behavior for unhandled errors. To silently discard errors, register a no-op listener:

```javascript
store.on('error', () => {});
```

For more about Hookified, visit [https://hookified.org](https://hookified.org).

---

### `deleteMany` Returns `boolean[]`

`deleteMany` now returns a `boolean[]` indicating the success of each deletion. The `StorageAdapter` interface has been updated accordingly.

**v5 (before):**
```javascript
import Storely from 'storely';

const store = new Storely();
await store.set('key1', 'value1');
await store.set('key2', 'value2');

const result = await store.deleteMany(['key1', 'key2']);
// result was: boolean (true if all deleted)
```

**v6 (after):**
```javascript
import Storely from 'storely';

const store = new Storely();
await store.set('key1', 'value1');
await store.set('key2', 'value2');

const results = await store.deleteMany(['key1', 'key2']);
// results: [true, true] - boolean for each key
console.log(results[0]); // true - key1 was deleted
console.log(results[1]); // true - key2 was deleted
```

---

### `setMany` Uses `StorelyEntry[]` and Returns `boolean[]`

`setMany` now uses the `StorelyEntry[]` type for input and returns `boolean[]` to indicate success for each entry.

**v5 (before):**
```javascript
import Storely from 'storely';

const store = new Storely();
await store.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2' }
]);
```

**v6 (after):**
```javascript
import Storely from 'storely';

const store = new Storely();

// Using StorelyEntry[] type
const entries = [
  { key: 'key1', value: 'value1', ttl: 1000 },
  { key: 'key2', value: 'value2' }
];

const results = await store.setMany(entries);
// results: [true, true] - boolean for each entry
console.log(results[0]); // true - key1 was set
console.log(results[1]); // true - key2 was set
```

---

### `get` and `getMany` No Longer Support Raw

Since Storely v5.5, we added `getRaw` and `getManyRaw` methods. In v6, raw support has been removed from `get` and `getMany`.

**v5 (before):**
```javascript
import Storely from 'storely';

const store = new Storely();
await store.set('key', 'value', 1000);

const value = await store.get('key');
const rawValue = await store.get('key', { raw: true });
// rawValue: { value: 'value', expires: 1234567890 }
```

**v6 (after):**
```javascript
import Storely from 'storely';

const store = new Storely();
await store.set('key', 'value', 1000);

// Use get for the value
const value = await store.get('key');
// value: 'value'

// Use getRaw for the raw format
const rawValue = await store.getRaw('key');
// rawValue: { value: 'value', expires: 1234567890 }

// For multiple keys
const values = await store.getMany(['key1', 'key2']);
const rawValues = await store.getManyRaw(['key1', 'key2']);
```

---

### Iterator Changes

The iterator is now a proper class method instead of a dynamically assigned property. It no longer requires any arguments — namespace handling is automatic.

Key changes:
- `iterator()` is now a built-in async generator method, not an assignable property
- No arguments required (previously required `store.namespace`)
- Automatically handles Map stores, storage adapters with `iterator()`, and unsupported stores
- Expired entries are automatically filtered and deleted during iteration
- The `IteratorFunction` type has been removed
- If the store does not support iteration, an `error` event is emitted instead of throwing

**v5 (before):**
```javascript
import Storely from 'storely';

const store = new Storely();
await store.set('key1', 'value1');
await store.set('key2', 'value2');

for await (const [key, value] of store.iterator(store.namespace)) {
  console.log(key, value);
}
```

**v6 (after):**
```javascript
import Storely from 'storely';

const store = new Storely();
await store.set('key1', 'value1');
await store.set('key2', 'value2');

for await (const [key, value] of store.iterator()) {
  console.log(key, value);
}
```

---

### Removed `.ttlSupport` from Storage Adapters

The `ttlSupport` property has been removed from storage adapters. Storely now automatically detects the storage adapter type and uses `StorelyMemoryAdapter` for adapters that don't natively support TTL.

**v5 (before):**
```javascript
class MyAdapter {
  ttlSupport = false;
  // ...
}
```

**v6 (after):**
```javascript
// No need to specify ttlSupport
// Storely automatically handles TTL through StorelyMemoryAdapter if needed
class MyAdapter {
  // ...
}
```

---

### Returns `undefined` Instead of `null`

Storely now consistently returns `undefined` instead of `null` for missing values. Previously, some storage adapters returned `null`, which was passed through. Now we normalize to `undefined`.

**v5 (before):**
```javascript
const value = await store.get('nonexistent');
// value could be null or undefined depending on the adapter
```

**v6 (after):**
```javascript
const value = await store.get('nonexistent');
// value is always undefined
```

---

### Compression Adapter Interface Change

Compression adapters now use a simplified interface:

```typescript
interface StorelyCompression {
  compress: (value: string) => string;
  decompress: (value: string) => T;
}
```

**Important:** Compression requires `serialization` to be enabled (default) or values must be strings.

**v6 usage:**
```javascript
import Storely from 'storely';
import StorelyGzip from '@storely/compress-gzip';

const compression = new StorelyGzip();
const store = new Storely({ compression });

// Serialization is enabled by default (@storely/serialize)
await store.set('key', { foo: 'bar' });
```

> **Note:** Encryption and compression require string values. If your values are not strings, you must use `serialization`.

---

### `@storely/memcache` Moves from `memjs` to `memcache`

The `@storely/memcache` package will switch its underlying Memcached client library from [`memjs`](https://www.npmjs.com/package/memjs) to [`memcache`](https://www.npmjs.com/package/memcache).

**Why the change:**
- `memjs` uses the binary protocol and has not been actively maintained
- `memcache` is actively maintained with a promise-based API and support for features such as consistent hashing, connection pooling, and hooks/events

**What this means for you:**
- If you are using `@storely/memcache` through Storely with default settings, **no changes are needed** — the adapter API remains the same
- If you are passing `memjs`-specific client options through to the underlying client, you will need to update them to match the `memcache` client API

---

## New Features

### Storely v6 Versioning

Starting with v6, all Storely packages and adapters will use **unified versioning**. This means every package in the Storely ecosystem will share the same version number and be released together.

**What this means for you:**
- All `@storely/*` packages will have the same version (e.g., `storely@6.0.0`, `@storely/redis@6.0.0`, `@storely/sqlite@6.0.0`)
- When you upgrade Storely, you can upgrade all adapters to the same version with confidence that they are compatible
- No more wondering which adapter version works with which Storely version

**Example of unified versions:**
```
storely: 6.0.0
@storely/redis: 6.0.0
@storely/sqlite: 6.0.0
@storely/postgres: 6.0.0
@storely/serialize: 6.0.0
@storely/compress-gzip: 6.0.0
```

This approach is used by many popular projects:
- **[Vitest](https://vitest.dev)** - All packages in the Vitest monorepo share the same version
- **[Babel](https://babeljs.io)** - All `@babel/*` packages are versioned together
- **[Jest](https://jestjs.io)** - All Jest packages use unified versioning
- **[Angular](https://angular.io)** - All `@angular/*` packages share the same version
- **[Vue](https://vuejs.org)** - Vue and its companion packages are versioned together

Unified versioning simplifies dependency management and ensures compatibility across the entire Storely ecosystem.

### Storely v5 Maintenance Mode

With the release of Storely v6, Storely v5 will move to maintenance mode. No major functionality will be added to Storely v5. Only maintenance and security fixes will be applied going forward.

We encourage all users to migrate to v6 to take advantage of the latest features and improvements. The `v5` branch will remain available in the mono repo for reference.

---

### Browser Compatibility

Storely v6 is now fully compatible with browser environments. You can use Storely in frontend applications with appropriate storage adapters.

```javascript
import Storely from 'storely';

// Works in the browser
const store = new Storely({ store: new Map() });
```

---

### Serialization Adapters

The default serialization module is `@storely/serialize`, which uses the built-in `JSON` module. The property has been simplified to just `serialization`.

```javascript
import Storely from 'storely';
import StorelySerialize from '@storely/serialize';

const store = new Storely({ serialization: new StorelySerialize() });

// You can also set it via the property
store.serialization = new StorelySerialize();
```

**Available Serialization Adapters:**

| Package | Description |
|---------|-------------|
| `@storely/serialize` | **Default** - Based on built-in `JSON` |
| `@storely/serialize-superjson` | Supports `BigInt`, `Date`, `Map`, `Set`, and more |
| `@storely/serialize-msgpackr` | High-performance binary serialization |

#### Disabling Serialization

For in-memory storage or when serialization isn't needed (and you're not using encryption/compression):

```javascript
import Storely from 'storely';

const store = new Storely({ store: new Map(), serialization: false });

// Or set via property
store.serialization = undefined;
```

> **Note:** If you want to use encryption or compression, you must have serialization enabled.

#### Custom Serialization

Create your own serialization adapter using the `StorelySerialization` interface:

```typescript
interface StorelySerialization {
  parse: (value: string) => T;
  stringify: (value: unknown) => string;
}
```

```javascript
import Storely from 'storely';

const customSerializer = {
  stringify: (value) => JSON.stringify(value),
  parse: (value) => JSON.parse(value)
};

const store = new Storely({ serialization: customSerializer });
```

---

### Encryption Adapters

You can now add encryption to values with the following adapters:

| Package | Description |
|---------|-------------|
| `@storely/encryption` | Node.js built-in encryption (configurable) |
| `@storely/encryption-browser` | Browser-compatible encryption using `crypto-js` |
| `@storely/encryption-argon` | Modern, high-performance encryption for Node.js |

```javascript
import Storely from 'storely';
import StorelyEncryption from '@storely/encryption';

const encryption = new StorelyEncryption({ key: 'your_secret_key_here' });
const store = new Storely({ encryption });

// Or set via property
store.encryption = encryption;

await store.set('sensitive', { password: 'secret' });
```

#### Custom Encryption

Create your own encryption adapter using the `StorelyEncryption` interface:

```typescript
interface StorelyEncryption {
  encrypt: (value: string) => string;
  decrypt: (value: string) => T;
}
```

> **Note:** Encryption requires string values. Use `serialization` (enabled by default) if your values are not strings.

---

### Native Hashing for Key and Namespace

Storely now supports native hashing when `key` or `namespace` is too long. By default, this is not enabled but if you set `keyLength` or `namespaceLength` and submit a key it will use hashing to keep the maximum length and not error out. This helps with many of the storage adapters such as `memcache`, `postgres`, `mysql`, `sqlite`, etc.

```javascript
import Storely from 'storely';

const store = new Storely({
  keyLength: 255,
  namespaceLength: 255,
});
```

You can even set what hash algorithm to use via the `hash` property as we use [hashery](https://npmjs.org/package/hashery).

```javascript
import Storely from 'storely';

const store = new Storely({
  keyLength: 255,
  namespaceLength: 255,
  hashAlgorithm: 'SHA-256'
});

// or via properties

store.hash.defaultAlgorithm = 'DJB2';
```

### New Identification Functions

Storely v6 provides new functions to help identify adapters and capabilities.

#### `isStorely`

Detects if an object is a Storely instance by checking for Storely-specific methods and properties:

```javascript
import Storely, { isStorely } from 'storely';

const store = new Storely();

isStorely(new Map());
// { storely: false, get: true, set: true, delete: true, clear: true, has: true,
//   getMany: false, setMany: false, deleteMany: false, hasMany: false,
//   disconnect: false, getRaw: false, getManyRaw: false, hooks: false,
//   stats: false, iterator: false }

isStorely(store);
// { storely: true, get: true, set: true, delete: true, clear: true, has: true,
//   getMany: true, setMany: true, deleteMany: true, hasMany: true,
//   disconnect: true, getRaw: true, getManyRaw: true, hooks: true,
//   stats: true, iterator: false }
```

The `storely` property is `true` when the object has all core Storely methods (`get`, `set`, `delete`, `clear`) plus `hooks` and `stats` properties.

#### `isStorelyStorage`

Detects if an object is a Storely storage adapter by checking for required adapter methods:

```javascript
import { isStorelyStorage } from 'storely';

isStorelyStorage(new Map());
// { storelyStorage: false, get: true, set: true, delete: true, clear: true,
//   has: true, getMany: false, setMany: false, deleteMany: false,
//   hasMany: false, disconnect: false, iterator: false, namespace: false }

isStorelyStorage(redisAdapter);
// { storelyStorage: true, get: true, set: true, delete: true, clear: true,
//   has: true, getMany: true, setMany: true, deleteMany: true,
//   hasMany: true, disconnect: true, iterator: true, namespace: true }
```

The `storelyStorage` property is `true` when the object has all core storage adapter methods (`get`, `set`, `delete`, `clear`).

#### Additional Capability Checks

Storely v6 also provides functions for checking compression, serialization, and encryption adapters:

```javascript
import { isStorelyCompression, isStorelySerialization, isStorelyEncryption } from 'storely';

isStorelyCompression(gzipAdapter);
// { storelyCompression: true, compress: true, decompress: true }

isStorelySerialization(customSerializer);
// { storelySerialization: true, stringify: true, parse: true }

isStorelyEncryption(aesAdapter);
// { storelyEncryption: true, encrypt: true, decrypt: true }
```

---

### Memory Adapter

Storely v6 includes `StorelyMemoryAdapter`, a wrapper class for storage types that don't conform to v6 storage adapter requirements (such as `Map`-compatible or legacy adapters).

**Features:**
- Handles namespacing using key prefixing
- Extends the adapter with v6 functions: `getMany`, `setMany`, `getRaw`, `getManyRaw`
- Attempts iteration using various strategies
- Adds TTL support and handles expiration

```javascript
import Storely from 'storely';

// Map-compatible stores are automatically wrapped
const store = new Storely({ store: new Map() });

// Check if your adapter will use StorelyMemoryAdapter
const capabilities = store.getStoreCapabilities(yourStore);
if (capabilities.mapCompatible && !capabilities.adapter) {
  console.log('This store will use StorelyMemoryAdapter');
}
```

---

## Getting Help

If you encounter issues during migration:

1. Check the [Storely documentation](https://storely.org)
2. Search [existing issues](../../issues)
3. Open a [new issue](../../issues/new) with details about your migration problem