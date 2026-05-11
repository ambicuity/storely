import { Storely, type StorelyEntry, type StorelyStorageGetResult } from "@ambicuity/core";
import { Etcd3, type Lease } from "etcd3";
import { Hookified } from "hookified";
import type { ClearOutput, DeleteOutput, GetOutput, HasOutput } from "./types.js";

/**
 * Configuration options for the StorelyEtcd adapter.
 */
export type StorelyEtcdOptions = {
	/** The etcd server URL (e.g., `'127.0.0.1:2379'`). The `etcd://` protocol prefix is automatically stripped. */
	url?: string;
	/** Alias for `url` */
	uri?: string;
	/** Default TTL in milliseconds for all keys. Converted to seconds internally for etcd leases. */
	ttl?: number;
	/** Busy timeout in milliseconds */
	busyTimeout?: number;
	/** Optional namespace for key prefixing */
	namespace?: string;
};

/**
 * Etcd storage adapter for Storely.
 * Uses the [etcd3](https://github.com/microsoft/etcd3) client to connect to an etcd server.
 *
 * @example
 * ```typescript
 * const store = new StorelyEtcd('etcd://localhost:2379');
 * const storely = new Storely({ store });
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: any is allowed
export class StorelyEtcd<GenericValue = any> extends Hookified {
	private _client!: Etcd3;
	private _lease?: Lease;
	private _url = "127.0.0.1:2379";
	private _ttl?: number;
	private _busyTimeout?: number;
	private _namespace?: string;
	private _keyPrefixSeparator = ":";

	/**
	 * Cache of recently-created per-call leases, keyed by TTL bucket
	 * (TTL in seconds). Leases are reused across `set` calls within the
	 * same bucket to bound lease cardinality. The trade-off: keys sharing
	 * a bucket lease will be removed when the lease expires (i.e. their
	 * effective TTL is bounded by the bucket lease's remaining lifetime).
	 *
	 * Without this cache the previous implementation created a fresh
	 * server-side lease for every `set` with a per-key TTL, which
	 * exhausts etcd's lease table under sustained write load.
	 */
	private _leaseBuckets: Map<number, { lease: Lease; createdAt: number }> = new Map();

	/**
	 * Creates a new StorelyEtcd instance.
	 * @param url - An etcd server URI string (e.g., `'etcd://localhost:2379'`) or a `StorelyEtcdOptions` object. Defaults to `'127.0.0.1:2379'`.
	 * @param options - Optional `StorelyEtcdOptions` object. When both `url` and `options` are objects, they are merged together.
	 */
	constructor(url?: StorelyEtcdOptions | string, options?: StorelyEtcdOptions) {
		super({ throwOnEmptyListeners: false });

		url ??= {};

		if (typeof url === "string") {
			url = { url };
		}

		if (url.uri) {
			url = { url: url.uri, ...url };
		}

		const merged = {
			...url,
			...options,
		};

		/* v8 ignore next -- @preserve */
		if (merged.url) {
			this._url = merged.url.replace(/^etcd:\/\//, "");
		}

		this._ttl = typeof merged.ttl === "number" ? merged.ttl : undefined;
		this._busyTimeout = merged.busyTimeout;

		this._client = new Etcd3({
			hosts: this._url,
		});

		// Https://github.com/microsoft/etcd3/issues/105
		this._client.getRoles().catch((error) => this.emit("error", error));

		if (typeof this._ttl === "number") {
			this._lease = this._client.lease(this._ttl / 1000, {
				autoKeepAlive: false,
			});
		}
	}

	/**
	 * Gets the underlying etcd3 client instance.
	 */
	public get client(): Etcd3 {
		return this._client;
	}

	/**
	 * Sets the underlying etcd3 client instance.
	 */
	public set client(value: Etcd3) {
		this._client = value;
	}

	/**
	 * Gets the etcd lease used for TTL support.
	 */
	public get lease(): Lease | undefined {
		return this._lease;
	}

	/**
	 * Sets the etcd lease used for TTL support.
	 */
	public set lease(value: Lease | undefined) {
		this._lease = value;
	}

	/**
	 * Gets the etcd server URL.
	 * @default '127.0.0.1:2379'
	 */
	public get url(): string {
		return this._url;
	}

	/**
	 * Sets the etcd server URL.
	 */
	public set url(value: string) {
		this._url = value;
	}

	/**
	 * Gets the default TTL in milliseconds.
	 * @default undefined
	 */
	public get ttl(): number | undefined {
		return this._ttl;
	}

	/**
	 * Sets the default TTL in milliseconds.
	 */
	public set ttl(value: number | undefined) {
		this._ttl = value;
	}

	/**
	 * Gets the busy timeout in milliseconds.
	 * @default undefined
	 */
	public get busyTimeout(): number | undefined {
		return this._busyTimeout;
	}

	/**
	 * Sets the busy timeout in milliseconds.
	 */
	public set busyTimeout(value: number | undefined) {
		this._busyTimeout = value;
	}

	/**
	 * Gets the namespace used to prefix keys.
	 * @default undefined
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Sets the namespace used to prefix keys.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Gets the separator between the namespace and key.
	 * @default ':'
	 */
	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	/**
	 * Sets the separator between the namespace and key.
	 */
	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	/**
	 * Creates a prefixed key by prepending the namespace and separator.
	 * @param key - The key to prefix
	 * @param namespace - The namespace to prepend. If not provided, the key is returned as-is.
	 * @returns The prefixed key (e.g., `'namespace:key'`), or the original key if no namespace is given.
	 */
	public createKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return `${namespace}${this._keyPrefixSeparator}${key}`;
		}

		return key;
	}

	/**
	 * Removes the namespace prefix from a key.
	 * @param key - The key to strip the prefix from
	 * @param namespace - The namespace prefix to remove. If not provided, the key is returned as-is.
	 * @returns The key without the namespace prefix.
	 */
	public removeKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return key.replace(`${namespace}${this._keyPrefixSeparator}`, "");
		}

		return key;
	}

	/**
	 * Formats a key by prepending the namespace if one is set. Avoids double-prefixing
	 * by checking if the key already starts with the namespace prefix.
	 * @param key - The key to format
	 * @returns The formatted key with namespace prefix, or the original key if no namespace is set.
	 */
	public formatKey(key: string): string {
		if (!this._namespace) {
			return key;
		}

		const prefix = `${this._namespace}${this._keyPrefixSeparator}`;
		if (key.startsWith(prefix)) {
			return key;
		}

		return `${prefix}${key}`;
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
	private unwrapValue<T>(raw: unknown): { value: T | null; expired: boolean } {
		/* v8 ignore next -- @preserve */
		if (raw === null || raw === undefined) {
			return { value: null, expired: false };
		}

		try {
			const parsed = JSON.parse(raw as string) as { v: T; e: number | null };
			if (parsed.v === undefined) {
				// Not our envelope format — legacy data
				return { value: raw as T, expired: false };
			}

			if (parsed.e !== null && Date.now() > parsed.e) {
				return { value: null, expired: true };
			}

			return { value: parsed.v, expired: false };
		} catch {
			// Not valid JSON — legacy data, return as-is
			return { value: raw as T, expired: false };
		}
	}

	/**
	 * Retrieves a value from the etcd server.
	 * @param key - The key to retrieve
	 * @returns The stored value, or `undefined` if the key does not exist.
	 */
	public async get(key: string): GetOutput<GenericValue> {
		try {
			const raw = await this._client.get(this.formatKey(key));
			if (raw === null) {
				return null as unknown as GetOutput<GenericValue>;
			}

			const { value, expired } = this.unwrapValue<GenericValue>(raw);
			if (expired) {
				await this.delete(key);
				return null as unknown as GetOutput<GenericValue>;
			}

			return value as unknown as GetOutput<GenericValue>;
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Retrieves multiple values from the etcd server.
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored data corresponding to each key.
	 */
	public async getMany(keys: string[]): Promise<Array<StorelyStorageGetResult<GenericValue>>> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.allSettled(promises).then((values) => {
			const data: Array<StorelyStorageGetResult<GenericValue>> = [];
			for (const value of values) {
				// @ts-expect-error - value is an object
				if (value.value === null) {
					data.push(undefined);
				} else {
					// @ts-expect-error - value is an object
					data.push(value.value as StorelyStorageGetResult<GenericValue>);
				}
			}

			return data;
		});
	}

	/**
	 * Stores a value in the etcd server. If a default TTL is configured, the value is stored with an etcd lease.
	 * @param key - The key to store
	 * @param value - The value to store
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public async set(key: string, value: any, ttl?: number): Promise<boolean> {
		try {
			const target =
				typeof ttl === "number"
					? this.getOrCreateLeaseForTtl(Math.max(ttl / 1000, 1))
					: this._ttl
						? this._lease
						: this._client;

			await target?.put(this.formatKey(key)).value(this.wrapValue(value, ttl));
			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Get a lease for the requested TTL (in seconds), reusing any active
	 * lease from the same bucket whose remaining lifetime still covers
	 * the requested TTL. Stale buckets are evicted lazily.
	 */
	private getOrCreateLeaseForTtl(ttlSeconds: number): Lease {
		const bucket = Math.ceil(ttlSeconds);
		const cached = this._leaseBuckets.get(bucket);
		const now = Date.now();
		// A lease created at `createdAt` lives until `createdAt + bucket*1000`.
		// Reuse only if the lease still has at least the full requested TTL
		// remaining; otherwise create a fresh one. This bounds the worst-case
		// effective-TTL drift to roughly one bucket-period.
		if (cached && now - cached.createdAt < (bucket * 1000) / 2) {
			return cached.lease;
		}
		const lease = this._client.lease(bucket, { autoKeepAlive: false });
		this._leaseBuckets.set(bucket, { lease, createdAt: now });
		return lease;
	}

	/**
	 * Stores multiple values in the etcd server.
	 * @param entries - An array of objects containing key and value
	 */
	public async setMany<Value>(entries: StorelyEntry<Value>[]): Promise<boolean[] | undefined> {
		const promises = entries.map(async ({ key, value, ttl }) => this.set(key, value, ttl));
		const results = await Promise.allSettled(promises);
		const boolResults: boolean[] = [];
		for (const result of results) {
			/* v8 ignore next 3 -- @preserve */
			if (result.status === "rejected") {
				this.emit("error", result.reason);
				boolResults.push(false);
			} else {
				boolResults.push(true);
			}
		}

		return boolResults;
	}

	/**
	 * Deletes a key from the etcd server.
	 * @param key - The key to delete
	 * @returns `true` if the key was deleted, `false` otherwise.
	 */
	public async delete(key: string): DeleteOutput {
		if (typeof key !== "string") {
			return false;
		}

		try {
			return await this._client
				.delete()
				.key(this.formatKey(key))
				.then((key) => key.deleted !== "0");
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Deletes multiple keys from the etcd server.
	 * @param keys - An array of keys to delete
	 * @returns An array of booleans indicating whether each key was successfully deleted.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		return Promise.allSettled(promises).then((values) =>
			values.map((x) => (x.status === "fulfilled" ? x.value : false)),
		);
	}

	/**
	 * Clears data from the etcd server. If a namespace is set, only keys with
	 * the namespace prefix are deleted. Otherwise, all keys are deleted.
	 */
	public async clear(): ClearOutput {
		try {
			const promise = this._namespace
				? this._client.delete().prefix(`${this._namespace}${this._keyPrefixSeparator}`)
				: this._client.delete().all();
			return await promise.then(() => undefined);
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Returns an async iterator over key-value pairs. If a namespace is set,
	 * only keys matching the namespace prefix are yielded.
	 */
	public async *iterator() {
		const prefix = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}` : "";

		// Fetch the entire prefix range in a single request, then iterate
		// the resulting map locally. This avoids the N+1 round-trip pattern
		// of fetching keys and then per-key gets. Memory footprint is bounded
		// by the prefix size — keep namespaces small or use a bounded prefix.
		let entries: Record<string, string>;
		try {
			entries = await this._client.getAll().prefix(prefix).strings();
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return;
		}
		/* v8 ignore stop -- @preserve */

		for (const [key, raw] of Object.entries(entries)) {
			try {
				if (raw === null || raw === undefined) {
					continue;
				}

				const { value, expired } = this.unwrapValue(raw);
				if (expired) {
					await this._client.delete().key(key);
					continue;
				}

				const unprefixedKey = this.removeKeyPrefix(key, this._namespace);
				yield [unprefixedKey, value];
				/* v8 ignore start -- @preserve */
			} catch (error) {
				this.emit("error", error);
			}
			/* v8 ignore stop -- @preserve */
		}
	}

	/**
	 * Checks whether a key exists in the etcd server.
	 * @param key - The key to check
	 * @returns `true` if the key exists, `false` otherwise.
	 */
	public async has(key: string): HasOutput {
		try {
			const raw = await this._client.get(this.formatKey(key));
			if (raw === null) {
				return false;
			}

			const { expired } = this.unwrapValue(raw);
			if (expired) {
				await this.delete(key);
				return false;
			}

			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Checks whether multiple keys exist in the etcd server.
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.has(key));
		const results = await Promise.allSettled(promises);
		return results.map((result) => (result.status === "fulfilled" ? result.value : false));
	}

	/**
	 * Gracefully disconnects from the etcd server.
	 */
	public async disconnect() {
		try {
			// Revoke the shared instance lease and any cached per-TTL bucket
			// leases. Best-effort: leases that have already expired naturally
			// will reject the revoke call, which is fine.
			const allLeases: Lease[] = [];
			if (this._lease) allLeases.push(this._lease);
			for (const { lease } of this._leaseBuckets.values()) allLeases.push(lease);

			await Promise.allSettled(allLeases.map((l) => l.revoke()));

			this._lease = undefined;
			this._leaseBuckets.clear();
			this._client.close();
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
		}
		/* v8 ignore stop -- @preserve */
	}
}

/**
 * Creates a Storely instance pre-configured with the StorelyEtcd storage adapter.
 * @param url - An etcd server URI string or a StorelyEtcdOptions object.
 * @param options - Optional StorelyEtcdOptions object.
 * @returns A Storely instance using the StorelyEtcd adapter.
 *
 * @example
 * ```typescript
 * const storely = createStorely('etcd://localhost:2379');
 * await storely.set('foo', 'bar');
 * ```
 */
export function createStorely(
	url?: string | StorelyEtcdOptions,
	options?: StorelyEtcdOptions,
): Storely {
	return new Storely({ store: new StorelyEtcd(url, options) });
}

export default StorelyEtcd;
