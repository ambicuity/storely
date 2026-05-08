
> DynamoDB storage adapter for Storely

[![npm](https://img.shields.io/npm/v/@storely/dynamo.svg)](https://www.npmjs.com/package/@storely/dynamo)
[![npm](https://img.shields.io/npm/dm/@storely/dynamo)](https://npmjs.com/package/@storely/dynamo)

## Features

- Built on [@aws-sdk/client-dynamodb](https://www.npmjs.com/package/@aws-sdk/client-dynamodb) and [@aws-sdk/lib-dynamodb](https://www.npmjs.com/package/@aws-sdk/lib-dynamodb) with full TypeScript support
- TTL support via DynamoDB TTL indexes (6-hour default when no TTL is specified)
- Namespace support for key isolation across multiple Storely instances
- Automatic table creation with `PAY_PER_REQUEST` billing mode
- `setMany`, `getMany`, `deleteMany`, and `hasMany` batch operations
- `createStorely` helper for quick setup

> **Note:** DynamoDB doesn't guarantee data will be deleted immediately upon expiration. See the [DynamoDB TTL documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html) for details.

## Table of Contents

- [Install](#install)
- [Quick Start with createStorely](#quick-start-with-createstorely)
- [Usage](#usage)
- [Usage with Namespaces](#usage-with-namespaces)
- [Usage with NestJS](#usage-with-nestjs)
- [Options](#options)
- [Properties](#properties)
  - [.client](#client)
  - [.namespace](#namespace)
  - [.keyPrefixSeparator](#keyprefixseparator)
  - [.sixHoursInMilliseconds](#sixhoursinmilliseconds)
- [Methods](#methods)
  - [constructor(options?)](#constructoroptions)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value, ttl?)](#setkey-value-ttl)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.formatKey(key)](#formatkeykey)
  - [.createKeyPrefix(key, namespace?)](#createkeyprefixkey-namespace)
  - [.removeKeyPrefix(key, namespace?)](#removekeyprefixkey-namespace)
  - [.ensureTable(tableName)](#ensuretabletablename)
  - [.createTable(tableName)](#createtabletablename)
- [License](#license)

## Install

```shell
npm install --save storely @storely/dynamo
```

## Quick Start with createStorely

```js
import { createStorely } from '@storely/dynamo';

const storely = createStorely({ endpoint: 'http://localhost:8000' });

// set a value
await storely.set('foo', 'bar');

// get a value
const value = await storely.get('foo');

// set with TTL (milliseconds)
await storely.set('foo', 'bar', 6000);

// delete a value
await storely.delete('foo');
```

You can also pass options:

```js
import { createStorely } from '@storely/dynamo';

const storely = createStorely({
  endpoint: 'http://localhost:8000',
  tableName: 'cacheTable',
  namespace: 'my-app',
});
```

## Usage

```js
import Storely from 'storely';
import StorelyDynamo from '@storely/dynamo';

const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
const storely = new Storely(store, { useKeyPrefix: false });

// set a value
await storely.set('foo', 'bar');

// set a value with TTL (in milliseconds)
await storely.set('foo', 'bar', 6000);

// get a value
const value = await storely.get('foo');

// delete a value
await storely.delete('foo');

// clear all values
await storely.clear();
```

## Usage with Namespaces

```js
import Storely from 'storely';
import StorelyDynamo from '@storely/dynamo';

const store1 = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
store1.namespace = 'namespace1';
const storely1 = new Storely(store1, { namespace: 'namespace1', useKeyPrefix: false });

const store2 = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
store2.namespace = 'namespace2';
const storely2 = new Storely(store2, { namespace: 'namespace2', useKeyPrefix: false });

// keys are isolated by namespace
await storely1.set('foo', 'bar1');
await storely2.set('foo', 'bar2');

const value1 = await storely1.get('foo'); // 'bar1'
const value2 = await storely2.get('foo'); // 'bar2'
```

## Usage with NestJS

Since DynamoDB has a 400KB limit per item, compressing data can help in some cases.

### With a payload less than or equal to 400KB

```js
import { Storely } from 'storely'
import { StorelyDynamo } from '@storely/dynamo'
import { CacheModule } from '@nestjs/cache-manager'
import { Module } from '@nestjs/common'

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        return {
          stores: [
            new Storely({
              store: new StorelyDynamo({
                tableName: 'TableName',
              }),
            }),
          ],
        }
      },
    }),
  ],
})
export class InfrastructureModule {}
```

### With a payload greater than 400KB

```js
import { Storely } from 'storely'
import StorelyBrotli from '@storely/compress-brotli'
import { StorelyDynamo } from '@storely/dynamo'
import { CacheModule } from '@nestjs/cache-manager'
import { Module } from '@nestjs/common'

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        return {
          stores: [
            new Storely({
              store: new StorelyDynamo({
                tableName: 'TableName',
              }),
              compression: new StorelyBrotli(),
            }),
          ],
        }
      },
    }),
  ],
})
export class InfrastructureModule {}
```

## Options

Options extend [`DynamoDBClientConfig`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/) so all AWS SDK options (endpoint, region, credentials, etc.) are supported.

| Option | Type | Default | Description |
|---|---|---|---|
| `tableName` | `string` | `'storely'` | The DynamoDB table name. Created automatically if it doesn't exist. |
| `namespace` | `string` | `undefined` | Key prefix for namespace isolation |
| `endpoint` | `string` | — | The DynamoDB endpoint URL (e.g., `'http://localhost:8000'` for local development) |
| `region` | `string` | — | The AWS region (e.g., `'us-east-1'`) |

```js
import StorelyDynamo from '@storely/dynamo';

// Using an endpoint string
const store = new StorelyDynamo('http://localhost:8000');

// Using an options object
const store2 = new StorelyDynamo({ endpoint: 'http://localhost:8000', tableName: 'cacheTable' });
```

## Properties

### .client

The underlying `DynamoDBDocument` client instance. Can be used to access the DynamoDB client directly.

| Type | Default |
|---|---|
| `DynamoDBDocument` | Created from the options |

### .namespace

Key prefix for namespace isolation. When set, all keys are prefixed with `namespace:`.

| Type | Default |
|---|---|
| `string \| undefined` | `undefined` |

### .keyPrefixSeparator

The separator between the namespace and key.

| Type | Default |
|---|---|
| `string` | `':'` |

### .sixHoursInMilliseconds

The default TTL fallback in milliseconds. Used when no TTL is specified in a `set()` call.

| Type | Default |
|---|---|
| `number` | `21600000` (6 hours) |

## Methods

### constructor(options?)

Creates a new `StorelyDynamo` instance. Automatically creates the DynamoDB table if it doesn't exist.

- `options` — A `StorelyDynamoOptions` object or an endpoint string. Defaults to `{ tableName: 'storely' }`.

```js
import StorelyDynamo from '@storely/dynamo';

// Using an endpoint string
const store = new StorelyDynamo('http://localhost:8000');

// Using an options object
const store2 = new StorelyDynamo({ endpoint: 'http://localhost:8000', tableName: 'cacheTable' });
```

### .get(key)

Retrieves a value from DynamoDB. Returns the stored value or `undefined` if the key does not exist.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.set('foo', 'bar');
const result = await store.get('foo'); // 'bar'
```

### .getMany(keys)

Retrieves multiple values from DynamoDB. Returns an array of stored data corresponding to each key.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.getMany(['key1', 'key2']);
```

### .set(key, value, ttl?)

Stores a value in DynamoDB. Uses a 6-hour default TTL if no TTL is specified. TTL is in milliseconds.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.set('foo', 'bar');

// with TTL (milliseconds)
await store.set('foo', 'bar', 60000);
```

### .setMany(entries)

Stores multiple values in DynamoDB using `BatchWriteItem` in chunks of 25. Each entry is a `StorelyEntry<Value>` object (`{ key: string, value: Value, ttl?: number }`), where `Value` is inferred from the entries provided. Returns a `boolean[]` with per-entry success tracking — any items reported as `UnprocessedItems` by DynamoDB are marked as `false`.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
const results = await store.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', ttl: 60000 },
]); // [true, true]
```

### .delete(key)

Deletes a key from DynamoDB. Returns `true` if the key was deleted, `false` otherwise.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.set('foo', 'bar');
const deleted = await store.delete('foo'); // true
```

### .deleteMany(keys)

Deletes multiple keys from DynamoDB. Returns a `boolean[]` indicating whether each key was deleted.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.deleteMany(['key1', 'key2']); // [true, true]
```

### .clear()

Clears data from DynamoDB. If a namespace is set, only keys with the namespace prefix are deleted. Otherwise, all keys are deleted.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.clear();
```

### .has(key)

Checks whether a key exists in DynamoDB.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.set('foo', 'bar');
const exists = await store.has('foo'); // true
const missing = await store.has('baz'); // false
```

### .hasMany(keys)

Checks whether multiple keys exist in DynamoDB. Returns an array of booleans corresponding to each key.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.hasMany(['key1', 'key2', 'key3']); // [true, true, false]
```

### .formatKey(key)

Formats a key by prepending the namespace if one is set. If the key already starts with the namespace prefix, it is returned as-is to avoid double-prefixing.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
store.formatKey('foo'); // 'foo'

store.namespace = 'myapp';
store.formatKey('foo'); // 'myapp:foo'
store.formatKey('myapp:foo'); // 'myapp:foo' (no double-prefix)
```

### .createKeyPrefix(key, namespace?)

Creates a prefixed key by prepending the namespace and separator. Returns the key as-is if no namespace is provided.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
store.createKeyPrefix('key', 'ns'); // 'ns:key'
store.createKeyPrefix('key'); // 'key'
```

### .removeKeyPrefix(key, namespace?)

Removes the namespace prefix from a key. Returns the key as-is if no namespace is provided.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
store.removeKeyPrefix('ns:key', 'ns'); // 'key'
store.removeKeyPrefix('key'); // 'key'
```

### .ensureTable(tableName)

Ensures the DynamoDB table exists and is active. If the table is in `CREATING` status, waits for it to become active. If it doesn't exist, creates it.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.ensureTable('my-table');
```

### .createTable(tableName)

Creates a new DynamoDB table with TTL support enabled on the `expiresAt` attribute. Uses `PAY_PER_REQUEST` billing mode.

```js
const store = new StorelyDynamo({ endpoint: 'http://localhost:8000' });
await store.createTable('my-table');
```

## License

[MIT © Ritesh Rana](LICENSE)
