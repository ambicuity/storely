---
title: "Third-party storage adapters"
description: "Community-built adapters that plug into Storely's adapter interface."
section: "Project"
order: 60
---

## The contract

Any object that implements `StorelyStoreAdapter` plugs in. The Storely community has wired adapters for cloud KVs, file systems, browser storage, and managed databases.

## Available adapters

| Adapter | Description |
|---|---|
| [@resolid/storely-sqlite](https://www.npmjs.com/package/@resolid/storely-sqlite) | SQLite storage adapter for Storely |
| [storely-arango](https://www.npmjs.com/package/storely-arango) | ArangoDB storage adapter |
| [storely-azuretable](https://www.npmjs.com/package/storely-azuretable) | Azure Table Storage / API |
| [storely-browser](https://www.npmjs.com/package/storely-browser) | Browser storage (localStorage / IndexedDB) |
| [storely-cloudflare](https://www.npmjs.com/package/storely-cloudflare) | Cloudflare Workers KV |
| [storely-dynamodb](https://www.npmjs.com/package/storely-dynamodb) | Community DynamoDB adapter |
| [storely-file](https://www.npmjs.com/package/storely-file) | File-system storage |
| [storely-firestore](https://www.npmjs.com/package/storely-firestore) | Firebase Cloud Firestore |
| [storely-lru](https://www.npmjs.com/package/storely-lru) | LRU in-memory cache |
| [storely-momento](https://www.npmjs.com/package/storely-momento) | Momento cache service |
| [storely-mssql](https://www.npmjs.com/package/storely-mssql) | Microsoft SQL Server |
| [storely-null](https://www.npmjs.com/package/storely-null) | Null adapter — discards writes, useful for testing |
| [storely-upstash](https://www.npmjs.com/package/storely-upstash) | Upstash Redis |
| [quick-lru](https://github.com/sindresorhus/quick-lru) | Generic Map-compatible LRU |

## Build your own

A minimal adapter is anything that satisfies this shape:

```ts
type StorelyStorageGetResult<Value> = { value?: Value; expires?: number } | undefined;

type IEventEmitter = {
	on(event: string, listener: (...args: unknown[]) => void): IEventEmitter;
};

type StorelyStoreAdapter = {
	namespace?: string;

	get<Value>(key: string): Promise<StorelyStorageGetResult<Value> | undefined>;
	set(key: string, value: unknown, ttl?: number): Promise<unknown> | unknown;
	delete(key: string): Promise<boolean>;
	clear(): Promise<void>;

	setMany?(values: Array<{ key: string; value: unknown; ttl?: number }>): Promise<boolean[] | undefined>;
	has?(key: string): Promise<boolean>;
	hasMany?(keys: string[]): Promise<boolean[]>;
	getMany?<Value>(keys: string[]): Promise<Array<StorelyStorageGetResult<Value | undefined>>>;
	deleteMany?(keys: string[]): Promise<boolean[]>;
	disconnect?(): Promise<void>;
	iterator?<Value>(namespace?: string): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void>;
} & IEventEmitter;
```

### Required methods

| Method | Behaviour |
|---|---|
| `get(key)` | Return the stored value or `undefined` if missing/expired. |
| `set(key, value, ttl?)` | Store a value, optionally with an expiry in milliseconds. |
| `delete(key)` | Return `true` if the key existed before deletion. |
| `clear()` | Remove every key in the current namespace. |

### Optional batch methods

| Method | Behaviour |
|---|---|
| `has(key)` | Existence check. |
| `hasMany(keys)` | Batched existence check. |
| `getMany(keys)` | Batched fetch. |
| `setMany(values)` | Batched set. |
| `deleteMany(keys)` | Batched delete. |
| `disconnect()` | Release any connections. |
| `iterator(namespace?)` | Stream every `[key, value]` in the namespace. |

## A minimal Map-backed adapter

```ts
import { EventEmitter } from "node:events";
import type { StorelyStoreAdapter, StorelyStorageGetResult } from "@ambicuity/storely";

interface CacheItem {
	value: unknown;
	expires?: number;
}

class MemoryStore extends EventEmitter implements StorelyStoreAdapter {
	private store = new Map<string, CacheItem>();
	public namespace?: string;

	constructor(options: { namespace?: string } = {}) {
		super();
		this.namespace = options.namespace;
	}

	async get<Value>(key: string): Promise<StorelyStorageGetResult<Value> | undefined> {
		const item = this.store.get(key);
		if (!item) return undefined;
		if (item.expires && Date.now() > item.expires) {
			this.store.delete(key);
			return undefined;
		}
		return item as StorelyStorageGetResult<Value>;
	}

	async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
		this.store.set(key, { value, expires: ttl ? Date.now() + ttl : undefined });
		return true;
	}

	async delete(key: string): Promise<boolean> {
		return this.store.delete(key);
	}

	async clear(): Promise<void> {
		this.store.clear();
	}
}
```

## Compliance testing

Use `@ambicuity/test-suite` to verify your adapter behaves the same as the
official ones:

```ts
import { describe } from "vitest";
import storelyTestSuite from "@ambicuity/test-suite";
import Storely from "@ambicuity/storely";
import MyCustomStore from "./my-custom-store";

const store = () => new MyCustomStore();
storelyTestSuite(describe, Storely, store);
```

## Contributing

1. Build your adapter against the interface above.
2. Run `@ambicuity/test-suite` against it; all suites should pass.
3. Publish to npm with the `storely` keyword in `package.json`.
4. Open a PR adding your entry to the table at the top of this page, alphabetised.

We review PRs regularly and appreciate your contributions.
