// biome-ignore-all lint/suspicious/noExplicitAny: rocksdb

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error - @nxtedition/rocksdb ships no type declarations
import { RocksLevel } from "@nxtedition/rocksdb";
import { Hookified } from "hookified";
import type { StorelyEntry, StorelyStorageAdapter, StorelyStorageGetResult } from "storely";
import { RocksDBErrorMessages, type StorelyRocksDBOptions } from "./types.js";

export type { RocksDBCompression, RocksDBLogLevel, StorelyRocksDBOptions } from "./types.js";
export { RocksDBErrorMessages } from "./types.js";

/**
 * RocksDB storage adapter for Storely.
 *
 * Uses `@nxtedition/rocksdb` (which provides a `RocksLevel` class extending
 * `AbstractLevel`) as the underlying engine. Supports in-memory (temp directory)
 * and file-based storage, namespace-scoped key prefixing, lazy TTL expiration,
 * batch operations via `db.batch()`, and range-scoped iteration.
 *
 * @example
 * ```ts
 * import StorelyRocksDB from '@storely/rocksdb';
 * import Storely from 'storely';
 *
 * const store = new StorelyRocksDB('rocksdb:///tmp/mydb');
 * const storely = new Storely({ store });
 * ```
 */
export class StorelyRocksDB extends Hookified implements StorelyStorageAdapter {
	/** The namespace used to prefix keys for multi-tenant separation. */
	private _namespace?: string;

	/**
	 * The RocksDB connection URI.
	 * @default 'rocksdb://:memory:'
	 */
	private _uri = "rocksdb://:memory:";

	/**
	 * The resolved file path for the RocksDB database, derived from the URI.
	 * For `:memory:` URIs, this is a temporary directory.
	 */
	private _db = ":memory:";

	/** Whether the database is opened in read-only mode. */
	private _readOnly = false;

	/** Whether to create the database if it doesn't exist. */
	private _createIfMissing = true;

	/** Whether to throw an error if the database already exists. */
	private _errorIfExists = false;

	/** The RocksDB compression type. */
	private _compression: StorelyRocksDBOptions["compression"] = "snappy";

	/**
	 * The number of entries to fetch per iteration batch.
	 * @default 100
	 */
	private _iterationLimit = 100;

	/**
	 * The interval in milliseconds between automatic expired-entry cleanup runs.
	 * A value of 0 (default) disables the automatic cleanup.
	 * @default 0
	 */
	private _clearExpiredInterval = 0;

	/** The timer reference for the automatic expired-entry cleanup interval. */
	private _clearExpiredTimer?: ReturnType<typeof setInterval>;

	/** The RocksDB log verbosity level. */
	private _infoLogLevel: StorelyRocksDBOptions["infoLogLevel"] = "warn";

	/**
	 * When `true`, errors are thrown; when `false` (default), errors are emitted
	 * via `emit('error', ...)` and no-op responses are returned.
	 * @default false
	 */
	private _throwOnErrors = false;

	/** The underlying RocksLevel database instance. */
	private _dbInstance!: RocksLevel;

	/** The resolved temp directory path for `:memory:` databases (tracked for cleanup). */
	private _tempDir?: string;

	/**
	 * A promise that resolves when the database connection is complete.
	 * Useful for awaiting initialization before first use.
	 */
	public readonly ready: Promise<void>;

	/**
	 * Creates a new StorelyRocksDB instance.
	 *
	 * Parses the URI to resolve the database path, creates a `RocksLevel` instance,
	 * opens the database, and starts the expired-entry cleanup timer if configured.
	 *
	 * @param storelyOptions - A RocksDB connection URI string
	 *   (e.g. `'rocksdb:///path/to/db'`) or a {@link StorelyRocksDBOptions} configuration
	 *   object. Defaults to an in-memory (temp directory) database.
	 * @throws If the URI format is invalid.
	 */
	constructor(storelyOptions?: StorelyRocksDBOptions | string) {
		super({ throwOnEmptyListeners: false });

		if (typeof storelyOptions === "string") {
			this._uri = storelyOptions;
		} else if (storelyOptions) {
			this.setOptions(storelyOptions);
		}

		this._db = this.resolveDbPath();

		this._dbInstance = new RocksLevel(this._db);

		const openOptions: Record<string, any> = {};
		if (this._createIfMissing !== undefined) {
			openOptions.createIfMissing = this._createIfMissing;
		}
		if (this._errorIfExists !== undefined) {
			openOptions.errorIfExists = this._errorIfExists;
		}
		if (this._readOnly !== undefined) {
			openOptions.readOnly = this._readOnly;
		}
		if (this._infoLogLevel !== undefined) {
			openOptions.infoLogLevel = this._infoLogLevel ?? undefined;
		}

		this.ready = this._dbInstance
			.open(openOptions)
			.then(() => {})
			.catch((error: any) => {
				this.emit("error", error);
				throw error;
			});
		this.ready.catch(() => {});

		this.startClearExpiredTimer();
	}

	/**
	 * Get the namespace for the adapter. If `undefined`, no namespace prefix is applied
	 * and entries are stored under the default (empty) namespace.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. Used by Storely core for key prefixing
	 * and scoping operations like {@link clear} and {@link iterator}.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get the RocksDB connection URI.
	 * @default 'rocksdb://:memory:'
	 */
	public get uri(): string {
		return this._uri;
	}

	/**
	 * Get the resolved file path for the RocksDB database.
	 * For `:memory:` URIs, this is a temporary directory path.
	 */
	public get db(): string {
		return this._db;
	}

	/**
	 * Whether the database is opened in read-only mode.
	 * @default false
	 */
	public get readOnly(): boolean {
		return this._readOnly;
	}

	/**
	 * Whether the database will be created if it doesn't exist.
	 * @default true
	 */
	public get createIfMissing(): boolean {
		return this._createIfMissing;
	}

	/**
	 * Whether to throw an error if the database already exists.
	 * @default false
	 */
	public get errorIfExists(): boolean {
		return this._errorIfExists;
	}

	/**
	 * Get the RocksDB compression type.
	 * @default 'snappy'
	 */
	public get compression(): StorelyRocksDBOptions["compression"] {
		return this._compression;
	}

	/**
	 * Get the number of entries to fetch per iteration batch.
	 * @default 100
	 */
	public get iterationLimit(): number {
		return this._iterationLimit;
	}

	/**
	 * Set the number of entries to fetch per iteration batch. Must be a positive integer.
	 */
	public set iterationLimit(value: number) {
		if (!Number.isInteger(value) || value < 1) {
			throw new RangeError("iterationLimit must be a positive integer");
		}
		this._iterationLimit = value;
	}

	/**
	 * Get the interval in milliseconds between automatic expired-entry cleanup runs.
	 * A value of `0` means the automatic cleanup is disabled.
	 * @default 0
	 */
	public get clearExpiredInterval(): number {
		return this._clearExpiredInterval;
	}

	/**
	 * Set the interval in milliseconds between automatic expired-entry cleanup runs.
	 * Setting to `0` disables the automatic cleanup. Any existing timer is stopped
	 * and restarted with the new interval.
	 */
	public set clearExpiredInterval(value: number) {
		this._clearExpiredInterval = value;
		this.startClearExpiredTimer();
	}

	/**
	 * Get the RocksDB log verbosity level.
	 * @default 'warn'
	 */
	public get infoLogLevel(): StorelyRocksDBOptions["infoLogLevel"] {
		return this._infoLogLevel;
	}

	/**
	 * Get whether errors are thrown instead of emitted.
	 * @default false
	 */
	public get throwOnErrors(): boolean {
		return this._throwOnErrors;
	}

	/**
	 * Set whether errors are thrown. When `true`, errors are thrown;
	 * when `false`, errors are emitted via `emit('error', ...)` and
	 * no-op responses are returned.
	 */
	public set throwOnErrors(value: boolean) {
		this._throwOnErrors = value;
	}

	/**
	 * Retrieves a value by key from the store.
	 *
	 * If the stored value contains an `expires` timestamp that has passed,
	 * the entry is lazily deleted and `undefined` is returned.
	 *
	 * @param key - The key to retrieve. If a namespace is set, the namespace prefix is stripped before querying.
	 * @returns The value associated with the key, or `undefined` if the key does not exist or is expired.
	 */
	async get<Value>(key: string): Promise<StorelyStorageGetResult<Value>> {
		await this.ready;
		const prefixedKey = this.addKeyPrefix(key);

		try {
			const raw = await this._dbInstance.get(prefixedKey);
			if (raw === undefined || raw === null) {
				return undefined;
			}

			const data = this.parseValue(raw);
			if (data === null) {
				return undefined;
			}

			if (data.expires !== undefined && data.expires !== null && data.expires <= Date.now()) {
				await this._dbInstance.del(prefixedKey);
				return undefined;
			}

			return data.value as StorelyStorageGetResult<Value>;
		} catch (error: any) {
			if (error?.code === "LEVEL_NOT_FOUND") {
				return undefined;
			}

			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
			return undefined;
		}
	}

	/**
	 * Retrieves multiple values by their keys.
	 *
	 * Uses `db.getMany()` which natively returns `undefined` for missing keys,
	 * making it more efficient than individual `get()` calls.
	 *
	 * @param keys - An array of keys to retrieve.
	 * @returns An array of values in the same order as the input keys,
	 *   with `undefined` for any keys that do not exist or are expired.
	 */
	async getMany<Value>(keys: string[]): Promise<Array<StorelyStorageGetResult<Value | undefined>>> {
		if (keys.length === 0) {
			return [];
		}

		await this.ready;
		const prefixedKeys = keys.map((k) => this.addKeyPrefix(k));

		try {
			const rawValues = await this._dbInstance.getMany(prefixedKeys);
			const now = Date.now();
			const expiredKeys: string[] = [];
			const results: Array<StorelyStorageGetResult<Value | undefined>> = [];

			for (let i = 0; i < rawValues.length; i++) {
				const raw = rawValues[i];
				if (raw === undefined || raw === null) {
					results.push(undefined as StorelyStorageGetResult<Value | undefined>);
					continue;
				}

				const data = this.parseValue(raw);
				if (data === null) {
					results.push(undefined as StorelyStorageGetResult<Value | undefined>);
					continue;
				}

				if (data.expires !== undefined && data.expires !== null && data.expires <= now) {
					expiredKeys.push(prefixedKeys[i]);
					results.push(undefined as StorelyStorageGetResult<Value | undefined>);
				} else {
					results.push(data.value as StorelyStorageGetResult<Value | undefined>);
				}
			}

			if (expiredKeys.length > 0) {
				const batch = expiredKeys.map((k) => ({ type: "del" as const, key: k }));
				await this._dbInstance.batch(batch);
			}

			return results;
		} catch (error: any) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
			return keys.map(() => undefined as StorelyStorageGetResult<Value | undefined>);
		}
	}

	/**
	 * Sets a key-value pair. Stores the serialized value as-is in RocksDB.
	 * Extracts the `expires` timestamp from the value for lazy deletion on read.
	 *
	 * @param key - The key to set. If a namespace is set, the namespace prefix is stripped before storing.
	 * @param value - The value to store. Typically a serialized JSON string containing `{ value, expires }`.
	 * @returns `true` if the operation succeeded, `false` otherwise.
	 */
	async set(key: string, value: any): Promise<boolean> {
		await this.ready;
		const prefixedKey = this.addKeyPrefix(key);

		try {
			await this._dbInstance.put(prefixedKey, value);
			return true;
		} catch (error: any) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
			return false;
		}
	}

	/**
	 * Sets multiple key-value pairs at once using `db.batch()`.
	 * More efficient than calling {@link set} in a loop for bulk operations.
	 *
	 * @param entries - An array of `{ key, value }` entry objects to store.
	 * @returns An array of booleans indicating success for each entry, or `undefined` on failure.
	 */
	async setMany<Value>(entries: StorelyEntry<Value>[]): Promise<boolean[] | undefined> {
		if (entries.length === 0) {
			return entries.map(() => true);
		}

		await this.ready;

		try {
			const batch = entries.map((entry) => ({
				type: "put" as const,
				key: this.addKeyPrefix(entry.key),
				value: entry.value as any,
			}));
			await this._dbInstance.batch(batch);
			return entries.map(() => true);
		} catch (error: any) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
			return entries.map(() => false);
		}
	}

	/**
	 * Checks whether a key exists in the store.
	 *
	 * If the stored value contains an `expires` timestamp that has passed,
	 * the entry is lazily deleted and `false` is returned.
	 *
	 * @param key - The key to check.
	 * @returns `true` if the key exists and is not expired, `false` otherwise.
	 */
	async has(key: string): Promise<boolean> {
		await this.ready;
		const prefixedKey = this.addKeyPrefix(key);

		try {
			const raw = await this._dbInstance.get(prefixedKey);
			if (raw === undefined || raw === null) {
				return false;
			}

			const data = this.parseValue(raw);
			if (data === null) {
				return false;
			}

			if (data.expires !== undefined && data.expires !== null && data.expires <= Date.now()) {
				await this._dbInstance.del(prefixedKey);
				return false;
			}

			return true;
		} catch (error: any) {
			if (error?.code === "LEVEL_NOT_FOUND") {
				return false;
			}

			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
			return false;
		}
	}

	/**
	 * Checks whether multiple keys exist in the store.
	 *
	 * Uses `db.getMany()` for efficiency. Expired entries are lazily deleted
	 * in batch.
	 *
	 * @param keys - An array of keys to check.
	 * @returns An array of booleans in the same order as the input keys.
	 */
	async hasMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		await this.ready;
		const prefixedKeys = keys.map((k) => this.addKeyPrefix(k));

		try {
			const rawValues = await this._dbInstance.getMany(prefixedKeys);
			const now = Date.now();
			const expiredKeys: string[] = [];
			const results: boolean[] = [];

			for (let i = 0; i < rawValues.length; i++) {
				const raw = rawValues[i];
				if (raw === undefined || raw === null) {
					results.push(false);
					continue;
				}

				const data = this.parseValue(raw);
				if (data === null) {
					results.push(false);
					continue;
				}

				if (data.expires !== undefined && data.expires !== null && data.expires <= now) {
					expiredKeys.push(prefixedKeys[i]);
					results.push(false);
				} else {
					results.push(true);
				}
			}

			if (expiredKeys.length > 0) {
				const batch = expiredKeys.map((k) => ({ type: "del" as const, key: k }));
				await this._dbInstance.batch(batch);
			}

			return results;
		} catch (error: any) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
			return keys.map(() => false);
		}
	}

	/**
	 * Deletes a key from the store.
	 *
	 * @param key - The key to delete.
	 * @returns `true` if the key existed and was deleted, `false` if the key was not found.
	 */
	async delete(key: string): Promise<boolean> {
		await this.ready;
		const prefixedKey = this.addKeyPrefix(key);

		try {
			const raw = await this._dbInstance.get(prefixedKey);
			if (raw === undefined || raw === null) {
				return false;
			}

			await this._dbInstance.del(prefixedKey);
			return true;
		} catch (error: any) {
			if (error?.code === "LEVEL_NOT_FOUND") {
				return false;
			}

			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
			return false;
		}
	}

	/**
	 * Deletes multiple keys from the store using `db.batch()`.
	 *
	 * @param keys - An array of keys to delete.
	 * @returns An array of booleans in the same order as the input keys,
	 *   where `true` indicates the key existed and was deleted.
	 */
	async deleteMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		await this.ready;
		const prefixedKeys = keys.map((k) => this.addKeyPrefix(k));

		try {
			const rawValues = await this._dbInstance.getMany(prefixedKeys);
			const batch: Array<{ type: "del"; key: string }> = [];
			const results: boolean[] = [];

			for (let i = 0; i < rawValues.length; i++) {
				if (rawValues[i] !== undefined && rawValues[i] !== null) {
					batch.push({ type: "del", key: prefixedKeys[i] });
					results.push(true);
				} else {
					results.push(false);
				}
			}

			if (batch.length > 0) {
				await this._dbInstance.batch(batch);
			}

			return results;
		} catch (error: any) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
			return keys.map(() => false);
		}
	}

	/**
	 * Clears all keys in the current namespace.
	 *
	 * Uses `db.clear()` with range bounds (`gte`/`lt`) when a namespace is set,
	 * or `db.clear()` without bounds to clear everything when no namespace is set.
	 */
	async clear(): Promise<void> {
		await this.ready;

		try {
			const prefix = this.getNamespacePrefix();
			if (prefix) {
				await this._dbInstance.clear({
					gte: prefix,
					lt: `${prefix}~`,
				});
			} else {
				await this._dbInstance.clear();
			}
		} catch (error: any) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
		}
	}

	/**
	 * Iterates over all key-value pairs, optionally filtered by namespace.
	 *
	 * Uses `db.iterator()` with `gte`/`lt` bounds when a namespace is set,
	 * and the `limit` option controlled by {@link iterationLimit}.
	 *
	 * @yields A `[key, value]` tuple for each entry, with the namespace prefix stripped from the key.
	 */
	async *iterator<Value>(): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void> {
		await this.ready;
		const limit = this._iterationLimit > 0 ? this._iterationLimit : 100;
		const prefix = this.getNamespacePrefix();

		try {
			const iterOptions: Record<string, any> = { limit };
			if (prefix) {
				iterOptions.gte = prefix;
				iterOptions.lt = `${prefix}~`;
			}

			for await (const [key, value] of this._dbInstance.iterator(iterOptions)) {
				const keyStr = typeof key === "string" ? key : String(key);
				const strippedKey = this.removeKeyPrefix(keyStr);

				if (value !== undefined && value !== null) {
					const data = this.parseValue(value);
					if (data !== null) {
						if (data.expires !== undefined && data.expires !== null && data.expires <= Date.now()) {
							continue;
						}
						yield [strippedKey, data.value as Awaited<Value>];
					} else {
						yield [strippedKey, value as Awaited<Value>];
					}
				} else {
					yield [strippedKey, undefined];
				}
			}
		} catch (error: any) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
		}
	}

	/**
	 * Deletes all expired entries from the store.
	 *
	 * Iterates over all entries (respecting namespace bounds) and batch-deletes
	 * any whose `expires` timestamp is less than or equal to the current time.
	 * This is called automatically when {@link clearExpiredInterval} is set to a positive value.
	 */
	async clearExpired(): Promise<void> {
		await this.ready;
		const now = Date.now();
		const prefix = this.getNamespacePrefix();
		const expiredKeys: string[] = [];

		try {
			const iterOptions: Record<string, any> = {};
			if (prefix) {
				iterOptions.gte = prefix;
				iterOptions.lt = `${prefix}~`;
			}

			for await (const [key, value] of this._dbInstance.iterator(iterOptions)) {
				const keyStr = typeof key === "string" ? key : String(key);
				if (value !== undefined && value !== null) {
					const data = this.parseValue(value);
					if (
						data !== null &&
						data.expires !== undefined &&
						data.expires !== null &&
						data.expires <= now
					) {
						expiredKeys.push(keyStr);
					}
				}
			}

			if (expiredKeys.length > 0) {
				const batch = expiredKeys.map((k) => ({ type: "del" as const, key: k }));
				await this._dbInstance.batch(batch);
			}
		} catch (error: any) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
		}
	}

	/**
	 * Disconnects from the RocksDB database and releases resources.
	 *
	 * Stops the automatic expired-entry cleanup interval if running,
	 * closes the underlying database connection, and removes the temp
	 * directory if the database was opened with `:memory:`.
	 */
	async disconnect(): Promise<void> {
		this.stopClearExpiredTimer();
		try {
			await this._dbInstance.close();
		} catch (error: any) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
		}

		if (this._tempDir) {
			try {
				rmSync(this._tempDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors for temp directories
			}
			this._tempDir = undefined;
		}
	}

	/**
	 * Adds the namespace prefix to a key.
	 *
	 * If a namespace is set, returns `"namespace:key"`;
	 * otherwise returns the key unchanged.
	 *
	 * @param key - The key to prefix.
	 * @returns The prefixed key.
	 */
	private addKeyPrefix(key: string): string {
		if (this._namespace) {
			return `${this._namespace}:${key}`;
		}
		return key;
	}

	/**
	 * Strips the namespace prefix from a key that was added by Storely core.
	 *
	 * For example, if namespace is `'ns'` and key is `'ns:foo'`, returns `'foo'`.
	 * If no namespace is set or the key does not start with the expected prefix,
	 * the key is returned unchanged.
	 *
	 * @param key - The potentially prefixed key.
	 * @returns The key without the namespace prefix.
	 */
	private removeKeyPrefix(key: string): string {
		if (this._namespace && key.startsWith(`${this._namespace}:`)) {
			return key.slice(this._namespace.length + 1);
		}
		return key;
	}

	/**
	 * Returns the namespace prefix string used for key prefixing and range bounds.
	 *
	 * @returns `"namespace:"` if a namespace is set, or `""` if no namespace is set.
	 */
	private getNamespacePrefix(): string {
		if (this._namespace) {
			return `${this._namespace}:`;
		}
		return "";
	}

	/**
	 * Parses a stored value to extract the `expires` field and the inner `value`.
	 *
	 * The Storely core serializes data as JSON like `{"value":"...","expires":1234567890}`.
	 * This method parses that JSON (or inspects the object directly if the value
	 * is not a string) and returns the parsed data, or `null` if not parseable.
	 *
	 * @param value - The stored value (string or Buffer) to parse.
	 * @returns The parsed data object with `value` and optional `expires`, or `null`.
	 */
	private parseValue(value: any): { value: any; expires?: number | null } | null {
		let data: any;
		if (typeof value === "string") {
			try {
				data = JSON.parse(value);
			} catch {
				return { value };
			}
		} else if (
			Buffer.isBuffer(value) ||
			(value instanceof Uint8Array && !(value instanceof Uint8Array))
		) {
			try {
				data = JSON.parse(value.toString());
			} catch {
				return { value };
			}
		} else if (typeof value === "object" && value !== null) {
			data = value;
		} else {
			return { value };
		}

		if (data && typeof data === "object") {
			return data;
		}

		return { value: data };
	}

	/**
	 * Parses the connection URI to determine the database file path.
	 *
	 * Supported formats:
	 * - `rocksdb://:memory:` — uses a temp directory (tracked for cleanup on `disconnect()`)
	 * - `rocksdb:///absolute/path/to/db` — absolute path on disk
	 * - `rocksdb://./relative/path` — relative to current working directory
	 *
	 * @returns The resolved database file path.
	 * @throws If the URI format is not recognized.
	 */
	private resolveDbPath(): string {
		const uri = this._uri;
		const memoryPattern = /^rocksdb:\/\/:memory:/i;
		if (memoryPattern.test(uri)) {
			this._tempDir = mkdtempSync(join(tmpdir(), "storely-rocksdb-"));
			return this._tempDir;
		}

		// rocksdb:///path → absolute path (strip the double slash)
		const absoluteMatch = uri.match(/^rocksdb:\/\/\/(.+)$/);
		if (absoluteMatch) {
			return `/${absoluteMatch[1]}`;
		}

		// rocksdb://./path → relative path (strip the protocol)
		const relativeMatch = uri.match(/^rocksdb:\/\/(\..+)$/);
		if (relativeMatch) {
			return relativeMatch[1];
		}

		// rocksdb://path → treat as relative path
		const plainMatch = uri.match(/^rocksdb:\/\/(.+)$/);
		if (plainMatch) {
			return plainMatch[1];
		}

		throw new Error(RocksDBErrorMessages.InvalidURI);
	}

	/**
	 * Starts (or restarts) the automatic expired-entry cleanup interval.
	 *
	 * If the interval is `0` or negative, any existing timer is stopped.
	 * The timer is unreffed so it does not prevent the Node.js process from exiting.
	 */
	private startClearExpiredTimer(): void {
		this.stopClearExpiredTimer();
		if (this._clearExpiredInterval > 0) {
			this._clearExpiredTimer = setInterval(async () => {
				try {
					await this.clearExpired();
				} catch (error: any) {
					this.emit("error", error);
				}
			}, this._clearExpiredInterval);
			this._clearExpiredTimer.unref();
		}
	}

	/**
	 * Stops the automatic expired-entry cleanup interval if running
	 * and clears the timer reference.
	 */
	private stopClearExpiredTimer(): void {
		if (this._clearExpiredTimer) {
			clearInterval(this._clearExpiredTimer);
			this._clearExpiredTimer = undefined;
		}
	}

	/**
	 * Applies configuration options from a partial {@link StorelyRocksDBOptions} object.
	 * Only properties that are explicitly defined (not `undefined`) are updated.
	 *
	 * @param options - The options to apply.
	 */
	private setOptions(options: StorelyRocksDBOptions): void {
		if (options.uri !== undefined) {
			this._uri = options.uri;
		}

		if (options.readOnly !== undefined) {
			this._readOnly = options.readOnly;
		}

		if (options.createIfMissing !== undefined) {
			this._createIfMissing = options.createIfMissing;
		}

		if (options.errorIfExists !== undefined) {
			this._errorIfExists = options.errorIfExists;
		}

		if (options.compression !== undefined) {
			this._compression = options.compression;
		}

		if (options.clearExpiredInterval !== undefined) {
			this._clearExpiredInterval = options.clearExpiredInterval;
		}

		if (options.iterationLimit !== undefined) {
			this._iterationLimit = options.iterationLimit;
		}

		if (options.infoLogLevel !== undefined) {
			this._infoLogLevel = options.infoLogLevel;
		}
	}
}

export { createStorelyRocksDB, createStorelyRocksDBNonBlocking } from "./create.js";

export default StorelyRocksDB;
