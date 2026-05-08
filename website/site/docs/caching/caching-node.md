---
title: 'Utilizing Storely for Caching in Node.js: A Step-by-Step Guide'
sidebarTitle: 'Caching in Node.js'
parent: 'Caching'
---

# Utilizing Storely for Caching in Node.js: A Step-by-Step Guide

## 1. Setting up the Project
To start a new Node.js project, you first need to create a new directory for your project and then initialize a new Node.js project in that directory.

```bash
mkdir storely-cache-demo
cd storely-cache-demo
npm init -y
```
The npm init -y command will create a new package.json file in your project directory with default settings.

## 2. Installing Storely and its Dependencies
In this step, you'll install Storely and a Storely storage adapter for your project. For this example, we'll use Redis as the storage backend.

```bash
npm install cacheable @storely/redis --save
```
Storely supports a variety of storage adapters like Redis, MongoDB, PostgreSQL, etc. Feel free to choose the one that best fits your project requirements.

## 3. Creating a Caching Service Example
In this step, we'll create a simple caching service using Storely.

Create a new file named cacheService.js in your project directory and add the following code to that file.

```javascript
import { Cacheable } from 'cacheable';
import StorelyRedis from '@storely/redis';

// Initialize Storely with Redis as the storage backend
const secondary = new StorelyRedis('redis://user:pass@localhost:6379');
const cache = new Cacheable({ secondary, ttl: '4h' }); // default time to live set to 4 hours

// Usage
async function fetchData() {
  const key = 'myData';
  let data = await cache.get(key);
  if (!data) {
    data = await getMyData(); // Function that fetches your data
    await cache.set(key, data, 10000); // Cache for 10 seconds
  }
  return data;
}
```