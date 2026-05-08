---
title: 'Third-Party Storage Adapters'
sidebarTitle: 'Third-Party Adapters'
order: 5
---

# Third-Party Storage Adapters

> Community-built storage adapters for Storely

The Storely community has built storage adapters for many different backends. These adapters allow you to use Storely with databases and storage systems beyond the officially supported ones.

Any storage adapter that follows the `StorelyStoreAdapter` interface will work seamlessly with Storely.

# Available Adapters

| Adapter | Description |
|---------|-------------|
| [@resolid/storely-sqlite](https://www.npmjs.com/package/@resolid/storely-sqlite) | SQLite storage adapter for Storely |
| [storely-arango](https://www.npmjs.com/package/storely-arango) | ArangoDB storage adapter for Storely |
| [storely-azuretable](https://www.npmjs.com/package/storely-azuretable) | Azure Table Storage/API adapter for Storely |
| [storely-browser](https://www.npmjs.com/package/storely-browser) | Browser storage adapter including localStorage and indexedDB |
| [storely-cloudflare](https://www.npmjs.com/package/storely-cloudflare) | Storage adapter for Cloudflare Workers KV |
| [storely-dynamodb](https://www.npmjs.com/package/storely-dynamodb) | DynamoDB storage adapter for Storely |
| [storely-file](https://www.npmjs.com/package/storely-file) | File system storage adapter for Storely |
| [storely-firestore](https://www.npmjs.com/package/storely-firestore) | Firebase Cloud Firestore adapter for Storely |
| [storely-lru](https://www.npmjs.com/package/storely-lru) | LRU storage adapter for Storely |
| [storely-momento](https://www.npmjs.com/package/storely-momento) | Momento storage adapter for Storely |
| [storely-mssql](https://www.npmjs.com/package/storely-mssql) | Microsoft SQL Server adapter for Storely |
| [storely-null](https://www.npmjs.com/package/storely-null) | Null storage adapter for Storely |
| [storely-upstash](https://www.npmjs.com/package/storely-upstash) | Upstash Redis adapter for Storely |
| [quick-lru](https://github.com/sindresorhus/quick-lru) | Simple "Least Recently Used" (LRU) cache |

# How to Contribute

We love the community and the third-party storage adapters they have built. We welcome contributions of new storage adapters!

## Steps to Add Your Adapter

1. **Build your adapter** following the `StorelyStoreAdapter` interface (see below)
2. **Test your adapter** using the official [@storely/test-suite](/docs/test-suite/) to ensure API compliance
3. **Publish to npm** with the `storely` keyword in your `package.json`
4. **Submit a PR** to the [Storely repository](../../) adding your adapter to this list

## Creating a Pull Request

Once your adapter is published to npm and tested, submit a pull request to add it to this page:

1. Fork the [Storely repository](../../)
2. Edit the file `website/site/docs/third-party-storage-adapters.md`
3. Add your adapter to the "Available Adapters" table in alphabetical order:
   ```markdown
   | [your-adapter-name](https://github.com/your-username/your-adapter) | Brief description of your adapter |
   ```
4. Create a pull request with:
   - **Title**: `docs: add [your-adapter-name] to third-party storage adapters`
   - **Description**: Include a link to your npm package and a brief explanation of what backend your adapter supports

We review pull requests regularly and appreciate your contributions to the Storely ecosystem!

# Building a Storage Adapter

To build a storage adapter for Storely, you need to implement the `StorelyStoreAdapter` interface. Here's the complete type definition:

```typescript
type StorelyStorageGetResult<Value> = { value?: Value; expires?: number } | undefined;

type IEventEmitter = {
  on(event: string, listener: (...args: any[]) => void): IEventEmitter;
};

type StorelyStoreAdapter = {
  namespace?: string | undefined;

  // Required methods
  get<Value>(key: string): Promise<StorelyStorageGetResult<Value> | undefined>;
  set(key: string, value: any, ttl?: number): any;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;

  // Optional methods for better performance
  setMany?(values: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean[] | undefined>;
  has?(key: string): Promise<boolean>;
  hasMany?(keys: string[]): Promise<boolean[]>;
  getMany?<Value>(keys: string[]): Promise<Array<StorelyStorageGetResult<Value | undefined>>>;
  disconnect?(): Promise<void>;
  deleteMany?(key: string[]): Promise<boolean[]>;
  iterator?<Value>(namespace?: string): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void>;
} & IEventEmitter;
```

## Required Methods

| Method | Description |
|--------|-------------|
| `get(key)` | Retrieve a value by key. Returns `undefined` if not found or expired. |
| `set(key, value, ttl?)` | Store a value with an optional TTL (time-to-live) in milliseconds. |
| `delete(key)` | Delete a key. Returns `true` if the key existed. |
| `clear()` | Delete all keys in the current namespace. |

## Optional Methods

| Method | Description |
|--------|-------------|
| `has(key)` | Check if a key exists. |
| `hasMany(keys)` | Check if multiple keys exist. |
| `getMany(keys)` | Retrieve multiple values at once. |
| `setMany(values)` | Store multiple values at once. |
| `deleteMany(keys)` | Delete multiple keys at once. |
| `disconnect()` | Close any open connections. |
| `iterator(namespace?)` | Async iterator over all keys/values in a namespace. |

## Example Implementation

Here's a minimal example of a custom storage adapter using an in-memory Map:

```typescript
import { EventEmitter } from 'events';
import type { StorelyStoreAdapter, StorelyStorageGetResult } from 'storely';

interface CacheItem {
  value: any;
  expires?: number;
}

class MyCustomStore extends EventEmitter implements StorelyStoreAdapter {
  private store: Map<string, CacheItem>;
  public namespace?: string;

  constructor(options: any = {}) {
    super();
    this.store = new Map();
    this.namespace = options.namespace;
  }

  async get<Value>(key: string): Promise<StorelyStorageGetResult<Value> | undefined> {
    const data = this.store.get(key);

    if (!data) {
      return undefined;
    }

    // Check if expired
    if (data.expires && Date.now() > data.expires) {
      this.store.delete(key);
      return undefined;
    }

    return data as StorelyStorageGetResult<Value>;
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const data: CacheItem = {
      value,
      expires: ttl ? Date.now() + ttl : undefined,
    };
    this.store.set(key, data);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  // Optional: Implement batch operations for better performance
  async getMany<Value>(keys: string[]): Promise<Array<StorelyStorageGetResult<Value | undefined>>> {
    const values: Array<StorelyStorageGetResult<Value | undefined>> = [];
    for (const key of keys) {
      values.push(await this.get<Value>(key));
    }
    return values;
  }

  async deleteMany(keys: string[]): Promise<boolean[]> {
    return keys.map((key) => this.store.delete(key));
  }

  async has(key: string): Promise<boolean> {
    const data = this.store.get(key);
    if (!data) {
      return false;
    }
    if (data.expires && Date.now() > data.expires) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}

export default MyCustomStore;
```

## Using Your Custom Adapter

```typescript
import Storely from 'storely';
import MyCustomStore from './my-custom-store';

const store = new MyCustomStore({ namespace: 'my-app' });
const storely = new Storely({ store });

// Use Storely as normal
await storely.set('foo', 'bar');
const value = await storely.get('foo'); // 'bar'
```

## Testing Your Adapter

Use the official [@storely/test-suite](/docs/test-suite/) to verify your adapter is API-compliant:

```bash
npm install --save-dev vitest storely @storely/test-suite
```

Create a test file:

```javascript
import { describe } from 'vitest';
import storelyTestSuite from '@storely/test-suite';
import Storely from 'storely';
import MyCustomStore from './my-custom-store';

const store = () => new MyCustomStore();
storelyTestSuite(describe, Storely, store);
```

Run with:

```bash
npx vitest
```

# License

MIT © Ritesh Rana