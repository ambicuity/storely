# KeyDB Storage Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `@storely/keydb` storage adapter package — a KeyDB-branded adapter using `@redis/client` that mirrors the Redis adapter.

**Architecture:** Clone the Redis adapter structure into `storage/keydb/`, rename all `Redis` references to `KeyDB`. KeyDB is Redis-protocol compatible so the implementation is identical — same `@redis/client` library, same commands, same cluster/sentinel support. New Docker service for KeyDB on port 6378.

**Tech Stack:** TypeScript, `@redis/client` v5, `cluster-key-slot`, `hookified`, Vitest, `@storely/test-suite`, tsdown, Biome

---

## File Structure

```
storage/keydb/
  src/
    index.ts         — StorelyKeyDB class (adapter implementation)
    types.ts          — StorelyKeyDBOptions, connection types, error messages
    create.ts         — createStorelyKeyDB(), createStorelyKeyDBNonBlocking()
  test/
    suite.test.ts     — Standard test-suite integration
    main.test.ts      — Core operations, constructor, properties
    get.test.ts       — Get/getMany tests
    set.test.ts       — Set/setMany tests
    delete.test.ts   — Delete/deleteMany tests
    has.test.ts       — Has/hasMany tests
    iterator.test.ts  — Iterator tests
    namespace.test.ts — Namespace isolation tests
    get-client.test.ts — Connection management tests
    create-storely.test.ts — Factory function tests
    types.test.ts     — Type definition tests
  tls/                — TLS certs (copied from redis adapter)
  package.json
  tsconfig.json
  tsdown.config.ts
  vitest.config.ts
  README.md
  LICENSE
```

Scripts to modify:
```
scripts/docker-compose.yaml         — Add storely_keydb and storely_keydb_tls services
scripts/docker-compose-arm64.yaml   — Add storely_keydb and storely_keydb_tls services
```

Root config is already correct (`storage/*` is in pnpm-workspace.yaml).

---

### Task 1: Create package scaffolding and config files

**Files:**
- Create: `storage/keydb/package.json`
- Create: `storage/keydb/tsconfig.json`
- Create: `storage/keydb/tsdown.config.ts`
- Create: `storage/keydb/vitest.config.ts`
- Create: `storage/keydb/LICENSE`

- [x] **Step 1: Create `storage/keydb/package.json`**

```json
{
	"name": "@storely/keydb",
	"version": "6.0.0-alpha.4",
	"description": "KeyDB storage adapter for Storely",
	"type": "module",
	"main": "./dist/index.mjs",
	"module": "./dist/index.mjs",
	"types": "./dist/index.d.mts",
	"exports": {
		".": {
			"require": {
				"types": "./dist/index.d.cts",
				"default": "./dist/index.cjs"
			},
			"import": {
				"types": "./dist/index.d.mts",
				"default": "./dist/index.mjs"
			}
		}
	},
	"scripts": {
		"build": "tsdown",
		"prepublishOnly": "pnpm build",
		"lint": "biome check --write --error-on-warnings",
		"lint:ci": "biome check --error-on-warnings",
		"test": "pnpm lint && vitest run --coverage",
		"test:ci": "pnpm lint:ci && vitest --run --sequence.setupFiles=list --coverage",
		"clean": "rimraf ./node_modules ./coverage ./dist"
	},
	"keywords": [
		"keydb",
		"storely",
		"storage",
		"adapter",
		"key",
		"value",
		"store",
		"cache",
		"ttl"
	],
	"author": "Ritesh Rana <contact@riteshrana.engineer>",
	"license": "MIT",
	"dependencies": {
		"@redis/client": "^5.10.0",
		"cluster-key-slot": "^1.1.2",
		"hookified": "^2.0.0"
	},
	"peerDependencies": {
		"storely": "workspace:^"
	},
	"devDependencies": {
		"@storely/test-suite": "workspace:^",
		"timekeeper": "^2.3.1"
	},
	"tsd": {
		"directory": "test"
	},
	"engines": {
		"node": ">= 18"
	},
	"files": [
		"dist",
		"LICENSE"
	]
}
```

- [x] **Step 2: Create `storage/keydb/tsconfig.json`**

```json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "./dist",
		"rootDir": "./src"
	},
	"include": ["src"]
}
```

- [x] **Step 3: Create `storage/keydb/tsdown.config.ts`**

```typescript
// @ts-ignore - tsdown requires .ts extension for config imports
import base from '../../tsdown.base.ts';

export default {
	...base,
	entry: ['src/index.ts'],
};
```

- [x] **Step 4: Create `storage/keydb/vitest.config.ts`**

```typescript
import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		fileParallelism: false,
		maxWorkers: 1,
		maxConcurrency: 1,
		include: ['test/*.ts'],
		coverage: {
			reporter: ['json', 'lcov', 'text'],
			reportOnFailure: true,
		},
	},
});
```

- [x] **Step 5: Copy LICENSE from Redis adapter**

Copy `storage/redis/LICENSE` to `storage/keydb/LICENSE`.

- [x] **Step 6: Run `pnpm install` from workspace root**

Run: `pnpm install`
Expected: Installs dependencies and links the new workspace package.

---

### Task 2: Create types file

**Files:**
- Create: `storage/keydb/src/types.ts`

- [x] **Step 1: Create `storage/keydb/src/types.ts`**

This is a direct rename of `storage/redis/src/types.ts` with all `Redis` → `KeyDB` naming changes. The connection types remain the same since KeyDB uses the same `@redis/client` library.

```typescript
// biome-ignore-all lint/suspicious/noExplicitAny: keydb
import type {
	RedisClientType,
	RedisClusterType,
	RedisFunctions,
	RedisModules,
	RedisScripts,
	RedisSentinelType,
	RespVersions,
	TypeMapping,
} from "@redis/client";

export type StorelyKeyDBOptions = {
	/**
	 * Namespace for the current instance.
	 * Defaults to `storely`
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

export type StorelyKeyDBPropertyOptions = StorelyKeyDBOptions & {
	/**
	 * URL used to connect to the KeyDB server. This is legacy so Storely knows what is iteratable.
	 */
	url: string;
};

export type StorelyKeyDBEntry<T> = {
	/**
	 * Key to set.
	 */
	key: string;
	/**
	 * Value to set.
	 */
	value: T;
	/**
	 * Time to live in milliseconds.
	 */
	ttl?: number;
};

export enum KeyDBErrorMessages {
	/**
	 * Error message when the KeyDB client is not connected and throwOnConnectError is set to true.
	 */
	KeyDBClientNotConnectedThrown = "KeyDB client is not connected or has failed to connect. This is thrown because throwOnConnectError is set to true.",
}

export const defaultReconnectStrategy = (attempts: number): number | Error => {
	const backoff = Math.min(2 ** attempts * 100, 2000);
	const jitter = (Math.random() - 0.5) * 100;
	return backoff + jitter;
};

export type KeyDBConnectionClientType =
	| RedisClientType
	| RedisClientType<RedisModules, RedisFunctions, RedisScripts, RespVersions>
	| RedisClientType<RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping>;

export type KeyDBConnectionClusterType =
	| RedisClusterType
	| RedisClusterType<RedisModules, RedisFunctions, RedisScripts, RespVersions>
	| RedisClusterType<RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping>;

export type KeyDBConnectionSentinelType =
	| RedisSentinelType
	| RedisSentinelType<RedisModules, RedisFunctions, RedisScripts, RespVersions>
	| RedisSentinelType<RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping>;

export type KeyDBClientConnectionType =
	| KeyDBConnectionClientType
	| KeyDBConnectionClusterType
	| KeyDBConnectionSentinelType;
```

- [x] **Step 2: Verify types compile**

Run: `cd storage/keydb && pnpm build`
Expected: Build succeeds (will need source files first — this is verified in Task 3).

---

### Task 3: Create the main adapter class

**Files:**
- Create: `storage/keydb/src/index.ts`

This is the largest task. The file mirrors `storage/redis/src/index.ts` with all `Redis` → `KeyDB` renames. Internal `@redis/client` type references stay the same since KeyDB uses that library.

- [x] **Step 1: Create `storage/keydb/src/index.ts`**

```typescript
// biome-ignore-all lint/suspicious/noExplicitAny: keydb
import {
	createClient,
	createCluster,
	createSentinel,
	type RedisClientOptions,
	type RedisClientType,
	type RedisClusterOptions,
	type RedisClusterType,
	type RedisFunctions,
	type RedisModules,
	type RedisScripts,
	type RedisSentinelOptions,
	type RedisSentinelType,
	type RespVersions,
	type TypeMapping,
} from "@redis/client";
import calculateSlot from "cluster-key-slot";
import { Hookified } from "hookified";
import type { StorelyEntry, StorelyStorageAdapter } from "storely";
import {
	defaultReconnectStrategy,
	type KeyDBClientConnectionType,
	type KeyDBConnectionClientType,
	type KeyDBConnectionClusterType,
	type KeyDBConnectionSentinelType,
	KeyDBErrorMessages,
	type StorelyKeyDBEntry,
	type StorelyKeyDBOptions,
	type StorelyKeyDBPropertyOptions,
} from "./types.js";

export {
	defaultReconnectStrategy,
	type KeyDBClientConnectionType,
	type KeyDBConnectionClientType,
	type KeyDBConnectionClusterType,
	type KeyDBConnectionSentinelType,
	KeyDBErrorMessages,
	type StorelyKeyDBEntry,
	type StorelyKeyDBOptions,
	type StorelyKeyDBPropertyOptions,
};

export default class StorelyKeyDB<T> extends Hookified implements StorelyStorageAdapter {
	private _client!: KeyDBClientConnectionType;
	private _namespace: string | undefined;
	private _keyPrefixSeparator = "::";
	private _clearBatchSize = 1000;
	private _useUnlink = true;
	private _noNamespaceAffectsAll = false;
	private _throwOnConnectError = true;
	private _throwOnErrors = false;
	private _connectionTimeout: number | undefined;

	constructor(
		connect?:
			| string
			| RedisClientOptions
			| RedisClusterOptions
			| RedisSentinelOptions
			| KeyDBClientConnectionType,
		options?: StorelyKeyDBOptions,
	) {
		super({ throwOnEmptyListeners: false });

		const socket = {
			reconnectStrategy: defaultReconnectStrategy,
		};

		if (connect) {
			if (typeof connect === "string") {
				this._client = createClient({
					url: connect,
					socket,
				}) as RedisClientType;
			} else if ((connect as any).connect !== undefined) {
				if (this.isClientSentinel(connect as KeyDBClientConnectionType)) {
					this._client = connect as KeyDBConnectionSentinelType;
				} else if (this.isClientCluster(connect as KeyDBClientConnectionType)) {
					this._client = connect as KeyDBConnectionClusterType;
				} else {
					this._client = connect as RedisClientType;
				}
			} else if (connect instanceof Object) {
				if ((connect as any).sentinelRootNodes !== undefined) {
					this._client = createSentinel(connect as RedisSentinelOptions) as RedisSentinelType;
				} else if ((connect as any).rootNodes === undefined) {
					this._client = createClient(connect as RedisClientOptions) as RedisClientType;
				} else {
					this._client = createCluster(connect as RedisClusterOptions);
				}
			}
		} else {
			this._client = createClient({ socket }) as KeyDBConnectionClientType;
		}

		this.setOptions(options);
		this.initClient();
	}

	public get client(): KeyDBClientConnectionType {
		return this._client;
	}

	public set client(value: KeyDBClientConnectionType) {
		this._client = value;
		this.initClient();
	}

	public get namespace(): string | undefined {
		return this._namespace;
	}

	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	public get clearBatchSize(): number {
		return this._clearBatchSize;
	}

	public set clearBatchSize(value: number) {
		if (value > 0) {
			this._clearBatchSize = value;
		} else {
			this.emit("error", "clearBatchSize must be greater than 0");
		}
	}

	public get useUnlink(): boolean {
		return this._useUnlink;
	}

	public set useUnlink(value: boolean) {
		this._useUnlink = value;
	}

	public get noNamespaceAffectsAll(): boolean {
		return this._noNamespaceAffectsAll;
	}

	public set noNamespaceAffectsAll(value: boolean) {
		this._noNamespaceAffectsAll = value;
	}

	public get throwOnConnectError(): boolean {
		return this._throwOnConnectError;
	}

	public set throwOnConnectError(value: boolean) {
		this._throwOnConnectError = value;
	}

	public get throwOnErrors(): boolean {
		return this._throwOnErrors;
	}

	public set throwOnErrors(value: boolean) {
		this._throwOnErrors = value;
	}

	public get connectionTimeout(): number | undefined {
		return this._connectionTimeout;
	}

	public set connectionTimeout(value: number | undefined) {
		this._connectionTimeout = value;
	}

	public async getClient(): Promise<KeyDBClientConnectionType> {
		if (this._client.isOpen) {
			return this._client;
		}

		try {
			if (this._connectionTimeout === undefined) {
				await this._client.connect();
			} else {
				await Promise.race([
					this._client.connect(),
					this.createTimeoutPromise(this._connectionTimeout),
				]);
			}
		} catch (error) {
			this.emit("error", error);

			await this.disconnect(true);

			if (this._throwOnConnectError) {
				throw new Error(KeyDBErrorMessages.KeyDBClientNotConnectedThrown);
			}
		}

		this.initClient();

		return this._client;
	}

	public async set(key: string, value: string, ttl?: number): Promise<boolean> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);

			if (ttl) {
				await client.set(key, value, { PX: ttl });
			} else {
				await client.set(key, value);
			}

			return true;
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			/* v8 ignore next -- @preserve */
			return false;
		}
	}

	public async setMany<Value>(entries: StorelyEntry<Value>[]): Promise<boolean[] | undefined> {
		try {
			const results = new Array<boolean>(entries.length).fill(false);

			if (this.isCluster()) {
				await this.getClient();

				const slotMap = new Map<number, Array<{ entry: StorelyEntry<Value>; index: number }>>();
				for (let i = 0; i < entries.length; i++) {
					const entry = entries[i];
					const prefixedKey = this.createKeyPrefix(entry.key, this._namespace);
					const slot = calculateSlot(prefixedKey);
					const group = slotMap.get(slot) ?? [];
					group.push({ entry, index: i });
					slotMap.set(slot, group);
				}

				await Promise.all(
					Array.from(slotMap.entries(), async ([slot, slotEntries]) => {
						const client = await this.getSlotMaster(slot);
						const multi = client.multi();
						for (const {
							entry: { key, value, ttl },
						} of slotEntries) {
							const prefixedKey = this.createKeyPrefix(key, this._namespace);
							if (ttl) {
								multi.set(prefixedKey, value as string, { PX: ttl });
							} else {
								multi.set(prefixedKey, value as string);
							}
						}
						const execResults = await multi.exec();
						for (let j = 0; j < slotEntries.length; j++) {
							results[slotEntries[j].index] = String(execResults[j]) === "OK";
						}
					}),
				);
			} else {
				const client = (await this.getClient()) as RedisClientType;
				const multi = client.multi();
				for (const { key, value, ttl } of entries) {
					const prefixedKey = this.createKeyPrefix(key, this._namespace);
					if (ttl) {
						multi.set(prefixedKey, value as string, { PX: ttl });
					} else {
						multi.set(prefixedKey, value as string);
					}
				}
				const execResults = await multi.exec();
				for (let i = 0; i < entries.length; i++) {
					results[i] = String(execResults[i]) === "OK";
				}
			}

			return results;
		} catch (error) {
			this.emit("error", error);
			/* v8 ignore next -- @preserve */
			if (
				this._throwOnConnectError &&
				(error as Error).message === KeyDBErrorMessages.KeyDBClientNotConnectedThrown
			) {
				throw error;
			}
			if (this._throwOnErrors) {
				throw error;
			}

			return entries.map(() => false);
		}
	}

	public async has(key: string): Promise<boolean> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);
			const exists = await client.exists(key);

			return exists === 1;
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			return false;
		}
	}

	public async hasMany(keys: string[]): Promise<boolean[]> {
		try {
			const prefixedKeys = keys.map((key) => this.createKeyPrefix(key, this._namespace));

			if (this.isCluster()) {
				const slotMap = this.getSlotMap(prefixedKeys);
				const resultMap = new Map<string, boolean>();

				await Promise.all(
					Array.from(slotMap.entries(), async ([slot, slotKeys]) => {
						const client = await this.getSlotMaster(slot);
						const multi = client.multi();
						for (const key of slotKeys) {
							multi.exists(key);
						}
						const results = await multi.exec();
						for (const [index, result] of results.entries()) {
							resultMap.set(slotKeys[index], typeof result === "number" && result === 1);
						}
					}),
				);

				/* v8 ignore next -- @preserve */
				return prefixedKeys.map((key) => resultMap.get(key) ?? false);
			} else {
				const client = (await this.getClient()) as RedisClientType;
				const multi = client.multi();
				for (const key of prefixedKeys) {
					multi.exists(key);
				}

				const results = await multi.exec();
				return results.map((result) => typeof result === "number" && result === 1);
			}
		} catch (error) {
			this.emit("error", error);
			/* v8 ignore next -- @preserve */
			if (
				this._throwOnConnectError &&
				(error as Error).message === KeyDBErrorMessages.KeyDBClientNotConnectedThrown
			) {
				throw error;
			}
			if (this._throwOnErrors) {
				throw error;
			}

			return Array.from({ length: keys.length }).fill(false) as boolean[];
		}
	}

	public async get<U = T>(key: string): Promise<U | undefined> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);

			const value = await client.get(key);
			if (value === null) {
				return undefined;
			}

			return value as U;
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			return undefined;
		}
	}

	public async getMany<U = T>(keys: string[]): Promise<Array<U | undefined>> {
		if (keys.length === 0) {
			return [];
		}

		keys = keys.map((key) => this.createKeyPrefix(key, this._namespace));
		try {
			const values = await this.mget<U>(keys);

			return values;
			/* c8 ignore next 5 */
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			return Array.from({ length: keys.length }).fill(undefined) as Array<U | undefined>;
		}
	}

	public async delete(key: string): Promise<boolean> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);
			let deleted = 0;
			deleted = await (this._useUnlink ? client.unlink(key) : client.del(key));

			return deleted > 0;
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			return false;
		}
	}

	public async deleteMany(keys: string[]): Promise<boolean[]> {
		const resultMap = new Map<string, boolean>();
		const prefixedKeys = keys.map((key) => this.createKeyPrefix(key, this._namespace));

		try {
			if (this.isCluster()) {
				const slotMap = this.getSlotMap(prefixedKeys);

				await Promise.all(
					Array.from(slotMap.entries(), async ([slot, slotKeys]) => {
						const client = await this.getSlotMaster(slot);
						const multi = client.multi();
						for (const key of slotKeys) {
							if (this._useUnlink) {
								multi.unlink(key);
							} else {
								multi.del(key);
							}
						}
						const results = await multi.exec();
						for (const [index, deleted] of results.entries()) {
							/* v8 ignore next -- @preserve */
							resultMap.set(slotKeys[index], typeof deleted === "number" && deleted > 0);
						}
					}),
				);
			} else {
				const client = (await this.getClient()) as RedisClientType;
				const multi = client.multi();
				for (const key of prefixedKeys) {
					if (this._useUnlink) {
						multi.unlink(key);
					} else {
						multi.del(key);
					}
				}

				const results = await multi.exec();
				for (const [index, deleted] of results.entries()) {
					resultMap.set(prefixedKeys[index], typeof deleted === "number" && deleted > 0);
				}
			}

			/* v8 ignore next -- @preserve */
			return prefixedKeys.map((key) => resultMap.get(key) ?? false);
		} catch (error) {
			this.emit("error", error);
			if (
				this._throwOnConnectError &&
				(error as Error).message === KeyDBErrorMessages.KeyDBClientNotConnectedThrown
			) {
				throw error;
			}
			if (this._throwOnErrors) {
				throw error;
			}

			return Array.from({ length: keys.length }).fill(false) as boolean[];
		}
	}

	public async disconnect(force?: boolean): Promise<void> {
		if (this._client.isOpen) {
			await (force ? this._client.destroy() : this._client.close());
		}
	}

	public createKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return `${namespace}${this._keyPrefixSeparator}${key}`;
		}

		return key;
	}

	public getKeyWithoutPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return key.replace(`${namespace}${this._keyPrefixSeparator}`, "");
		}

		return key;
	}

	public isCluster(): boolean {
		return this.isClientCluster(this._client);
	}

	public isSentinel(): boolean {
		return this.isClientSentinel(this._client);
	}

	public async getMasterNodes(): Promise<RedisClientType[]> {
		if (this.isCluster()) {
			const cluster = (await this.getClient()) as RedisClusterType<
				RedisModules,
				RedisFunctions,
				RedisScripts,
				RespVersions,
				TypeMapping
			>;
			const nodes = cluster.masters.map(async (main) => cluster.nodeClient(main));
			return Promise.all(nodes) as Promise<RedisClientType[]>;
		}

		return [(await this.getClient()) as RedisClientType];
	}

	public async *iterator<U = T>(): AsyncGenerator<[string, U | undefined], void, unknown> {
		const clients = await this.getMasterNodes();

		for (const client of clients) {
			const match = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}*` : "*";
			let cursor = "0";
			do {
				const result = await client.scan(cursor, {
					MATCH: match,
					TYPE: "string",
				});
				cursor = result.cursor.toString();
				let { keys } = result;

				if (!this._namespace && !this._noNamespaceAffectsAll) {
					keys = keys.filter((key) => !key.includes(this._keyPrefixSeparator));
				}

				if (keys.length > 0) {
					const values = await this.mget<U>(keys);
					for (const i of keys.keys()) {
						const key = this.getKeyWithoutPrefix(keys[i], this._namespace);
						const value = values[i];
						yield [key, value];
					}
				}
			} while (cursor !== "0");
		}
	}

	public async clear(): Promise<void> {
		try {
			const clients = await this.getMasterNodes();

			await Promise.all(
				clients.map(async (client) => {
					if (!this._namespace && this._noNamespaceAffectsAll) {
						await client.flushDb();
						return;
					}

					let cursor = "0";
					const batchSize = this._clearBatchSize;
					const match = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}*` : "*";
					const deletePromises = [];

					do {
						const result = await client.scan(cursor, {
							MATCH: match,
							COUNT: batchSize,
							TYPE: "string",
						});

						cursor = result.cursor.toString();
						let { keys } = result;

						if (keys.length === 0) {
							continue;
						}

						if (!this._namespace) {
							keys = keys.filter((key) => !key.includes(this._keyPrefixSeparator));
						}

						deletePromises.push(this.clearWithClusterSupport(keys));
					} while (cursor !== "0");

					await Promise.all(deletePromises);
				}),
			);
		} catch (error) {
			/* v8 ignore next -- @preserve */
			this.emit("error", error);
		}
	}

	private async mget<T = any>(keys: string[]): Promise<Array<T | undefined>> {
		const valueMap = new Map<string, string | undefined>();

		if (this.isCluster()) {
			const slotMap = this.getSlotMap(keys);

			await Promise.all(
				Array.from(slotMap.entries(), async ([slot, slotKeys]) => {
					const client = await this.getSlotMaster(slot);
					const values = await client.mGet(slotKeys);
					for (const [index, value] of values.entries()) {
						valueMap.set(slotKeys[index], value ?? undefined);
					}
				}),
			);
		} else {
			const client = (await this.getClient()) as RedisClientType;
			const values = await client.mGet(keys);
			for (const [index, value] of values.entries()) {
				valueMap.set(keys[index], value ?? undefined);
			}
		}

		return keys.map((key) => valueMap.get(key) as T | undefined);
	}

	private async clearWithClusterSupport(keys: string[]): Promise<void> {
		/* v8 ignore next -- @preserve */
		if (keys.length > 0) {
			const slotMap = this.getSlotMap(keys);

			await Promise.all(
				Array.from(slotMap.entries(), async ([slot, keys]) => {
					const client = await this.getSlotMaster(slot);

					return this._useUnlink ? client.unlink(keys) : client.del(keys);
				}),
			);
		}
	}

	private async getSlotMaster(slot: number): Promise<RedisClientType> {
		const connection = await this.getClient();

		if (this.isCluster()) {
			const cluster = connection as RedisClusterType<
				RedisModules,
				RedisFunctions,
				RedisScripts,
				RespVersions,
				TypeMapping
			>;
			const mainNode = cluster.slots[slot].master;
			return cluster.nodeClient(mainNode) as RedisClientType;
		}

		return connection as RedisClientType;
	}

	private getSlotMap(keys: string[]) {
		const slotMap = new Map<number, string[]>();
		if (this.isCluster()) {
			for (const key of keys) {
				const slot = calculateSlot(key);
				const slotKeys = slotMap.get(slot) ?? [];
				slotKeys.push(key);
				slotMap.set(slot, slotKeys);
			}
		} else {
			slotMap.set(0, keys);
		}

		return slotMap;
	}

	private isClientCluster(client: KeyDBClientConnectionType): boolean {
		return (client as any).slots !== undefined;
	}

	private isClientSentinel(client: KeyDBClientConnectionType): boolean {
		return (client as any).getSentinelNode !== undefined;
	}

	private setOptions(options?: StorelyKeyDBOptions): void {
		if (!options) {
			return;
		}

		if (options.namespace) {
			this._namespace = options.namespace;
		}

		if (options.keyPrefixSeparator !== undefined) {
			this._keyPrefixSeparator = options.keyPrefixSeparator;
		}

		if (options.clearBatchSize !== undefined && options.clearBatchSize > 0) {
			this._clearBatchSize = options.clearBatchSize;
		}

		if (options.useUnlink !== undefined) {
			this._useUnlink = options.useUnlink;
		}

		if (options.noNamespaceAffectsAll !== undefined) {
			this._noNamespaceAffectsAll = options.noNamespaceAffectsAll;
		}

		if (options.throwOnConnectError !== undefined) {
			this._throwOnConnectError = options.throwOnConnectError;
		}

		if (options.throwOnErrors !== undefined) {
			this._throwOnErrors = options.throwOnErrors;
		}

		if (options.connectionTimeout !== undefined) {
			this._connectionTimeout = options.connectionTimeout;
		}
	}

	private initClient(): void {
		this._client.on("error", (error) => {
			this.emit("error", error);
		});

		this._client.on("connect", () => {
			this.emit("connect", this._client);
		});

		/* v8 ignore next -- @preserve */
		this._client.on("disconnect", () => {
			this.emit("disconnect", this._client);
		});

		/* v8 ignore next -- @preserve */
		this._client.on("reconnecting", (reconnectInfo) => {
			this.emit("reconnecting", reconnectInfo);
		});
	}

	private async createTimeoutPromise(timeoutMs: number): Promise<never> {
		return new Promise<never>((_, reject) =>
			setTimeout(() => {
				/* v8 ignore next 3 -- @preserve */
				reject(new Error(`KeyDB timed out after ${timeoutMs}ms`));
			}, timeoutMs),
		);
	}
}

export {
	createClient,
	createCluster,
	createSentinel,
	type RedisClientOptions,
	type RedisClientType,
	type RedisClusterOptions,
	type RedisClusterType,
	type RedisSentinelOptions,
	type RedisSentinelType,
} from "@redis/client";
export { Storely } from "storely";
export { createStorelyKeyDB, createStorelyKeyDBNonBlocking } from "./create.js";
```

- [x] **Step 2: Build to verify compilation**

Run: `cd storage/keydb && pnpm build`
Expected: Build succeeds with no errors.

---

### Task 4: Create factory functions

**Files:**
- Create: `storage/keydb/src/create.ts`

- [x] **Step 1: Create `storage/keydb/src/create.ts`**

```typescript
// biome-ignore-all lint/suspicious/noExplicitAny: keydb
import type { RedisClientOptions, RedisClientType } from "@redis/client";
import { Storely } from "storely";
import StorelyKeyDB from "./index.js";
import type { StorelyKeyDBOptions } from "./types.js";

export function createStorelyKeyDB(
	connect?: string | RedisClientOptions | RedisClientType,
	options?: StorelyKeyDBOptions,
): Storely {
	connect ??= "keydb://localhost:6378";
	const adapter = new StorelyKeyDB(connect, options);

	if (options?.namespace) {
		adapter.namespace = options.namespace;
		const storely = new Storely(adapter, {
			namespace: options?.namespace,
		});

		if (options?.throwOnConnectError) {
			storely.throwOnErrors = true;
		}

		if (options?.throwOnErrors) {
			storely.throwOnErrors = true;
		}

		return storely;
	}

	const storely = new Storely(adapter);

	if (options?.throwOnConnectError) {
		storely.throwOnErrors = true;
	}

	if (options?.throwOnErrors) {
		storely.throwOnErrors = true;
	}

	storely.namespace = undefined;
	return storely;
}

export function createStorelyKeyDBNonBlocking(
	connect?: string | RedisClientOptions | RedisClientType,
	options?: StorelyKeyDBOptions,
): Storely {
	const storely = createStorelyKeyDB(connect, options);

	const storelyStore = storely.store as StorelyKeyDB<any>;

	storelyStore.throwOnConnectError = false;
	storelyStore.throwOnErrors = false;

	const keydbClient = storelyStore.client as RedisClientType;
	/* v8 ignore next -- @preserve */
	if (keydbClient.options) {
		keydbClient.options.disableOfflineQueue = true;
		if (keydbClient.options.socket) {
			keydbClient.options.socket.reconnectStrategy = false;
		}
	}

	storely.throwOnErrors = false;

	return storely;
}
```

Note: The default URL is `keydb://localhost:6378` (matching the Docker port 6378 we configured). The `@redis/client` library treats `keydb://` the same as `redis://` since KeyDB is protocol-compatible.

- [x] **Step 2: Build to verify compilation**

Run: `cd storage/keydb && pnpm build`
Expected: Build succeeds.

---

### Task 5: Copy TLS certificates for testing

**Files:**
- Copy: `storage/redis/tls/` → `storage/keydb/tls/`

- [x] **Step 1: Copy TLS directory from Redis adapter**

Run: `cp -r storage/redis/tls storage/keydb/tls`

Expected: TLS certificate files copied for KeyDB TLS testing.

---

### Task 6: Create test files

**Files:**
- Create: `storage/keydb/test/suite.test.ts`
- Create: `storage/keydb/test/main.test.ts`
- Create: `storage/keydb/test/get.test.ts`
- Create: `storage/keydb/test/set.test.ts`
- Create: `storage/keydb/test/delete.test.ts`
- Create: `storage/keydb/test/has.test.ts`
- Create: `storage/keydb/test/iterator.test.ts`
- Create: `storage/keydb/test/namespace.test.ts`
- Create: `storage/keydb/test/get-client.test.ts`
- Create: `storage/keydb/test/create-storely.test.ts`
- Create: `storage/keydb/test/types.test.ts`

All test files mirror the Redis adapter tests with these changes:
1. All `StorelyRedis` → `StorelyKeyDB`
2. All `RedisErrorMessages.RedisClientNotConnectedThrown` → `KeyDBErrorMessages.KeyDBClientNotConnectedThrown`
3. All `redis://localhost:6379` → `keydb://localhost:6378` default URLs
4. All `REDIS_URI` → `KEYDB_URI` env var
5. All `REDIS_BAD_URI` → `KEYDB_BAD_URI` env var
6. All `createStorely` / `createStorelyNonBlocking` → `createStorelyKeyDB` / `createStorelyKeyDBNonBlocking`
7. All `redis://localhost:6379` in test URLs → `keydb://localhost:6378`
8. Redis-specific port references (6379) → KeyDB port (6378)
9. Error message strings "Redis" → "KeyDB" where applicable

- [x] **Step 1: Create `storage/keydb/test/suite.test.ts`**

```typescript
import { storageTestSuite, storelyIteratorTests, storelyTestSuite } from "@storely/test-suite";
import { Storely } from "storely";
import { afterAll, it } from "vitest";
import StorelyKeyDB, { type RedisClientType } from "../src/index.js";

const keydbUrl = "keydb://localhost:6378/5";
const store = () => new StorelyKeyDB(keydbUrl);

afterAll(async () => {
	const client = (await store().getClient()) as RedisClientType;
	await client.flushDb();
	await store().disconnect();
});

storelyTestSuite(it, Storely, store);
storelyIteratorTests(it, Storely, store);
storageTestSuite(it, store);
```

- [x] **Step 2: Create `storage/keydb/test/main.test.ts`**

```typescript
import process from "node:process";
import { faker } from "@faker-js/faker";
import { createClient, type RedisClientType } from "@redis/client";
import { beforeEach, describe, expect, test } from "vitest";
import StorelyKeyDB, { createStorelyKeyDB } from "../src/index.js";

const keydbUri = process.env.KEYDB_URI ?? "keydb://localhost:6378";

describe("StorelyKeyDB Module Loading", () => {
	test("should not create a KeyDB connection on module import", async () => {
		expect(typeof StorelyKeyDB).toBe("function");
		expect(StorelyKeyDB.prototype).toBeDefined();

		const instance = new StorelyKeyDB("keydb://localhost:6378");
		expect(instance.client).toBeDefined();
		expect(instance.client.isOpen).toBe(false);
	});
});

describe("StorelyKeyDB", () => {
	test("should be a class", () => {
		expect(StorelyKeyDB).toBeInstanceOf(Function);
	});

	test("should have a client property", () => {
		const storelyKeyDB = new StorelyKeyDB();
		expect(storelyKeyDB.client).toBeDefined();
	});

	test("should be able to create Storely instance", async () => {
		const storely = createStorelyKeyDB("keydb://localhost:6378", { namespace: "test" });
		expect(storely).toBeDefined();
		expect(storely.namespace).toBe("test");
		expect(storely.store.namespace).toBe("test");
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const key2 = faker.string.uuid();
		const objValue = faker.lorem.word();
		await storely.set(key1, value1);
		await storely.set(key2, { foo: objValue });
		const result1 = await storely.get<string>(key1);
		expect(result1).toBe(value1);
		const result2 = await storely.get(key2);
		expect(result2).toEqual({ foo: objValue });
	});

	test("should be able to set the client property", () => {
		const storelyKeyDB = new StorelyKeyDB();
		const client = createClient() as RedisClientType;
		storelyKeyDB.client = client;
		expect(storelyKeyDB.client).toBe(client);
	});

	test("should be able to pass in a client to constructor", () => {
		const client = createClient() as RedisClientType;
		const storelyKeyDB = new StorelyKeyDB(client);
		expect(storelyKeyDB.client).toBe(client);
	});

	test("should be able to pass in client options to constructor", () => {
		const uri = "keydb://foo:6378";
		const storelyKeyDB = new StorelyKeyDB({ url: uri });
		expect((storelyKeyDB.client as RedisClientType).options?.url).toBe(uri);
	});

	test("should be able to pass in the url and options to constructor", () => {
		const uri = "keydb://localhost:6378";
		const storelyKeyDB = new StorelyKeyDB(uri, { namespace: "test" });
		expect((storelyKeyDB.client as RedisClientType).options?.url).toBe(uri);
		expect(storelyKeyDB.namespace).toBe("test");
	});

	test("should be able to pass in the url and options to constructor", () => {
		const uri = "keydb://localhost:6378";
		const options = {
			namespace: "test",
			keyPrefixSeparator: "->",
			clearBatchSize: 100,
			useUnlink: true,
			noNamespaceAffectsAll: true,
		};
		const storelyKeyDB = new StorelyKeyDB(uri, options);
		expect(storelyKeyDB.namespace).toBe("test");
		expect(storelyKeyDB.keyPrefixSeparator).toBe("->");
		expect(storelyKeyDB.clearBatchSize).toBe(100);
		expect(storelyKeyDB.useUnlink).toBe(true);
		expect(storelyKeyDB.noNamespaceAffectsAll).toBe(true);
	});

	test("should be able to get and set properties", () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.namespace = "test";
		storelyKeyDB.keyPrefixSeparator = "->";
		storelyKeyDB.clearBatchSize = 1001;
		storelyKeyDB.useUnlink = false;
		expect(storelyKeyDB.namespace).toBe("test");
		expect(storelyKeyDB.keyPrefixSeparator).toBe("->");
		expect(storelyKeyDB.clearBatchSize).toBe(1001);
		expect(storelyKeyDB.useUnlink).toBe(false);
	});

	test("keyPrefixSeparator should be able to set to blank string", () => {
		const storelyKeyDB = new StorelyKeyDB("keydb://localhost:6378", {
			keyPrefixSeparator: "",
		});
		expect(storelyKeyDB.keyPrefixSeparator).toBe("");
		storelyKeyDB.keyPrefixSeparator = "->";
		expect(storelyKeyDB.keyPrefixSeparator).toBe("->");
		storelyKeyDB.keyPrefixSeparator = "";
		expect(storelyKeyDB.keyPrefixSeparator).toBe("");
	});

	test("clearBatchSize should not set if 0 or less than", () => {
		const storelyKeyDB = new StorelyKeyDB("keydb://localhost:6378", {
			clearBatchSize: 0,
		});
		expect(storelyKeyDB.clearBatchSize).toBe(1000);
		storelyKeyDB.clearBatchSize = 200;
		expect(storelyKeyDB.clearBatchSize).toBe(200);
		let error = "";
		storelyKeyDB.on("error", (message) => {
			error = message as string;
		});
		storelyKeyDB.clearBatchSize = -1;
		expect(error).toBe("clearBatchSize must be greater than 0");
		expect(storelyKeyDB.clearBatchSize).toBe(200);
	});

	test("should be able to get and set properties individually", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.namespace = "test";
		storelyKeyDB.keyPrefixSeparator = ":1";
		storelyKeyDB.clearBatchSize = 2000;
		storelyKeyDB.noNamespaceAffectsAll = true;

		expect(storelyKeyDB.namespace).toBe("test");
		expect(storelyKeyDB.keyPrefixSeparator).toBe(":1");
		expect(storelyKeyDB.clearBatchSize).toBe(2000);
		expect(storelyKeyDB.noNamespaceAffectsAll).toBe(true);
		expect(storelyKeyDB.throwOnErrors).toBe(false);
		expect(storelyKeyDB.throwOnConnectError).toBe(true);
		expect(storelyKeyDB.useUnlink).toBe(true);
	});

	test("client options should contain the url", () => {
		const uri = "keydb://foo:6378";
		const storelyKeyDB = new StorelyKeyDB(uri);
		expect((storelyKeyDB.client as RedisClientType).options?.url).toBe(uri);
	});

	test("should get and set throwOnConnectError", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnConnectError: true });
		const client = await storelyKeyDB.getClient();
		expect(client).toBeDefined();

		expect(storelyKeyDB.throwOnConnectError).toBe(true);
		storelyKeyDB.throwOnConnectError = false;
		expect(storelyKeyDB.throwOnConnectError).toBe(false);
		storelyKeyDB.throwOnConnectError = true;
		expect(storelyKeyDB.throwOnConnectError).toBe(true);
	});

	test("should get and set throwOnErrors", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });
		const client = await storelyKeyDB.getClient();
		expect(client).toBeDefined();
		expect(storelyKeyDB.throwOnErrors).toBe(true);
		storelyKeyDB.throwOnErrors = false;
		expect(storelyKeyDB.throwOnErrors).toBe(false);
		storelyKeyDB.throwOnErrors = true;
		expect(storelyKeyDB.throwOnErrors).toBe(true);
	});
});

describe("StorelyKeyDB Methods", () => {
	beforeEach(async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const client = (await storelyKeyDB.getClient()) as RedisClientType;
		await client.flushDb();
		await storelyKeyDB.disconnect();
	});
	test("should be able to connect, set, delete, and disconnect", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await storelyKeyDB.set(key, val);
		const value = await storelyKeyDB.get(key);
		expect(value).toBe(val);
		const deleted = await storelyKeyDB.delete(key);
		expect(deleted).toBe(true);
		await storelyKeyDB.disconnect();
	});

	test("should be able to connect, set, delete, and disconnect using useUnlink to false", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.useUnlink = false;
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await storelyKeyDB.set(key, val);
		const value = await storelyKeyDB.get(key);
		expect(value).toBe(val);
		const deleted = await storelyKeyDB.delete(key);
		expect(deleted).toBe(true);
		await storelyKeyDB.disconnect();
	});

	test("should do nothing if no keys on clear", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const client = (await storelyKeyDB.getClient()) as RedisClientType;
		await client.flushDb();
		await storelyKeyDB.clear();
		storelyKeyDB.namespace = "ns1";
		await storelyKeyDB.clear();
		await storelyKeyDB.disconnect();
	});
});
```

- [x] **Step 3: Create `storage/keydb/test/get.test.ts`**

Copy the Redis get.test.ts, replace all `StorelyRedis` with `StorelyKeyDB`, `redisUri`/`REDIS_URI` with `keydbUri`/`KEYDB_URI`, and update the default URL to `keydb://localhost:6378`.

- [x] **Step 4: Create `storage/keydb/test/set.test.ts`**

Copy the Redis set.test.ts, replace all `StorelyRedis` with `StorelyKeyDB`, `RedisErrorMessages` with `KeyDBErrorMessages`, `redisUri`/`REDIS_URI` with `keydbUri`/`KEYDB_URI`, and update the default URL to `keydb://localhost:6378`. The bad URI env var changes from `REDIS_BAD_URI` to `KEYDB_BAD_URI`.

- [x] **Step 5: Create `storage/keydb/test/delete.test.ts`**

Copy the Redis delete.test.ts, same renaming pattern. KeyDBErrorMessages.KeyDBClientNotConnectedThrown replaces RedisErrorMessages.RedisClientNotConnectedThrown.

- [x] **Step 6: Create `storage/keydb/test/has.test.ts`**

Copy the Redis has.test.ts, same renaming pattern.

- [x] **Step 7: Create `storage/keydb/test/iterator.test.ts`**

Copy the Redis iterator.test.ts, same renaming pattern. Update `createStorely` → `createStorelyKeyDB`.

- [x] **Step 8: Create `storage/keydb/test/namespace.test.ts`**

Copy the Redis namespace.test.ts, same renaming pattern. Update URLs.

- [x] **Step 9: Create `storage/keydb/test/get-client.test.ts`**

Copy the Redis get-client.test.ts, same renaming pattern. Update env vars and error message references.

- [x] **Step 10: Create `storage/keydb/test/create-storely.test.ts`**

```typescript
import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import StorelyKeyDB, { createStorelyKeyDB, createStorelyKeyDBNonBlocking } from "../src/index.js";

const keydbUri = process.env.KEYDB_URI ?? "keydb://localhost:6378";

describe("createStorelyKeyDB", () => {
	test("should create Storely instance with default options", async () => {
		const storely = createStorelyKeyDB(keydbUri);
		expect(storely).toBeDefined();
		expect(storely.store).toBeInstanceOf(StorelyKeyDB);
		expect(storely.namespace).toBeUndefined();
		expect(storely.store.namespace).toBeUndefined();
	});

	test("should create Storely instance with custom namespace", async () => {
		const namespace = faker.string.alphanumeric(10);
		const storely = createStorelyKeyDB(keydbUri, { namespace });
		expect(storely).toBeDefined();
		expect(storely.store).toBeInstanceOf(StorelyKeyDB);
		expect(storely.namespace).toBe(namespace);
		expect(storely.store.namespace).toBe(namespace);
	});

	test("should create Storely instance with custom namespace and errors enabled", async () => {
		const namespace = faker.string.alphanumeric(10);
		const storely = createStorelyKeyDB(keydbUri, {
			namespace,
			throwOnErrors: true,
			throwOnConnectError: true,
		});
		expect(storely).toBeDefined();
		expect(storely.store).toBeInstanceOf(StorelyKeyDB);
		expect(storely.namespace).toBe(namespace);
		expect(storely.store.namespace).toBe(namespace);
	});
});

describe("createStorelyKeyDBNonBlocking", () => {
	test("should create Storely instance with default options", async () => {
		const storely = createStorelyKeyDBNonBlocking(keydbUri);
		expect(storely).toBeDefined();
		expect(storely.throwOnErrors).toBe(false);
		expect(storely.store).toBeInstanceOf(StorelyKeyDB);
		expect(storely.store.throwOnErrors).toBe(false);
		expect(storely.store.throwOnConnectError).toBe(false);
		expect(storely.namespace).toBeUndefined();
		expect(storely.store.namespace).toBeUndefined();
	});
});
```

- [x] **Step 11: Create `storage/keydb/test/types.test.ts`**

Copy the Redis types.test.ts, replace `StorelyRedis` with `StorelyKeyDB`.

- [x] **Step 12: Run lint check**

Run: `cd storage/keydb && pnpm lint`
Expected: No lint errors (fix any issues if found).

---

### Task 7: Add Docker Compose configuration for KeyDB

**Files:**
- Modify: `scripts/docker-compose.yaml`
- Modify: `scripts/docker-compose-arm64.yaml`

- [x] **Step 1: Add KeyDB service to `scripts/docker-compose.yaml`**

Add after the `storely_redis_tls` service:

```yaml
  storely_keydb:
    image: eqalpha/keydb:latest
    environment:
      KEYDB_HOST: keydb
    ports:
      - 6378:6379
  storely_keydb_tls:
    image: eqalpha/keydb:latest
    command: keydb-server --port 0 --tls-port 6379 --tls-cert-file /tls/redis.crt --tls-key-file /tls/redis.key --tls-ca-cert-file /tls/ca.crt --tls-auth-clients no
    environment:
      KEYDB_HOST: keydb
    ports:
      - 6381:6379
    volumes:
      - ../storage/keydb/tls:/tls
```

- [x] **Step 2: Add same KeyDB service to `scripts/docker-compose-arm64.yaml`**

Add the same `storely_keydb` and `storely_keydb_tls` service blocks. If this file doesn't exist or has different structure, read it first and add accordingly.

- [x] **Step 3: Verify Docker Compose syntax**

Run: `docker compose -f ./scripts/docker-compose.yaml config`
Expected: Valid config with storely_keydb and storely_keydb_tls services.

---

### Task 8: Create README

**Files:**
- Create: `storage/keydb/README.md`

- [x] **Step 1: Create `storage/keydb/README.md`**

Based on the Redis adapter README but adapted for KeyDB. Key differences:
- Package name: `@storely/keydb`
- Default connection: `keydb://localhost:6378`
- References to KeyDB instead of Redis where appropriate
- Keep `@redis/client` library reference since KeyDB uses the same protocol

---

### Task 9: Build and verify

- [x] **Step 1: Install dependencies**

Run: `pnpm install`
Expected: Lockfile updated, workspace linked.

- [x] **Step 2: Build core storely first**

Run: `pnpm build:storely`
Expected: Core package builds successfully.

- [x] **Step 3: Build keydb adapter**

Run: `cd storage/keydb && pnpm build`
Expected: TypeScript compiles, `dist/` generated with `.mjs`, `.cjs`, `.d.mts`, `.d.cts` files.

- [x] **Step 4: Run lint**

Run: `cd storage/keydb && pnpm lint`
Expected: No lint errors.

- [x] **Step 5: Commit all changes**

```bash
git add -A
git commit -m "keydb - feat: Add KeyDB storage adapter"
```

---

### Task 10: Integration test verification (requires Docker)

This task requires a running KeyDB Docker container. It can be verified separately.

- [x] **Step 1: Start KeyDB Docker service**

Run: `docker compose -f ./scripts/docker-compose.yaml up -d storely_keydb`
Expected: KeyDB container starts on port 6378.

- [x] **Step 2: Run KeyDB adapter tests**

Run: `cd storage/keydb && KEYDB_URI=keydb://localhost:6378 pnpm test`
Expected: All tests pass.

- [x] **Step 3: Stop KeyDB Docker service**

Run: `docker compose -f ./scripts/docker-compose.yaml stop storely_keydb`