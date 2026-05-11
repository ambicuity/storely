---
title: "How to Implement Caching in Javascript"
description: "Caching with ujavascript and Storely."
order: 1
---


# How to Implement Caching in Javascript

## What is a Cache?
A cache is a short-term, high-speed data storage layer that stores a subset of data, enabling it to be retrieved faster than accessing it from its primary storage location. Caching allows you to reuse previously retrieved data efficiently.

## Caching Support in Storely
Caching will work in memory by default. However, users can also install a Storely storage adapter that is initialized with a connection string or any other storage that implements the Map API.

## Caching Support in Storely via Cacheable

We can use Storely to implement caching using [Cacheable](https://npmjs.org/package/cacheable) which is a high performance layer 1 / layer 2 caching framework built on Storely. It supports multiple storage backends and provides a simple, consistent API for caching.



### Example - Add Cache Support to a Module

1. Install whichever storage adapter you will be using, `@ambicuity/redis` in this example
```sh
npm install --save @ambicuity/redis cacheable
```
2. Declare the Module with the cache controlled by a Storely instance
```js
import { Cacheable } from 'cacheable';
import StorelyRedis from '@ambicuity/redis';

// by default layer 1 cache is in-memory. If you want to add a layer 2 cache, you can use StorelyRedis
const secondary = new StorelyRedis('redis://user:pass@localhost:6379');
const cache = new Cacheable({ secondary, ttl: '4h' }); // default time to live set to 4 hours
```
