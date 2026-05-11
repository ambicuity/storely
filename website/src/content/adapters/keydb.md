---
title: "KeyDB"
slug: "keydb"
npm: "@ambicuity/keydb"
tier: "experimental"
tagline: "Multithreaded Redis-protocol server."
source: "storage/keydb"
---
# @ambicuity/keydb

> ⚠️ **Experimental.** Batch operations (`getMany` / `setMany` / `deleteMany`)
> can hang indefinitely if the server becomes unreachable mid-pipeline; the
> `@redis/client` library queues commands during reconnection without a
> per-command timeout. Do not put live traffic on this adapter until that
> is fixed. See [docs/audits/2026-05-09](../../docs/audits/2026-05-09-production-readiness-audit.md).

> KeyDB storage adapter for Storely

> **Note:** KeyDB is Redis-protocol compatible and uses the same `@redis/client` library. This adapter leverages the `node-redis` client to connect to KeyDB instances, just as you would with Redis.

# Features
* Built on top of [@redis/client](https://npmjs.com/package/@redis/client).
* TTL is handled directly by KeyDB.
* Supports KeyDB Clusters.
* Url connection string support or pass in your KeyDB Options
* Easily add in your own KeyDB client.
* Namespace support for key management.
* Unlink as default delete method for performance.
* Access to the KeyDB client for advanced use cases.
* Storely and Redis Libraries are exported for advanced use cases.
* `createStorelyKeyDB` function for easy creation of Storely instances.
* jsDoc comments for easy documentation.
* CJS / ESM and TypeScript supported out of the box.

# Table of Contents
* [Usage](#usage)
* [Using the createStorelyKeyDB function](#using-the-createstorelykeydb-function)
* [Using the createStorelyKeyDBNonBlocking function](#using-the-createstorelykeydbnonblocking-function)
* [Namespaces](#namespaces)
* [Fixing Double Prefixing of Keys](#fixing-double-prefixing-of-keys)
* [Using Generic Types](#using-generic-types)
* [Performance Considerations](#performance-considerations)
* [High Memory Usage on KeyDB Server](#high-memory-usage-on-keydb-server)
* [Gracefully Handling Errors and Timeouts](#gracefully-handling-errors-and-timeouts)
* [Using Cacheable with KeyDB](#using-cacheable-with-keydb)
* [Clustering](#clustering)
* [Sentinel](#sentinel)
* [TLS Support](#tls-support)
* [Storely KeyDB Options](#storely-keydb-options)
* [API](#api)
* [Using Custom KeyDB Client Events](#using-custom-keydb-client-events)
* [Using with NestJS](#using-with-nestjs)
* [License](#license)

# Installation

```bash
npm install --save storely @ambicuity/keydb
```

# Usage

Here is a standard use case where we implement `Storely` and `@ambicuity/keydb`:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB from '@ambicuity/keydb';

const storely = new Storely(new StorelyKeyDB('keydb://user:pass@localhost:6378'));
storely.on('error', handleConnectionError);
```

Here is the same example but with the `Storely` instance created with the `createStorelyKeyDB` function:

```js
import { createStorelyKeyDB } from '@ambicuity/keydb';

const storely = createStorelyKeyDB('keydb://user:pass@localhost:6378');
```

You only have to import the `@ambicuity/keydb` library if you are using the `createStorelyKeyDB` function. 🎉 Otherwise, you can import `Storely` and `@ambicuity/keydb` independently.

Here you can pass in the KeyDB options directly:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB from '@ambicuity/keydb';

const uri = "keydb://localhost:6378";

// NOTE: please use the settings that you need to configure. Check out Storely KeyDB Options section
const options = {
  namespace: "test",
  keyPrefixSeparator: "->",
  clearBatchSize: 100,
  useUnlink: true,
  noNamespaceAffectsAll: true,
};

const storelyKeyDB = new StorelyKeyDB(uri, options);

const storely = new Storely(storelyKeyDB);
```

Or you can create a new KeyDB instance and pass it in with `StorelyOptions` such as setting the `store`:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB, { createClient } from '@ambicuity/keydb';

const keydb = createClient('keydb://user:pass@localhost:6378');
const storelyKeyDB = new StorelyKeyDB(keydb);
const storely = new Storely({ store: storelyKeyDB});
```

# Storely KeyDB Options

You can pass in options to the `StorelyKeyDB` constructor. Here are the available options:

```typescript
export type StorelyKeyDBOptions = {
	/**
	 * Namespace for the current instance.
	 */
	namespace?: string;
	/**
	 * Separator to use between namespace and key.
	 */
	keyPrefixSeparator?: string;
	/**
	 * Number of keys to delete in a single batch.
	 */
	clearBatchSize?: number;
	/**
	 * Enable Unlink instead of using Del for clearing keys. This is more performant but may not be supported by all KeyDB versions.
	 */
	useUnlink?: boolean;

	/**
	 * Whether to allow clearing all keys when no namespace is set.
	 * If set to true and no namespace is set, iterate() will return all keys.
	 * Defaults to `false`.
	 */
	noNamespaceAffectsAll?: boolean;

	/**
	 * This is used to throw an error if the client is not connected when trying to connect. By default, this is
	 * set to true so that it throws an error when trying to connect to the KeyDB server fails.
	 */
	throwOnConnectError?: boolean;

	/**
	 * This is used to throw an error if at any point there is a failure. Use this if you want to
	 * ensure that all operations are successful and you want to handle errors. By default, this is
	 * set to false so that it does not throw an error on every operation and instead emits an error event
	 * and returns no-op responses.
	 * @default false
	 */
	throwOnErrors?: boolean;

	/**
	 * Timeout in milliseconds for the connection. Default is undefined, which uses the default timeout of the KeyDB client.
	 * If set, it will throw an error if the connection does not succeed within the specified time.
	 * @default undefined
	 */
	connectionTimeout?: number;
};
```
You can pass these options when creating a new `StorelyKeyDB` instance:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB from '@ambicuity/keydb';

const storelyKeyDB = new StorelyKeyDB('keydb://user:pass@localhost:6378', {
  namespace: 'my-namespace',
  keyPrefixSeparator: ':',
  clearBatchSize: 1000,
  useUnlink: true,
  noNamespaceAffectsAll: false,
  connectionTimeout: 200
});

const storely = new Storely({ store: storelyKeyDB });
```

You can also set these options after the fact by using the `StorelyKeyDB` instance properties:

```js
import {createStorelyKeyDB} from '@ambicuity/keydb';

const storely = createStorelyKeyDB('keydb://user:pass@localhost:6378');
storely.store.namespace = 'my-namespace';
```

# Using the `createStorelyKeyDB` function

The `createStorelyKeyDB` function is a convenience function that creates a new `Storely` instance with the `@ambicuity/keydb` store. It automatically sets the `useKeyPrefix` option to `false`. Here is an example of how to use it:

```js
import { createStorelyKeyDB } from '@ambicuity/keydb';
const storely = createStorelyKeyDB('keydb://user:pass@localhost:6378');
```

To use a namespace you can do it here and this will set Storely up correctly to avoid the double namespace issue:

```js
import { createStorelyKeyDB } from '@ambicuity/keydb';
const storely = createStorelyKeyDB('keydb://user:pass@localhost:6378', {namespace: 'my-namespace'});
```

# Using the `createStorelyKeyDBNonBlocking` function

The `createStorelyKeyDBNonBlocking` function is a convenience function that creates a new `Storely` instance with the `@ambicuity/keydb` store does what `createStorelyKeyDB` does but also disables throwing errors, removes the offline queue redis functionality, and reconnect strategy so that when used as a secondary cache in libraries such as [cacheable](https://npmjs.org/package/cacheable) it does not block the primary cache. This is useful when you want to use KeyDB as a secondary cache and do not want to block the primary cache on connection errors or timeouts when using `nonBlocking`. Here is an example of how to use it:

```js
import { createStorelyKeyDBNonBlocking } from '@ambicuity/keydb';
const storely = createStorelyKeyDBNonBlocking('keydb://user:pass@localhost:6378');
```

# Namespaces

By default namespacing is turned off, this is done because it causes much more memory / performance usage for KeyDB.

KeyDB does **not** treat colons (`:`) or namespaces as special—there are no hierarchical keys or namespace mechanics internally. The dramatic memory savings you see when removing prefixes like `namespace:` come from one thing: **key length**. KeyDB stores every key as a full string in memory, wrapped in an SDS structure and allocated by jemalloc. Longer keys (e.g., `namespace:key123`) fall into larger jemalloc size classes, require more bytes for the SDS header, and cause more fragmentation. Shorter keys (e.g., `key123`) fit into much smaller slabs, pack tightly, and result in far more stable and predictable memory usage.

This means the colon is not the issue—**the extra characters are.** A key that goes from ~18 bytes to ~6 bytes can use *half the memory per key* once overhead, allocator classes, and fragmentation are considered. Multiply that by hundreds of thousands or millions of keys, and memory usage becomes significantly smaller and much more stable simply because the keys are shorter.

## How to use Namespaces

You can set a namespace for your keys. This is useful if you want to manage your keys in a more organized way. Here is an example of how to set a `namespace` with the `store` option:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB, { createClient } from '@ambicuity/keydb';

const keydb = createClient('keydb://user:pass@localhost:6378');
const storelyKeyDB = new StorelyKeyDB(keydb);
const storely = new Storely({ store: storelyKeyDB, namespace: 'my-namespace', useKeyPrefix: false });
```

To make this easier, you can use the `createStorelyKeyDB` function which will automatically set the `namespace` option to the `StorelyKeyDB` instance:

```js
import { createStorelyKeyDB } from '@ambicuity/keydb';
const storely = createStorelyKeyDB('keydb://user:pass@localhost:6378', { namespace: 'my-namespace' });
```

This will prefix all keys with `my-namespace:` and will also set `useKeyPrefix` to `false`. This is done to avoid double prefixing of keys as we transition out of the legacy behavior in Storely. You can also set the namespace after the fact:

```js
storely.namespace = 'my-namespace';
```

NOTE: If you plan to do many clears or deletes, it is recommended to read the [Performance Considerations](#performance-considerations) section.

# Fixing Double Prefixing of Keys

If you are using `Storely` with `@ambicuity/keydb` as the storage adapter, you may notice that keys are being prefixed twice. This is because `Storely` has a default prefixing behavior that is applied to all keys. To fix this, you can set the `useKeyPrefix` option to `false` when creating the `Storely` instance:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB from '@ambicuity/keydb';

const storely = new Storely(new StorelyKeyDB('keydb://user:pass@localhost:6378'), { useKeyPrefix: false });
```

To make this easier, you can use the `createStorelyKeyDB` function which will automatically set the `useKeyPrefix` option to `false`:

```js
import { createStorelyKeyDB } from '@ambicuity/keydb';
const storely = createStorelyKeyDB('keydb://user:pass@localhost:6378');
```

## Using Generic Types

When initializing `StorelyKeyDB`, you can specify the type of the values you are storing and you can also specify types when calling methods:

```typescript
import Storely from '@ambicuity/storely';
import StorelyKeyDB, { createClient } from '@ambicuity/keydb';


type User {
  id: number
  name: string
}

const keydb = createClient('keydb://user:pass@localhost:6378');

const storelyKeyDB = new StorelyKeyDB<User>(keydb);
const storely = new Storely({ store: storelyKeyDB });

await storely.set("user:1", { id: 1, name: "Alice" })
const user = await storely.get("user:1")
console.log(user.name) // 'Alice'

// specify types when calling methods
const user = await storely.get<User>("user:1")
console.log(user.name) // 'Alice'
```

# Performance Considerations

With namespaces being prefix based it is critical to understand some of the performance considerations we have made:
* `clear()` - We use the `SCAN` command to iterate over keys. This is a non-blocking command that is more efficient than `KEYS`. In addition we are using `UNLINK` by default instead of `DEL`. Even with that if you are iterating over a large dataset it can still be slow. It is highly recommended to use the `namespace` option to limit the keys that are being cleared and if possible to not use the `clear()` method in high performance environments. If you don't set namespaces, you can enable `noNamespaceAffectsAll` to clear all keys using the `FLUSHDB` command which is faster and can be used in production environments.

* `delete()` - By default we are now using `UNLINK` instead of `DEL` for deleting keys. This is a non-blocking command that is more efficient than `DEL`. If you are deleting a large number of keys it is recommended to use the `deleteMany()` method instead of `delete()`.

* `clearBatchSize` - The `clearBatchSize` option is set to `1000` by default. This is because KeyDB has a limit of 1000 keys that can be deleted in a single batch. If no namespace is defined and noNamespaceAffectsAll is set to `true` this option will be ignored and the `FLUSHDB` command will be used instead.

* `useUnlink` - This option is set to `true` by default. This is because `UNLINK` is a non-blocking command that is more efficient than `DEL`. If you are not using `UNLINK` and are doing a lot of deletes it is recommended to set this option to `true`.

* `setMany`, `getMany`, `deleteMany` - These methods are more efficient than their singular counterparts. These will be used by default in the `Storely` library such as when using `storely.delete(string[])` it will use `deleteMany()`.

If you want to see even better performance please see the [Using Cacheable with KeyDB](#using-cacheable-with-keydb) section as it has non-blocking and in-memory primary caching that goes along well with this library and Storely.

# High Memory Usage on KeyDB Server

This is because we are using `UNLINK` by default instead of `DEL`. This is a non-blocking command that is more efficient than `DEL` but will slowly remove the memory allocation. 

If you are deleting or clearing a large number of keys you can disable this by setting the `useUnlink` option to `false`. This will use `DEL` instead of `UNLINK` and should reduce the memory usage.

```js
const storely = new Storely(new StorelyKeyDB('keydb://user:pass@localhost:6378', { useUnlink: false }));
// Or
storely.useUnlink = false;
```

# Gracefully Handling Errors and Timeouts

When using `@ambicuity/keydb`, it is important to handle connection errors gracefully. You can do this by listening to the `error` event on the `StorelyKeyDB` instance. Here is an example of how to do that:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB from '@ambicuity/keydb';
const storely = new Storely(new StorelyKeyDB('keydb://user:pass@localhost:6378'));
storely.on('error', (error) => {
  console.error('error', error);
});
```

By default, the `StorelyKeyDB` instance will `throw an error` if the connection fails to connect. You can disable this behavior by setting the `throwOnConnectError` option to `false` when creating the `StorelyKeyDB` instance. If you want this to throw you will need to also set the Storely instance to `throwOnErrors: true`:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB from '@ambicuity/keydb';

const storely = new Storely(new StorelyKeyDB('keydb://bad-uri:1111', { throwOnConnectError: false }));
storely.throwOnErrors = true; // This will throw an error if the connection fails

await storely.set('key', 'value'); // this will throw the connection error only.
```

On `get`, `getMany`, `set`, `setMany`, `delete`, and `deleteMany`, if the connection is lost, it will emit an error and return a no-op value. You can catch this error and handle it accordingly. This is important to ensure that your application does not crash due to a lost connection to KeyDB.

If you want to handle connection errors, retries, and timeouts more gracefully, you can use the `throwOnErrors` option. This will throw an error if any operation fails, allowing you to catch it and handle it accordingly:

There is a default `Reconnect Strategy` if you pass in just a `uri` connection string we will automatically create a KeyDB client for you with the following reconnect strategy:

```typescript
export const defaultReconnectStrategy = (attempts: number): number | Error => {
	// Exponential backoff base: double each time, capped at 2s.
	// Parentheses make it clear we do (2 ** attempts) first, then * 100
	const backoff = Math.min((2 ** attempts) * 100, 2000);

	// Add random jitter of up to ±50ms to avoid thundering herds:
	const jitter = (Math.random() - 0.5) * 100;

	return backoff + jitter;
};
```

# Using Cacheable with KeyDB

If you are wanting to see even better performance with KeyDB, you can use [Cacheable](https://npmjs.org/package/cacheable) which is a multi-layered cache library that has in-memory primary caching and non-blocking secondary caching. Here is an example of how to use it with KeyDB:

```js
import StorelyKeyDB from '@ambicuity/keydb';
import Cacheable from 'cacheable';

const secondary = new StorelyKeyDB('keydb://user:pass@localhost:6378');

const cache = new Cacheable( { secondary } );
```

For even higher performance you can set the `nonBlocking` option to `true`:

```js
const cache = new Cacheable( { secondary, nonBlocking: true } );
```

This will make it so that the secondary does not block the primary cache and will be very fast. 🚀

# Clustering

If you are using a KeyDB Cluster, you can pass in the `redisOptions` directly. Here is an example of how to do that:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB, { createCluster } from '@ambicuity/keydb';

const cluster = createCluster({
    rootNodes: [
      {
        url: 'keydb://127.0.0.1:7000',
      },
      {
        url: 'keydb://127.0.0.1:7001',
      },
      {
        url: 'keydb://127.0.0.1:7002',
      },
    ],
});

const storely = new Storely({ store: new StorelyKeyDB(cluster) });
```

You can learn more about the `createCluster` function in the [documentation](https://github.com/redis/node-redis/blob/master/docs/clustering.md) at https://github.com/redis/node-redis/tree/master/docs.

# Sentinel

If you are using Sentinel to provide high availability for your KeyDB instances, you can pass in the sentinel options directly to the `StorelyKeyDB` constructor:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB from '@ambicuity/keydb';

const storely = new Storely({
  store: new StorelyKeyDB({
    name: 'mymaster',
    sentinelRootNodes: [
      { host: '127.0.0.1', port: 26379 },
      { host: '127.0.0.1', port: 26380 },
      { host: '127.0.0.1', port: 26381 },
    ],
  }),
});
```

For TypeScript users, the `RedisSentinelOptions` type is exported from the package:

```typescript
import StorelyKeyDB, { type RedisSentinelOptions } from '@ambicuity/keydb';

const sentinelOptions: RedisSentinelOptions = {
  name: 'mymaster',
  sentinelRootNodes: [
    { host: '127.0.0.1', port: 26379 },
    { host: '127.0.0.1', port: 26380 },
    { host: '127.0.0.1', port: 26381 },
  ],
};

const storelyKeyDB = new StorelyKeyDB(sentinelOptions);
```

You can learn more about Sentinel configuration in the [documentation](https://github.com/redis/node-redis/blob/master/docs/sentinel.md) at https://github.com/redis/node-redis/tree/master/docs.

# TLS Support

Here is an example of how to use TLS using the `redisOptions`:

```js
import Storely from '@ambicuity/storely';
import StorelyKeyDB from '@ambicuity/keydb';

const tlsOptions = {
    socket: {
      host: 'localhost',
      port: 6378,
      tls: true,  // Enable TLS connection
      rejectUnauthorized: false,  // Ignore self-signed certificate errors (for testing)
      
      // Alternatively, provide CA, key, and cert for mutual authentication
      ca: fs.readFileSync('/path/to/ca-cert.pem'),
      cert: fs.readFileSync('/path/to/client-cert.pem'),  // Optional for client auth
      key: fs.readFileSync('/path/to/client-key.pem'),    // Optional for client auth
    }
};

const storely = new Storely({ store: new StorelyKeyDB(tlsOptions) });
```

# Storely KeyDB Options

Here are all the options that you can set on the constructor

```ts
export type StorelyKeyDBOptions = {
	/**
	 * Namespace for the current instance.
	 */
	namespace?: string;
	/**
	 * Separator to use between namespace and key.
	 */
	keyPrefixSeparator?: string;
	/**
	 * Number of keys to delete in a single batch.
	 */
	clearBatchSize?: number;
	/**
	 * Enable Unlink instead of using Del for clearing keys. This is more performant but may not be supported by all KeyDB versions.
	 */
	useUnlink?: boolean;

	/**
	 * Whether to allow clearing all keys when no namespace is set.
	 * If set to true and no namespace is set, iterate() will return all keys.
	 * Defaults to `false`.
	 */
	noNamespaceAffectsAll?: boolean;

	/**
	 * This is used to throw an error if the client is not connected when trying to connect. By default, this is
	 * set to true so that it throws an error when trying to connect to the KeyDB server fails.
	 */
	throwOnConnectError?: boolean;

	/**
	 * This is used to throw an error if at any point there is a failure. Use this if you want to
	 * ensure that all operations are successful and you want to handle errors. By default, this is
	 * set to false so that it does not throw an error on every operation and instead emits an error event
	 * and returns no-op responses.
	 * @default false
	 */
	throwOnErrors?: boolean;

	/**
	 * Timeout in milliseconds for the connection. Default is undefined, which uses the default timeout of the KeyDB client.
	 * If set, it will throw an error if the connection does not succeed within the specified time.
	 * @default undefined
	 */
	connectionTimeout?: number;
};
```

# API
* **constructor([connection], [options])**
* **namespace** - The namespace to use for the keys.
* **client** - The KeyDB client instance.
* **keyPrefixSeparator** - The separator to use between the namespace and key. It can be set to a blank string.
* **clearBatchSize** - The number of keys to delete in a single batch. Has to be greater than 0. Default is `1000`.
* **useUnlink** - Use the `UNLINK` command for deleting keys instead of `DEL`.
* **noNamespaceAffectsAll**: Whether to allow clearing all keys when no namespace is set (default is `false`).
* **set** - Set a key.
* **setMany** - Set multiple keys using `StorelyEntry<Value>` objects (`{ key: string, value: Value, ttl?: number }`) via `MULTI/EXEC` transactions. Returns `boolean[]` with per-entry success tracking by inspecting each command's result. In cluster mode, entries are grouped by hash slot with results mapped back to the original order.
* **get** - Get a key.
* **getMany** - Get multiple keys.
* **has** - Check if a key exists.
* **hasMany** - Check if multiple keys exist.
* **delete** - Delete a key.
* **deleteMany** - Delete multiple keys. Returns `boolean[]`.
* **clear** - Clear all keys in the namespace. If the namespace is not set it will clear all keys that are not prefixed with a namespace unless `noNamespaceAffectsAll` is set to `true`.
* **disconnect** - Disconnect from the KeyDB server using `Quit` command. If you set `force` to `true` it will force the disconnect.
* **iterator** - Create a new iterator for the keys. The iterator uses the namespace configured on the instance. If no namespace is set it will iterate over all keys that are not prefixed with a namespace unless `noNamespaceAffectsAll` is set to `true`.

# Using Custom KeyDB Client Events

Storely by default supports the `error` event across all storage adapters. If you want to listen to other events you can do so by accessing the `client` property of the `StorelyKeyDB` instance. Here is an example of how to do that:

```js
import {createStorelyKeyDB} from '@ambicuity/keydb';

const storely = createStorelyKeyDB('keydb://user:pass@localhost:6378');
const keydbClient = storely.store.client;

keydbClient.on('connect', () => {
  console.log('KeyDB client connected');
});

keydbClient.on('reconnecting', () => {
  console.log('KeyDB client reconnecting');
});

keydbClient.on('end', () => {
  console.log('KeyDB client disconnected');
});
```

Here are some of the events you can listen to: https://www.npmjs.com/package/redis#events

# Using with NestJS

> You can integrate `@ambicuity/keydb` with NestJS by creating a custom `CacheModule`. This allows you to use Storely as a cache store in your application.

### 1. Install Dependencies

```bash
npm install @ambicuity/keydb storely @nestjs/cache-manager cache-manager cacheable
```

### 2. Create a Cache Module

Create a file `cache.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { createStorelyKeyDB } from '@ambicuity/keydb';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: () => ({
        stores: [createStorelyKeyDB('keydb://localhost:6378')],
      }),
    }),
  ],
  providers: [],
  exports: [],
})
export class CacheModule {}
```

### 3. Import the Cache Module in AppModule
Update `app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CacheModule } from './modules/config/cache/cache.module';

@Module({
  imports: [
    CacheModule, // Import your custom cache module
    // other modules...
  ],
})
export class AppModule {}
```

### 4. Create the Cache Service
Create a file `cache.service.ts`:

```ts
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    await this.cacheManager.set(key, value, ttl);
    return true;
  }

  async delete(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }
}
```

### 5. Register CacheService in CacheModule
Update `cache.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { createStorelyKeyDB } from '@ambicuity/keydb';
import { CacheService } from './services/cache.service';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: () => ({
        stores: [createStorelyKeyDB('keydb://localhost:6378')],
      }),
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
```
### 6. Import CacheModule in the Target Module (e.g. TaskModule)
```ts
import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskRepository } from './repositories/task.repository';
import { CacheModule } from 'src/modules/config/cache/cache.module';

@Module({
  imports: [CacheModule],
  providers: [TaskService, TaskRepository],
})
export class TaskModule {}
```

### 7. Using the Cache in a Service

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskRepository } from '../repositories/task.repository';
import { TaskDto } from '../dto/task.dto';
import { CacheService } from 'src/modules/config/cache/services/cache.service';

@Injectable()
export class TaskService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly cache: CacheService, // Inject the CacheService
  ) {}

  async findById(id: number): Promise<TaskDto> {
    const cacheKey = `task:${id}`;

    // 1. Try to get from cache
    const cached = await this.cache.get<TaskDto>(cacheKey);
    
	if (cached) {
      return cached;
    }

    // 2. If not found in cache, fetch from database
    const task = await this.taskRepository.findById(id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // 3. Set in cache for future requests
    await this.cache.set(cacheKey, task, 300 * 1000); // 5 minutes TTL
    return task;
  }
}
```


You can learn more about caching in NestJS in the [official documentation](https://docs.nestjs.com/techniques/caching#in-memory-cache).


---


# License

[MIT © Ritesh Rana](LICENSE)