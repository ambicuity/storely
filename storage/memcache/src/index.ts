import type {
	StorelyEntry,
	StorelyStorageAdapter,
	StorelyStorageGetResult,
} from "@ambicuity/storely";
import { Storely } from "@ambicuity/storely";
import { Hookified } from "hookified";
import { Memcache, type MemcacheOptions } from "memcache";

/**
 * Configuration options for the StorelyMemcache adapter.
 * Extends the Memcache client options with additional Storely-specific properties.
 */
export type StorelyMemcacheOptions = {
	/** Optional namespace for key prefixing */
	namespace?: string;
	/**
	 * Per-operation timeout in milliseconds. Each `get`/`set`/`delete`
	 * (and the per-entry calls inside `getMany`/`setMany`/`deleteMany`)
	 * is raced against this timeout via `Promise.race`. If the underlying
	 * `memcache` client doesn't return within the deadline, the operation
	 * rejects rather than hanging forever waiting on the OS TCP timeout.
	 *
	 * Default: 5000 ms.
	 */
	commandTimeout?: number;
} & MemcacheOptions;

/**
 * Memcache storage adapter for Storely.
 * Uses the `memcache` package to connect to a Memcached server.
 *
 * @example
 * ```typescript
 * const store = new StorelyMemcache('localhost:11211');
 * const storely = new Storely({ store });
 * ```
 */
export class StorelyMemcache extends Hookified implements StorelyStorageAdapter {
	/** Optional namespace used to prefix all keys */
	public namespace?: string;
	/** The underlying Memcache client instance */
	public client: Memcache;
	private readonly _nodes: (string | import("memcache").MemcacheNode)[];
	private readonly _timeout?: number;
	private readonly _keepAlive?: boolean;
	private readonly _retries?: number;
	private readonly _retryDelay?: number;
	private readonly _commandTimeout: number;

	/**
	 * Creates a new StorelyMemcache instance.
	 * @param uri - The memcache server URI (e.g., `'localhost:11211'`) or an options object. Defaults to `'localhost:11211'`.
	 * @param options - Additional configuration options, merged with the first argument if it is an object.
	 */
	constructor(uri?: string | StorelyMemcacheOptions, options?: StorelyMemcacheOptions) {
		super({ throwOnEmptyListeners: false });

		const allOptions: StorelyMemcacheOptions = {
			...(typeof uri === "object" ? uri : {}),
			...options,
		};

		if (!allOptions.nodes) {
			allOptions.nodes = typeof uri === "string" ? [uri] : ["localhost:11211"];
		}

		this._nodes = allOptions.nodes;
		this._timeout = allOptions.timeout;
		this._keepAlive = allOptions.keepAlive;
		this._retries = allOptions.retries;
		this._retryDelay = allOptions.retryDelay;
		this._commandTimeout = allOptions.commandTimeout ?? 5000;
		this.namespace = allOptions.namespace;

		const {
			namespace: _namespace,
			commandTimeout: _commandTimeout,
			...memcacheOptions
		} = allOptions;
		this.client = new Memcache(memcacheOptions);
	}

	/**
	 * Race a memcache call against `_commandTimeout`. The underlying
	 * `memcache` package has no per-op timeout; without this guard a
	 * batch operation against an unreachable server would block on the
	 * OS TCP timeout (potentially minutes per key).
	 */
	private withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
		return Promise.race([
			op,
			new Promise<T>((_resolve, reject) =>
				setTimeout(
					() => reject(new Error(`memcache ${label} timed out after ${this._commandTimeout}ms`)),
					this._commandTimeout,
				).unref(),
			),
		]);
	}

	/**
	 * Gets the configured nodes.
	 */
	public get nodes(): (string | import("memcache").MemcacheNode)[] {
		return this._nodes;
	}

	/**
	 * Gets the configured timeout.
	 */
	public get timeout(): number | undefined {
		return this._timeout;
	}

	/**
	 * Gets the configured keepAlive setting.
	 */
	public get keepAlive(): boolean | undefined {
		return this._keepAlive;
	}

	/**
	 * Gets the configured retries.
	 */
	public get retries(): number | undefined {
		return this._retries;
	}

	/**
	 * Gets the configured retry delay.
	 */
	public get retryDelay(): number | undefined {
		return this._retryDelay;
	}

	/**
	 * Wraps a value with expiry metadata for storage.
	 */
	private wrapValue(value: unknown, ttl?: number): string {
		const expires = typeof ttl === "number" ? Date.now() + ttl : null;
		return JSON.stringify({ v: value, e: expires });
	}

	/**
	 * Unwraps a stored value, checking expiry metadata.
	 * Handles legacy data (stored without envelope) gracefully.
	 */
	private unwrapValue<T>(raw: unknown): { value: T | undefined; expired: boolean } {
		/* v8 ignore next -- @preserve */
		if (raw === null || raw === undefined) {
			return { value: undefined, expired: false };
		}

		try {
			const parsed = JSON.parse(raw as string) as { v: T; e: number | null };
			if (parsed.v === undefined) {
				return { value: raw as T, expired: false };
			}

			if (parsed.e !== null && Date.now() > parsed.e) {
				return { value: undefined, expired: true };
			}

			return { value: parsed.v, expired: false };
		} catch {
			return { value: raw as T, expired: false };
		}
	}

	/**
	 * Retrieves a value from the memcache server.
	 * @param key - The key to retrieve
	 * @returns The stored data, or undefined if the key does not exist or is expired
	 */
	async get<Value>(key: string): Promise<StorelyStorageGetResult<Value>> {
		try {
			const raw = await this.withTimeout(this.client.get(this.formatKey(key)), "get");
			if (raw === undefined) {
				return undefined;
			}

			const { value, expired } = this.unwrapValue<Value>(raw);
			if (expired) {
				await this.delete(key);
				return undefined;
			}

			return value as StorelyStorageGetResult<Value>;
		} catch (error) {
			this.emit("error", error);
		}

		return undefined;
	}

	/**
	 * Retrieves multiple values from the memcache server.
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored data corresponding to each key
	 */
	async getMany<Value>(keys: string[]) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.allSettled(promises).then((values) => {
			const data: Array<StorelyStorageGetResult<Value>> = [];
			for (const value of values) {
				// @ts-expect-error - value is an object
				data.push(value.value as StorelyStorageGetResult<Value>);
			}

			return data;
		});
	}

	/**
	 * Stores a value in the memcache server.
	 * @param key - The key to store
	 * @param value - The value to store
	 * @param ttl - Time to live in milliseconds. Converted to seconds internally for memcache.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any, ttl?: number): Promise<boolean> {
		const exptime = ttl !== undefined ? Math.ceil(ttl / 1000) : 0;
		try {
			await this.withTimeout(
				this.client.set(this.formatKey(key), this.wrapValue(value, ttl), exptime),
				"set",
			);
			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Stores multiple values in the memcache server.
	 * @param entries - An array of objects containing key, value, and optional ttl
	 */
	async setMany<Value>(entries: StorelyEntry<Value>[]): Promise<boolean[] | undefined> {
		const settled = await Promise.allSettled(
			entries.map(async ({ key, value, ttl }) => this.set(key, value, ttl)),
		);
		return settled.map((result) => (result.status === "fulfilled" ? result.value : false));
	}

	/**
	 * Deletes a key from the memcache server.
	 * @param key - The key to delete
	 * @returns `true` if the key was deleted, `false` otherwise
	 */
	async delete(key: string): Promise<boolean> {
		try {
			return await this.withTimeout(this.client.delete(this.formatKey(key)), "delete");
		} catch (error) {
			this.emit("error", error);
		}

		return false;
	}

	/**
	 * Deletes multiple keys from the memcache server.
	 * @param keys - An array of keys to delete
	 * @returns An array of booleans indicating whether each key was successfully deleted.
	 */
	async deleteMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.delete(key));
		const results = await Promise.allSettled(promises);
		return results.map((x) => (x.status === "fulfilled" ? x.value : false));
	}

	/**
	 * Checks whether a key exists in the memcache server.
	 * @param key - The key to check
	 * @returns `true` if the key exists, `false` otherwise. Returns `false` on any error.
	 */
	async has(key: string): Promise<boolean> {
		try {
			const raw = await this.withTimeout(this.client.get(this.formatKey(key)), "has");
			if (raw === undefined) {
				return false;
			}

			const { expired } = this.unwrapValue(raw);
			if (expired) {
				await this.delete(key);
				return false;
			}

			return true;
		} catch {
			/* v8 ignore next -- @preserve */
			return false;
		}
	}

	/**
	 * Checks whether multiple keys exist in the memcache server.
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists
	 */
	async hasMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.has(key));
		const results = await Promise.allSettled(promises);
		return results.map((result) => (result.status === "fulfilled" ? result.value : false));
	}

	/**
	 * Clears data from the memcache server.
	 *
	 * Memcached does not support key enumeration, so the only way to
	 * "clear" is `flush_all` — which flushes **the entire server**,
	 * including data owned by other namespaces or other applications.
	 * That is rarely what a caller of `storely.clear()` actually wants.
	 *
	 * - When a `namespace` is configured, this method throws unless the
	 *   caller explicitly opted into the destructive flush by passing
	 *   `{ destructive: true }`. This prevents a namespaced consumer
	 *   from accidentally wiping a shared cluster.
	 * - When no namespace is configured, the flush proceeds (the caller
	 *   has implicitly accepted the global semantics).
	 */
	async clear(options: { destructive?: boolean } = {}): Promise<void> {
		if (this.namespace && !options.destructive) {
			const err = new Error(
				"@ambicuity/memcache: clear() flushes the entire Memcached server, not just the namespace. Pass { destructive: true } to acknowledge.",
			);
			this.emit("error", err);
			throw err;
		}
		try {
			await this.withTimeout(this.client.flush(), "flush");
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Gracefully disconnects from the memcache server.
	 */
	async disconnect(): Promise<void> {
		await this.client.disconnect();
	}

	/**
	 * Formats a key by prepending the namespace if one is set.
	 * @param key - The key to format
	 * @returns The formatted key (e.g., `'namespace:key'`), or the original key if no namespace is set
	 */
	formatKey(key: string) {
		let result = key;

		if (this.namespace) {
			result = `${this.namespace.trim()}:${key.trim()}`;
		}

		return result;
	}
}

/**
 * Creates a new Storely instance backed by a Memcache store.
 * @param uri - The memcache server URI (e.g., `'localhost:11211'`) or an options object.
 * @param options - Additional configuration options, merged with the first argument if it is an object.
 * @returns A configured Storely instance using StorelyMemcache as the store.
 *
 * @example
 * ```typescript
 * const storely = createStorely('localhost:11211');
 * await storely.set('foo', 'bar');
 * ```
 */
export const createStorely = (
	uri?: string | StorelyMemcacheOptions,
	options?: StorelyMemcacheOptions,
) => new Storely({ store: new StorelyMemcache(uri, options) });

export default StorelyMemcache;
