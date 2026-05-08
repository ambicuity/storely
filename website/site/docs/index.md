---
title: 'Getting Started Guide'
order: 1
---

# Getting Started Guide

Storely provides a consistent interface for key-value storage across multiple backends via storage adapters. It supports TTL based expiry, making it suitable as a cache or a persistent key-value store. Follow the steps below to get you up and running.

## 1. Make a Project Directory
Make a directory with your project in it.

```sh
mkdir storely
cd storely
```
You're now inside your project's directory.

## 2. Install storely

```sh
npm install --save storely
```
By default, everything is stored in memory; you can optionally also install a storage adapter; choose one from the following:

```sh
npm install --save @storely/redis
npm install --save @storely/valkey
npm install --save @storely/memcache
npm install --save @storely/mongo
npm install --save @storely/sqlite
npm install --save @storely/postgres
npm install --save @storely/mysql
npm install --save @storely/etcd
```

> **Note**: You can also use [third-party storage adapters](/docs/third-party-storage-adapters/)


## 3. Create a New Storely Instance
Pass your connection string if applicable. Storely will automatically load the correct storage adapter. ////
```js
// example Storely instance that uses sqlite storage adapter
const store = new Storely('sqlite://path/to/database.sqlite');
```


`Storely` Parameters

Parameter | Type | Required | Description
------------ | ------------- | ------------- | -------------
uri | String | N | The connection string URI. Merged into the options object as options.uri. Default value: undefined
options | Object | N | The options object is also passed through to the storage adapter. See the table below for a list of available options.

`options` Parameters

Parameter | Type | Required | Description
------------ | ------------- | ------------- | -------------
namespace | String | N | Namespace for the current instance.  Default: 'storely'
ttl | Number | N | This is the default TTL, in milliseconds. It can be overridden by specifying a TTL on .set().  Default: undefined
compression | @storely/compress-\<compression_package_name> | N | Compression package to use. See Compression for more details. Default: undefined.
serialize | Function | N | A custom serialization function. Default: JSONB.stringify
deserialize | Function | N | A custom deserialization function. Default: JSONB.parse
store | Storage adapter instance | N | The storage adapter instance to be used by Storely. Default: new Map()
adapter | String | N | Specify an adapter to use. e.g 'redis' or 'mongodb'. Default: undefined

### Example - Create an Instance of Storely with a connection URI
The following example shows how you would create an Instance of Storely with a `mongodb` connection URI.

```js
const Storely = require('storely');

const store = new Storely('mongodb://user:pass@localhost:27017/dbname');

// Handle DB connection errors
store.on('error', err => console.log('Connection Error', err));
```
### Example - Create an Instance of Storely using a third-party storage adapter

[`quick-lru`](https://github.com/sindresorhus/quick-lru) is a third-party module that implements the Map API.

```js
const Storely = require('storely');
const QuickLRU = require('quick-lru');

const lru = new QuickLRU({ maxSize: 1000 });
const store = new Storely({ store: lru });

// Handle DB connection errors
store.on('error', err => console.log('Connection Error', err));
```

## 4. Create Some Key Value Pairs

Method: `set(key, value, [ttl])` - Set a value for a specified key.

Parameter | Type | Required | Description
------------ | ------------- | ------------- | -------------
key | String | Y | Unique identifier which is used to look up the value. Keys are persistent by default.
value | Any  | Y | Data value associated with the key
ttl | Number | N | Expiry time in milliseconds

The following example code shows you how to create a key-value pair using the `set` method.

```js

const store = new Storely('redis://user:pass@localhost:6379');

// set a key value pair that expires in 1000 milliseconds
await store.set('foo', 'expires in 1 second', 1000); // true

// set a key value pair that never expires
await store.set('bar', 'never expires'); // true
```



Method: `delete(key)` - Deletes an entry.

Parameter | Type | Required | Description
------------ | ------------- | ------------- | -------------
key | String | Y | Unique identifier which is used to look up the value. Returns `true `if the key existed, `false` if not.

To delete a key value pair use the `delete(key)` method as shown below:

```js
// Delete the key value pair for the 'foo' key
await store.delete('foo'); // true
```


## 5. Advanced - Use Namespaces to Avoid Key Collisions
You can namespace your Storely instance to avoid key collisions and allow you to clear only a certain namespace while using the same database.

The example code below creates two namespaces, 'users' and 'cache' and creates a key value pair using the key 'foo' in both namespaces, it also shows how to delete all values in a specified namespace.

```js
const users = new Storely('redis://user:pass@localhost:6379', { namespace: 'users' });
const cache = new Storely('redis://user:pass@localhost:6379', { namespace: 'cache' });

// Set a key-value pair using the key 'foo' in both namespaces
await users.set('foo', 'users'); // returns true
await cache.set('foo', 'cache'); // returns true

// Retrieve a Value
await users.get('foo'); // returns 'users'
await cache.get('foo'); // returns 'cache'

// Delete all values for the specified namespace
await users.clear();
```

## 6. Advanced - Enable Compression

Storely supports both `gzip`, `brotli` and `lz4` methods of compression. Before you can enable compression, you will need to install the compression package:

```sh
npm install --save storely @storely/compress-gzip
```

### Example - Enable Gzip compression
To enable compression, pass the `compression` option to the constructor.

```js
const StorelyGzip = require('@storely/compress-gzip');
const Storely = require('storely');

const storelyGzip = new StorelyGzip();
const store = new Storely({ compression: storelyGzip });
```

### Example - Enable Brotli compression

```js
import Storely from 'storely';
import StorelyBrotli from '@storely/compress-brotli';

const storelyBrotli = new StorelyBrotli();
const store = new Storely({ compression: storelyBrotli });
```

### Example - Enable lz4 compression

```js
import Storely from 'storely';
import StorelyLz4 from '@storely/compress-lz4';

const storelyLz4 = new StorelyLz4();
const store = new Storely({ compression: storelyLz4 });
```

You can also pass a custom compression function to the compression option. Custom compression functions must follow the pattern of the official compression adapter (see below for further information).

### Want to build your own?

Great! Storely is designed to be easily extended. You can build your own compression adapter by following the pattern of the official compression adapters based on this interface:

```js
interface CompressionAdapter {
	async compress(value: any, options?: any);
	async decompress(value: any, options?: any);
	async serialize(value: any);
	async deserialize(value: any);
}
```

#### Test your custom compression adapter
In addition to the interface, you can test it with our compression test suite using `@storely/test-suite`:

```js
const {storelyCompressionTests} = require('@storely/test-suite');
const StorelyGzip = require('@storely/compress-gzip');

storelyCompressionTests(test, new StorelyGzip());
```

## 7. Advanced - Extend your own Module with Storely
Storely can be easily embedded into other modules to add cache support.
- Caching will work in memory by default, and users can also install a Storely storage adapter and pass in a connection string or any other storage that implements the Map API.
- You should also set a namespace for your module to safely call `.clear()` without clearing unrelated app data.

>**Note**:
> The recommended pattern is to expose a cache option in your module's options which is passed through to Storely.

### Example - Add Cache Support to a Module

1. Install whichever storage adapter you will be using, `storely-redis` in this example
```sh
npm install --save storely-redis
```
2. Declare the Module with the cache controlled by a Storely instance
```js
class AwesomeModule {
	constructor(opts) {
		this.cache = new Storely({
			uri: typeof opts.cache === 'string' && opts.cache,
			store: typeof opts.cache !== 'string' && opts.cache,
			namespace: 'awesome-module'  
		});
	}
}
```

3. Create an Instance of the Module with caching support
```js
const AwesomeModule = require('awesome-module');
const awesomeModule = new AwesomeModule({ cache: 'redis://localhost' });
```