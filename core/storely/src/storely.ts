import { Hookified } from "hookified";
import { StorelyBridgeAdapter, type StorelyBridgeStore } from "./adapters/bridge.js";
import { type StorelyMapType, StorelyMemoryAdapter } from "./adapters/memory.js";
import { detectStorelyStorage } from "./capabilities.js";
import { StorelyJsonSerializer } from "./json-serializer.js";
import type { StorelySanitizeAdapter } from "./sanitize.js";
import { StorelySanitize } from "./sanitize.js";
import { StorelyStats } from "./stats.js";
import type {
	StorelyCompressionAdapter,
	StorelyEncryptionAdapter,
	StorelySerializationAdapter,
	StorelyStorageAdapter,
	StorelyStorageGetResult,
} from "./types/adapters.js";
import {
	type StorelyEntry,
	StorelyEvents,
	StorelyHooks,
	type StorelyMapAny,
	type StorelyOptions,
	type StorelyTelemetryEvent,
	type StorelyValue,
} from "./types/storely.js";
import {
	buildDeprecatedHooks,
	calculateExpires,
	deleteExpiredKeys,
	deprecatedHookAliases,
	isDataExpired,
	resolveTtl,
	ttlFromExpires,
} from "./utils.js";

// biome-ignore lint/suspicious/noExplicitAny: type format
export class Storely<GenericValue = any> extends Hookified {
	/**
	 * Stats manager for tracking cache operation metrics (hits, misses, sets, deletes, errors).
	 * @default this is disabled.
	 */
	private _stats!: StorelyStats;

	/**
	 * Default time to live in milliseconds. Can be overridden per-key via {@link set}.
	 */
	private _ttl?: number;

	/**
	 * Key prefix namespace used to isolate keys across different Storely instances sharing the same store.
	 */
	private _namespace?: string;

	/**
	 * The underlying storage adapter. Defaults to an in-memory {@link Map}.
	 */
	private _store: StorelyStorageAdapter = new StorelyMemoryAdapter(new Map());

	/**
	 * Pluggable serialization adapter with `stringify` and `parse` methods.
	 * When `undefined`, the built-in {@link StorelyJsonSerializer} is used.
	 */
	private _serialization: StorelySerializationAdapter | undefined;

	/**
	 * Pluggable compression adapter with `compress` and `decompress` methods.
	 */
	private _compression: StorelyCompressionAdapter | undefined;

	/**
	 * Pluggable encryption adapter with `encrypt` and `decrypt` methods.
	 */
	private _encryption: StorelyEncryptionAdapter | undefined;

	/**
	 * Sanitization handler for keys and namespaces. By default it is disabled.
	 */
	private _sanitize!: StorelySanitizeAdapter;

	/**
	 * When true, Storely checks expiry at its layer on get/getMany/has/hasMany.
	 */
	private _checkExpired = false;

	/**
	 * When true, the configured pipeline is the trivial one: in-memory store,
	 * no serialization, compression, encryption, expiry-check, or key sanitization.
	 * Hot-path operations short-circuit through the storage adapter directly.
	 * Recomputed whenever any pipeline component changes.
	 */
	private _fastPath = false;

	/**
	 * Storely Constructor
	 * @param {StorelyStorageAdapter | StorelyOptions | Map<any, any> | any} store  to be provided or just the options
	 * @param {Omit<StorelyOptions, 'store'>} [options] if you provide the store you can then provide the Storely Options
	 */
	constructor(
		store?: StorelyStorageAdapter | StorelyOptions | StorelyMapAny,
		options?: Omit<StorelyOptions, "store">,
	);
	/**
	 * Storely Constructor
	 * @param {StorelyOptions} options to be provided
	 */
	constructor(options?: StorelyOptions);
	/**
	 * Storely Constructor
	 * @param {StorelyStorageAdapter | StorelyOptions} store
	 * @param {Omit<StorelyOptions, 'store'>} [options] if you provide the store you can then provide the Storely Options
	 */
	constructor(
		store?: StorelyStorageAdapter | StorelyOptions,
		options?: Omit<StorelyOptions, "store">,
	) {
		const mergedOptions = Storely.resolveOptions(store, options);

		// `throwOnEmptyListeners: false` so that internal `emit("error", ...)`
		// calls don't crash applications that haven't attached a listener.
		// Errors still propagate via the `throwOnErrors` option (which maps
		// to `throwOnEmitError`); set it to true to surface failures
		// explicitly. Previously this was `true` and undocumented, turning
		// transient adapter errors into uncaught exceptions for users who
		// hadn't read the source.
		super({
			throwOnHookError: false,
			throwOnEmptyListeners: false,
			throwOnEmitError: mergedOptions.throwOnErrors ?? false,
		});

		this.deprecatedHooks = buildDeprecatedHooks();
		this._compression = mergedOptions.compression;
		this._encryption = mergedOptions.encryption;
		this.initSanitize(mergedOptions);
		this.initNamespace(mergedOptions.namespace);

		if (mergedOptions.store) {
			this.setStore(mergedOptions.store);
		}

		// Must run after setStore so we can inspect _store.capabilities.inMemory.
		this.initSerialization(mergedOptions);
		this.initStats(mergedOptions);

		this.setTtl(mergedOptions.ttl);
		this._checkExpired = mergedOptions.checkExpired ?? false;
		this.recomputeFastPath();
	}

	/**
	 * Get the current storage adapter.
	 * @returns {StorelyStorageAdapter} The current storage adapter.
	 */
	public get store(): StorelyStorageAdapter {
		return this._store;
	}

	/**
	 * Set the storage adapter.
	 * @param {StorelyStorageAdapter | Map<any, any> | any} store The storage adapter to set.
	 */
	public set store(store: StorelyStorageAdapter | StorelyMapAny) {
		this.setStore(store);
	}

	/**
	 * Get the current compression adapter.
	 * @returns {StorelyCompressionAdapter | undefined} The current compression adapter.
	 */
	public get compression(): StorelyCompressionAdapter | undefined {
		return this._compression;
	}

	/**
	 * Set the compression adapter.
	 * @param {StorelyCompressionAdapter | undefined} compress The compression adapter to set.
	 */
	public set compression(compress: StorelyCompressionAdapter | undefined) {
		this._compression = compress;
		this.recomputeFastPath();
	}

	/**
	 * Get the current encryption adapter.
	 * @returns {StorelyEncryptionAdapter | undefined} The current encryption adapter.
	 */
	public get encryption(): StorelyEncryptionAdapter | undefined {
		return this._encryption;
	}

	/**
	 * Set the encryption adapter.
	 * @param {StorelyEncryptionAdapter | undefined} encryption The encryption adapter to set.
	 */
	public set encryption(encryption: StorelyEncryptionAdapter | undefined) {
		this._encryption = encryption;
		this.recomputeFastPath();
	}

	/**
	 * Get the current namespace.
	 * @returns {string | undefined} The current namespace.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the current namespace.
	 * @param {string | undefined} namespace The namespace to set.
	 */
	public set namespace(namespace: string | undefined) {
		this._namespace =
			namespace && this._sanitize.enabled ? this._sanitize.cleanNamespace(namespace) : namespace;
		this._store.namespace = this._namespace;
	}

	/**
	 * Get the current TTL.
	 * @returns {number} The current TTL in milliseconds.
	 */
	public get ttl(): number | undefined {
		return this._ttl;
	}

	/**
	 * Set the current TTL.
	 * @param {number} ttl The TTL to set in milliseconds.
	 */
	public set ttl(ttl: number | undefined) {
		this.setTtl(ttl);
	}

	/**
	 * Get the current serialization adapter. If `undefined`, serialization is not enabled.
	 * @returns {StorelySerializationAdapter | undefined} The current serialization adapter.
	 */
	public get serialization(): StorelySerializationAdapter | undefined {
		return this._serialization;
	}

	/**
	 * Set the current serialization adapter. Pass a `StorelySerializationAdapter` to enable
	 * custom serialization, or `undefined` to disable serialization entirely.
	 * @param {StorelySerializationAdapter | undefined} serialization The serialization adapter to set.
	 */
	public set serialization(serialization: StorelySerializationAdapter | false | undefined) {
		this._serialization = serialization === false ? undefined : serialization;
		this.recomputeFastPath();
	}

	/**
	 * Get the current throwOnErrors value. When enabled, all errors with throw. By default, errors
	 * will only throw if there are no listeners to the error event.
	 * @return {boolean} The current throwOnErrors value.
	 */
	public get throwOnErrors(): boolean {
		return this.throwOnEmitError;
	}

	/**
	 * Set the current throwOnErrors value. When enabled, all errors will throw. By default, errors
	 * will only throw if there are no listeners to the error event.
	 * @param {boolean} value The throwOnErrors value to set.
	 */
	public set throwOnErrors(value: boolean) {
		this.throwOnEmitError = value;
	}

	/**
	 * Get the current sanitize adapter. Sanitization is disabled by default. To
	 * enable it `sanitize.keys` or `sanitize.namespace` to true or set StorelySanitizePatterns
	 * to each.
	 * @returns {StorelySanitizeAdapter} The current sanitize adapter.
	 */
	public get sanitize(): StorelySanitizeAdapter {
		return this._sanitize;
	}

	/**
	 * Set the sanitize adapter directly and will run sanitization on namespace.
	 * @param {StorelySanitizeAdapter} value The sanitize adapter to use.
	 */
	public set sanitize(value: StorelySanitizeAdapter) {
		this._sanitize = value;
		/* v8 ignore next -- @preserve */
		this._namespace =
			this._namespace && this._sanitize.enabled
				? this._sanitize.cleanNamespace(this._namespace)
				: this._namespace;
		this.recomputeFastPath();
	}

	/**
	 * Get the stats. This is just for this instance
	 * @returns {StorelyStats} The current stats.
	 */
	public get stats(): StorelyStats {
		return this._stats;
	}

	/**
	 * When true, Storely checks expiry at its layer on get/getMany/has/hasMany.
	 * When false (default), trusts the storage adapter.
	 */
	public get checkExpired(): boolean {
		return this._checkExpired;
	}

	/**
	 * Set the stats. When setting a new instance it will unsubscribe the old listeners
	 * and subscribe the new instance.
	 * @param {StorelyStats} stats The stats instance to set.
	 */
	public set stats(stats: StorelyStats) {
		this._stats.unsubscribe();
		this._stats = stats;
		this._stats.subscribe(this);
	}

	/**
	 * Resolves a store to a fully-compliant StorelyStorageAdapter using a 3-tier detection chain:
	 * 1. If the store already implements the full StorelyStorageAdapter interface, use it directly.
	 * 2. If the store is map-like (synchronous get/set/delete/has), wrap it in StorelyMemoryAdapter.
	 * 3. If the store has async get/set/delete/clear, wrap it in StorelyBridgeAdapter.
	 * 4. Otherwise, emit an error and fall back to a default in-memory StorelyMemoryAdapter.
	 *
	 * NOTE: this is used for internal but provided public for custom adapter testing
	 * @param {unknown} store The store to resolve.
	 * @returns {StorelyStorageAdapter} A fully-compliant storage adapter.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: accepts any store type
	public resolveStore(store: any): StorelyStorageAdapter {
		const cap = detectStorelyStorage(store);

		if (cap.store === "storelyStorage") {
			return store as StorelyStorageAdapter;
		}

		if (cap.store === "mapLike") {
			return new StorelyMemoryAdapter(store as StorelyMapType);
		}

		if (cap.store === "asyncMap") {
			return new StorelyBridgeAdapter(store as StorelyBridgeStore);
		}

		// An unrecognized store shape is a programmer error, not a runtime
		// hazard. Throw directly so the caller's stack trace points at the
		// bad input. (Previously this `emit("error", …)` and fell back to
		// an in-memory store, which only surfaced if the consumer had
		// `throwOnEmptyListeners` semantics in place. With the more
		// forgiving runtime listener policy we now use, an invalid store
		// would otherwise be swallowed silently.)
		throw new Error(
			"Could not use the provided storage adapter — does not implement Storely's storage interface",
		);
	}

	/**
	 * Sets the storage adapter by resolving it via {@link resolveStore}, then wires up
	 * error forwarding and namespace propagation.
	 * @param {StorelyStorageAdapter | Map<any, any> | any} store The storage adapter to set.
	 */
	public setStore(store: StorelyStorageAdapter | StorelyMapAny): void {
		this._store = this.resolveStore(store);
		if (typeof this._store.on === "function") {
			// biome-ignore lint/suspicious/noExplicitAny: type format
			this._store.on(StorelyEvents.ERROR, (error: any) => this.emit(StorelyEvents.ERROR, error));
		}

		this._store.namespace = this._namespace;
		this.recomputeFastPath();
	}

	/**
	 * Sets the TTL, treating zero and negative values as undefined (no TTL).
	 * @param {number | undefined} ttl The TTL to set in milliseconds.
	 */
	public setTtl(ttl?: number): void {
		if (typeof ttl === "number" && ttl <= 0) {
			this._ttl = undefined;
			return;
		}

		this._ttl = ttl;
	}

	/**
	 * Get the Value of a Key.
	 *
	 * **Semantic gap:** `undefined` is returned in two distinct cases that
	 * the API cannot distinguish:
	 * - the key has never been set, or
	 * - the key was set to the literal value `undefined`.
	 *
	 * Use {@link has} when the difference matters (e.g. cache-miss vs
	 * cache-hit-with-empty-value). `has(key)` is unaffected by stored
	 * `undefined` values and reflects key presence directly.
	 *
	 * @param {string | string[]} key passing in a single key or multiple as an array
	 */
	public async get<Value = GenericValue>(key: string): Promise<Value | undefined>;
	public async get<Value = GenericValue>(key: string[]): Promise<Array<Value | undefined>>;
	public async get<Value = GenericValue>(
		key: string | string[],
	): Promise<Value | undefined | Array<Value | undefined>> {
		const isArray = Array.isArray(key);

		if (isArray) {
			return this.getMany<Value>(key as string[]);
		}

		key = this._sanitize.enabled ? this._sanitize.cleanKey(key as string) : (key as string);
		if (key === "") {
			return undefined;
		}

		if (
			this._fastPath &&
			(this.getHooks(StorelyHooks.BEFORE_GET)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.AFTER_GET)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.PRE_GET)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.POST_GET)?.length ?? 0) === 0 &&
			this.listenerCount(StorelyEvents.STAT_HIT) === 0 &&
			this.listenerCount(StorelyEvents.STAT_MISS) === 0
		) {
			try {
				const raw = await this._store.get<StorelyValue<Value>>(key as string);
				if (raw === undefined || raw === null) return undefined;
				return (raw as StorelyValue<Value>).value as Value;
			} catch (error) {
				this.emit(StorelyEvents.ERROR, error);
				return undefined;
			}
		}

		await this.hookWithDeprecated(StorelyHooks.BEFORE_GET, { key });
		let rawData: StorelyStorageGetResult<Value> | undefined;
		try {
			rawData = await this._store.get<Value>(key as string);
		} catch (error) {
			this.emit(StorelyEvents.ERROR, error);
			this.emitTelemetry(StorelyEvents.STAT_ERROR, key as string);
		}

		let data: StorelyValue<Value> | undefined;
		if (this._checkExpired) {
			[data] = await this.decodeWithExpire<Value>(key as string, rawData);
		} else {
			data =
				rawData === undefined || rawData === null
					? undefined
					: typeof rawData === "string"
						? await this.decode<Value>(rawData)
						: (rawData as StorelyValue<Value>);
		}

		if (data === undefined) {
			await this.hookWithDeprecated(StorelyHooks.AFTER_GET, {
				key,
				value: undefined,
			});
			this.emitTelemetry(StorelyEvents.STAT_MISS, key as string);
			return undefined;
		}

		await this.hookWithDeprecated(StorelyHooks.AFTER_GET, {
			key,
			value: data,
		});
		this.emitTelemetry(StorelyEvents.STAT_HIT, key as string);
		return data.value;
	}

	/**
	 * Get many values of keys
	 * @param {string[]} keys passing in a single key or multiple as an array
	 */
	public async getMany<Value = GenericValue>(keys: string[]): Promise<Array<Value | undefined>> {
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;

		await this.hookWithDeprecated(StorelyHooks.BEFORE_GET_MANY, { keys });

		const rawData =
			await // biome-ignore lint/style/noNonNullAssertion: guaranteed by resolveStore
			this._store.getMany!<Value>(keys);

		let deserialized: Array<StorelyValue<Value> | undefined>;
		if (this._checkExpired) {
			deserialized = await this.decodeWithExpire<Value>(keys, rawData as unknown[]);
		} else if (this._serialization === undefined) {
			// Sync fast path: no async decode work; just narrow the rows.
			const rows = rawData as unknown[];
			deserialized = new Array(rows.length);
			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];
				deserialized[i] =
					row === undefined || row === null ? undefined : (row as StorelyValue<Value>);
			}
		} else {
			deserialized = await Promise.all(
				(rawData as unknown[]).map(async (row) => {
					if (row === undefined || row === null) return undefined;
					return typeof row === "string" ? this.decode<Value>(row) : (row as StorelyValue<Value>);
				}),
			);
		}

		const result: Array<Value | undefined> = deserialized.map((row) =>
			row !== undefined ? row.value : undefined,
		);

		await this.hookWithDeprecated(StorelyHooks.AFTER_GET_MANY, result);
		for (let i = 0; i < result.length; i++) {
			if (result[i] === undefined) {
				this.emitTelemetry(StorelyEvents.STAT_MISS, keys[i]);
			} else {
				this.emitTelemetry(StorelyEvents.STAT_HIT, keys[i]);
			}
		}

		return result as Array<Value | undefined>;
	}

	/**
	 * Get the raw value of a key. This is the replacement for setting raw to true in the get() method.
	 * @param {string} key the key to get
	 * @returns {Promise<StorelyStorageGetResult<Value>>} will return a StorelyStorageGetResult<Value> or undefined
	 * if the key does not exist or is expired.
	 */
	public async getRaw<Value = GenericValue>(key: string): Promise<StorelyStorageGetResult<Value>> {
		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return undefined;
		}

		await this.hookWithDeprecated(StorelyHooks.BEFORE_GET_RAW, { key });
		const rawData = await this._store.get(key);

		let data: StorelyValue<Value> | undefined;
		if (this._checkExpired) {
			[data] = await this.decodeWithExpire<Value>(key, rawData);
		} else {
			data =
				rawData === undefined || rawData === null
					? undefined
					: typeof rawData === "string"
						? await this.decode<Value>(rawData)
						: /* v8 ignore next -- @preserve */
							(rawData as StorelyValue<Value>);
		}

		if (data === undefined) {
			await this.hookWithDeprecated(StorelyHooks.AFTER_GET_RAW, {
				key,
				value: undefined,
			});
			this.emitTelemetry(StorelyEvents.STAT_MISS, key);
			return undefined;
		}

		this.emitTelemetry(StorelyEvents.STAT_HIT, key);

		await this.hookWithDeprecated(StorelyHooks.AFTER_GET_RAW, {
			key,
			value: data,
		});

		return data;
	}

	/**
	 * Get the raw values of many keys. This is the replacement for setting raw to true in the getMany() method.
	 * @param {string[]} keys the keys to get
	 * @returns {Promise<Array<StorelyStorageGetResult<Value>>>} will return an array of StorelyStorageGetResult<Value> or undefined if the key does not exist or is expired.
	 */
	public async getManyRaw<Value = GenericValue>(
		keys: string[],
	): Promise<Array<StorelyStorageGetResult<Value>>> {
		/* v8 ignore next -- @preserve */
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;

		await this.hookWithDeprecated(StorelyHooks.BEFORE_GET_MANY_RAW, { keys });

		if (keys.length === 0) {
			const result: Array<StorelyStorageGetResult<Value>> = [];
			await this.hookWithDeprecated(StorelyHooks.AFTER_GET_MANY_RAW, {
				keys,
				values: result,
			});
			return result;
		}

		const rawData =
			await // biome-ignore lint/style/noNonNullAssertion: guaranteed by resolveStore
			this._store.getMany!<Value>(keys);

		let result: Array<StorelyValue<Value> | undefined>;
		if (this._checkExpired) {
			result = await this.decodeWithExpire<Value>(keys, rawData as unknown[]);
		} else {
			result = await Promise.all(
				(rawData as unknown[]).map(async (row) => {
					if (row === undefined || row === null) {
						return undefined;
					}

					return typeof row === "string" ? this.decode<Value>(row) : (row as StorelyValue<Value>);
				}),
			);
		}

		// Add in hits and misses
		for (let i = 0; i < result.length; i++) {
			if (result[i] === undefined) {
				this.emitTelemetry(StorelyEvents.STAT_MISS, keys[i]);
			} else {
				this.emitTelemetry(StorelyEvents.STAT_HIT, keys[i]);
			}
		}

		// Trigger the after get many raw hook
		await this.hookWithDeprecated(StorelyHooks.AFTER_GET_MANY_RAW, {
			keys,
			values: result,
		});
		return result as Array<StorelyStorageGetResult<Value>>;
	}

	/**
	 * Set an item to the store
	 * @param {string | Array<StorelyEntry<Value>>} key the key to use. If you pass in an array of StorelyEntry it will set many items
	 * @param {Value} value the value of the key
	 * @param {number} [ttl] time to live in milliseconds
	 * @returns {boolean} if it sets then it will return a true. On failure will return false.
	 */
	public async set<Value = GenericValue>(
		key: string,
		value: Value,
		ttl?: number,
	): Promise<boolean> {
		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return false;
		}

		if (
			this._fastPath &&
			(this.getHooks(StorelyHooks.BEFORE_SET)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.AFTER_SET)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.PRE_SET)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.POST_SET)?.length ?? 0) === 0 &&
			this.listenerCount(StorelyEvents.STAT_SET) === 0
		) {
			if (typeof value === "symbol") {
				this.emit(StorelyEvents.ERROR, "symbol cannot be serialized");
				return false;
			}
			const resolvedTtl = resolveTtl(ttl, this._ttl);
			const expires = calculateExpires(resolvedTtl);
			try {
				return await this._store.set(key, { value, expires }, resolvedTtl);
			} catch (error) {
				this.emit(StorelyEvents.ERROR, error);
				return false;
			}
		}

		const data = { key, value, ttl };
		await this.hookWithDeprecated(StorelyHooks.BEFORE_SET, data);

		data.ttl = resolveTtl(data.ttl, this._ttl);

		const expires = calculateExpires(data.ttl);

		if (typeof data.value === "symbol") {
			this.emit(StorelyEvents.ERROR, "symbol cannot be serialized");
			this.emitTelemetry(StorelyEvents.STAT_ERROR, key);
			return false;
		}

		const formattedValue = { value: data.value, expires };

		let result = true;
		let encodedValue: unknown = formattedValue;

		try {
			encodedValue = await this.encode(formattedValue);
			result = await this._store.set(data.key, encodedValue, data.ttl);
		} catch (error) {
			result = false;
			this.emit(StorelyEvents.ERROR, error);
			this.emitTelemetry(StorelyEvents.STAT_ERROR, key);
		}

		await this.hookWithDeprecated(StorelyHooks.AFTER_SET, {
			key,
			value: encodedValue,
			ttl,
		});

		if (result) {
			this.emitTelemetry(StorelyEvents.STAT_SET, key);
		}

		return result;
	}

	/**
	 * Set many items to the store
	 * @param {Array<StorelyEntry<Value>>} entries the entries to set
	 * @returns {boolean[]} will return an array of booleans if it sets then it will return a true. On failure will return false.
	 */
	public async setMany<Value = GenericValue>(entries: StorelyEntry<Value>[]): Promise<boolean[]> {
		entries = entries.map((e) => ({
			...e,
			key: this._sanitize.enabled ? this._sanitize.cleanKey(e.key) : e.key,
		}));

		const data = { entries };
		await this.hookWithDeprecated(StorelyHooks.BEFORE_SET_MANY, data);
		entries = data.entries;

		const results: boolean[] = entries.map(() => false);

		// Per-entry encode/serialize so a single bad entry does not collapse
		// the whole batch to all-false (the previous behavior). The store
		// only sees the entries that survived encoding; failed indices stay
		// false in `results`.
		type Encoded = { key: string; value: unknown; ttl?: number };
		const encodedByIndex: Array<Encoded | null> = new Array(entries.length).fill(null);
		const surviving: Array<{ encoded: Encoded; originalIndex: number }> = [];

		const serializeOne = async (entry: StorelyEntry<Value>): Promise<Encoded | null> => {
			const ttl = resolveTtl(entry.ttl, this._ttl);
			const expires = calculateExpires(ttl);

			if (typeof entry.value === "symbol") {
				this.emit(StorelyEvents.ERROR, "symbol cannot be serialized");
				this.emitTelemetry(StorelyEvents.STAT_ERROR, entry.key);
				return null;
			}

			try {
				const value =
					this._serialization === undefined
						? { value: entry.value, expires }
						: await this.encode({ value: entry.value, expires });
				return { key: entry.key, value, ttl };
			} catch (error) {
				this.emit(StorelyEvents.ERROR, error);
				this.emitTelemetry(StorelyEvents.STAT_ERROR, entry.key);
				return null;
			}
		};

		const encoded = await Promise.all(entries.map((entry) => serializeOne(entry)));
		for (let i = 0; i < entries.length; i++) {
			encodedByIndex[i] = encoded[i];
			if (encoded[i] !== null) {
				surviving.push({ encoded: encoded[i] as Encoded, originalIndex: i });
			}
		}

		if (surviving.length > 0) {
			try {
				// biome-ignore lint/style/noNonNullAssertion: guaranteed by resolveStore
				const storeResult = await this._store.setMany!(surviving.map((s) => s.encoded));
				const storeResults = Array.isArray(storeResult)
					? (storeResult as boolean[])
					: surviving.map(() => true);
				const successKeys: string[] = [];
				for (let i = 0; i < surviving.length; i++) {
					const success = storeResults[i] ?? true;
					results[surviving[i].originalIndex] = success;
					if (success) successKeys.push(surviving[i].encoded.key);
				}
				if (successKeys.length > 0) {
					this.emitTelemetry(StorelyEvents.STAT_SET, successKeys);
				}
			} catch (error) {
				this.emit(StorelyEvents.ERROR, error);
				this.emitTelemetry(
					StorelyEvents.STAT_ERROR,
					surviving.map((s) => s.encoded.key),
				);
				// Store-level failure invalidates all surviving entries.
				for (const s of surviving) {
					results[s.originalIndex] = false;
				}
			}
		}

		await this.hookWithDeprecated(StorelyHooks.AFTER_SET_MANY, { entries, values: results });

		return results;
	}

	/**
	 * Set a raw value to the store without wrapping or serialization. This is the write-side counterpart to getRaw().
	 * The value should be a StorelyValue object with { value, expires? }. If you need TTL-based expiration,
	 * set `expires` on the value directly (e.g. `{ value: 'bar', expires: Date.now() + 60000 }`).
	 * The store-level TTL is derived automatically from `value.expires`.
	 * @param {string} key the key to set
	 * @param {StorelyValue<Value>} value the raw value envelope to store
	 * @returns {boolean} if it sets then it will return a true. On failure will return false.
	 */
	public async setRaw<Value = GenericValue>(
		key: string,
		value: StorelyValue<Value>,
	): Promise<boolean> {
		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return false;
		}

		const data = { key, value };
		await this.hookWithDeprecated(StorelyHooks.BEFORE_SET_RAW, data);

		const ttl = ttlFromExpires(data.value.expires);

		let result = true;

		try {
			const encodedValue = await this.encode(data.value);
			const storeResult = await this._store.set(data.key, encodedValue, ttl);

			if (typeof storeResult === "boolean") {
				result = storeResult;
			}
		} catch (error) {
			result = false;
			this.emit(StorelyEvents.ERROR, error);
			this.emitTelemetry(StorelyEvents.STAT_ERROR, key);
		}

		await this.hookWithDeprecated(StorelyHooks.AFTER_SET_RAW, {
			key,
			value: data.value,
			ttl,
		});

		if (result) {
			this.emitTelemetry(StorelyEvents.STAT_SET, key);
		}

		return result;
	}

	/**
	 * Set many raw values to the store without wrapping or serialization. This is the write-side counterpart to getManyRaw().
	 * Each entry's value should be a StorelyValue object with { value, expires? }. If you need TTL-based expiration,
	 * set `expires` on each value directly. The store-level TTL is derived automatically from `value.expires`.
	 * @param {StorelyEntry<StorelyValue<Value>>[]} entries the raw entries to set
	 * @returns {boolean[]} will return an array of booleans if it sets then it will return a true. On failure will return false.
	 */
	public async setManyRaw<Value = GenericValue>(
		entries: StorelyEntry<StorelyValue<Value>>[],
	): Promise<boolean[]> {
		entries = entries.map((e) => ({
			...e,
			/* v8 ignore next -- @preserve */
			key: this._sanitize.enabled ? this._sanitize.cleanKey(e.key) : e.key,
		}));
		let results: boolean[] = [];

		await this.hookWithDeprecated(StorelyHooks.BEFORE_SET_MANY_RAW, { entries });

		try {
			const rawEntries = await Promise.all(
				entries.map(async ({ key, value }) => {
					const ttl = ttlFromExpires(value.expires);
					const encodedValue = await this.encode(value);
					return { key, value: encodedValue, ttl };
				}),
			);
			const storeResult = await this._store.setMany(rawEntries);
			results = Array.isArray(storeResult) ? (storeResult as boolean[]) : entries.map(() => true);
			this.emitTelemetry(
				StorelyEvents.STAT_SET,
				entries.map((e) => e.key),
			);
		} catch (error) {
			this.emit(StorelyEvents.ERROR, error);
			this.emitTelemetry(
				StorelyEvents.STAT_ERROR,
				entries.map((e) => e.key),
			);

			results = entries.map(() => false);
		}

		await this.hookWithDeprecated(StorelyHooks.AFTER_SET_MANY_RAW, {
			entries,
			results,
		});

		return results;
	}

	/**
	 * Delete an Entry
	 * @param {string} key the key to be deleted
	 * @returns {boolean} will return true if item is deleted. false if there is an error
	 */
	public async delete(key: string): Promise<boolean>;
	/**
	 * Delete multiple Entries
	 * @param {string[]} keys the keys to be deleted
	 * @returns {boolean[]} will return array of booleans for each key
	 */
	public async delete(keys: string[]): Promise<boolean[]>;
	public async delete(key: string | string[]): Promise<boolean | boolean[]> {
		if (Array.isArray(key)) {
			return this.deleteMany(key);
		}

		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return false;
		}

		if (
			this._fastPath &&
			(this.getHooks(StorelyHooks.BEFORE_DELETE)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.AFTER_DELETE)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.PRE_DELETE)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.POST_DELETE)?.length ?? 0) === 0 &&
			this.listenerCount(StorelyEvents.STAT_DELETE) === 0
		) {
			try {
				return await this._store.delete(key as string);
			} catch (error) {
				this.emit(StorelyEvents.ERROR, error);
				return false;
			}
		}

		await this.hookWithDeprecated(StorelyHooks.BEFORE_DELETE, { key });

		let result = true;

		try {
			result = await this._store.delete(key);
		} catch (error) {
			result = false;
			this.emit(StorelyEvents.ERROR, error);
			this.emitTelemetry(StorelyEvents.STAT_ERROR, key as string);
		}

		await this.hookWithDeprecated(StorelyHooks.AFTER_DELETE, {
			key,
			value: result,
		});
		this.emitTelemetry(StorelyEvents.STAT_DELETE, key as string);

		return result;
	}

	/**
	 * Delete many items from the store
	 * @param {string[]} keys the keys to be deleted
	 * @returns {boolean[]} array of booleans indicating success for each key
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		/* v8 ignore next -- @preserve */
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;

		await this.hookWithDeprecated(StorelyHooks.BEFORE_DELETE_MANY, { keys });
		// Legacy: keep firing BEFORE_DELETE for backward compat
		await this.hookWithDeprecated(StorelyHooks.BEFORE_DELETE, { key: keys });

		let results: boolean[];

		try {
			results = await this._store.deleteMany(keys);
			this.emitTelemetry(StorelyEvents.STAT_DELETE, keys);
		} catch (error) {
			this.emit(StorelyEvents.ERROR, error);
			this.emitTelemetry(StorelyEvents.STAT_ERROR, keys);
			results = keys.map(() => false);
		}

		await this.hookWithDeprecated(StorelyHooks.AFTER_DELETE_MANY, { keys, values: results });
		// Legacy: keep firing AFTER_DELETE for backward compat
		await this.hookWithDeprecated(StorelyHooks.AFTER_DELETE, {
			key: keys,
			value: results,
		});

		return results;
	}

	/**
	 * Has a key.
	 * @param {string} key the key to check
	 * @returns {boolean} will return true if the key exists
	 */
	public async has(key: string[]): Promise<boolean[]>;
	public async has(key: string): Promise<boolean>;
	public async has(key: string | string[]): Promise<boolean | boolean[]> {
		if (Array.isArray(key)) {
			return this.hasMany(key);
		}

		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return false;
		}

		if (
			this._fastPath &&
			(this.getHooks(StorelyHooks.BEFORE_HAS)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.AFTER_HAS)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.PRE_HAS)?.length ?? 0) === 0 &&
			(this.getHooks(StorelyHooks.POST_HAS)?.length ?? 0) === 0
		) {
			try {
				return await this._store.has(key as string);
			} catch (error) {
				this.emit(StorelyEvents.ERROR, error);
				return false;
			}
		}

		await this.hookWithDeprecated(StorelyHooks.BEFORE_HAS, { key });

		let result = false;
		try {
			if (this._checkExpired) {
				const rawData = await this._store.get(key);
				if (rawData !== undefined && rawData !== null) {
					const [data] = await this.decodeWithExpire(key, rawData);
					result = data !== undefined;
				}
			} else {
				result = await this._store.has(key);
			}
		} catch (error) {
			this.emit(StorelyEvents.ERROR, error);
			this.emitTelemetry(StorelyEvents.STAT_ERROR, key as string);
		}

		await this.hookWithDeprecated(StorelyHooks.AFTER_HAS, { key, value: result });
		return result;
	}

	/**
	 * Check if many keys exist
	 * @param {string[]} keys the keys to check
	 * @returns {boolean[]} will return an array of booleans if the keys exist
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;

		await this.hookWithDeprecated(StorelyHooks.BEFORE_HAS_MANY, { keys });

		let results: boolean[] = [];
		try {
			if (this._checkExpired) {
				const rawData = await this._store.getMany(keys);
				const deserialized = await this.decodeWithExpire(keys, rawData as unknown[]);
				results = deserialized.map((row) => row !== undefined);
			} else {
				results = await this._store.hasMany(keys);
			}
		} catch (error) {
			this.emit(StorelyEvents.ERROR, error);
			this.emitTelemetry(StorelyEvents.STAT_ERROR, keys);
			results = keys.map(() => false);
		}

		await this.hookWithDeprecated(StorelyHooks.AFTER_HAS_MANY, { keys, values: results });
		return results;
	}

	/**
	 * Clear the store
	 * @returns {void}
	 */
	public async clear(): Promise<void> {
		this.emit("clear");

		await this.hook(StorelyHooks.BEFORE_CLEAR, { namespace: this._namespace });

		try {
			await this._store.clear();
		} catch (error) {
			this.emit(StorelyEvents.ERROR, error);
			this.emitTelemetry(StorelyEvents.STAT_ERROR);
		}

		await this.hook(StorelyHooks.AFTER_CLEAR, { namespace: this._namespace });
	}

	/**
	 * Will disconnect the store. This is only available if the store has a disconnect method
	 * @returns {Promise<void>}
	 */
	public async disconnect(): Promise<void> {
		this.emit("disconnect");

		await this.hook(StorelyHooks.BEFORE_DISCONNECT, { namespace: this._namespace });

		try {
			if (this._store.disconnect) {
				await this._store.disconnect();
			}
		} catch (error) {
			this.emit(StorelyEvents.ERROR, error);
		}

		await this.hook(StorelyHooks.AFTER_DISCONNECT, { namespace: this._namespace });
	}

	/**
	 * Iterate over all key-value pairs in the store. Automatically deserializes values,
	 * filters out expired entries, and deletes them from the store.
	 * @returns {AsyncGenerator<Array<string | unknown>, void>} An async generator yielding `[key, value]` pairs.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: iterator yields vary by store
	public async *iterator(): AsyncGenerator<[string, any], void> {
		/* v8 ignore next 3 -- @preserve */
		if (this._store.iterator === undefined) {
			return;
		}

		for await (const [key, raw] of this._store.iterator()) {
			// `raw` may be a serialized string (from a serializer-equipped
			// pipeline) or an already-decoded `{value, expires}` envelope
			// (from in-memory adapters). `decode()` handles both via its
			// internal `typeof === "string"` check; the previous `as string`
			// cast was a type lie that worked by accident.
			const data = await this.decode(raw);

			if (this._checkExpired && data && isDataExpired(data)) {
				await this.delete(key as string);
				continue;
			}

			yield [key as string, data?.value];
		}
	}

	/**
	 * Encodes a value for storage. Pipeline: serialize → compress → encrypt.
	 * If serialization is not configured, returns the data as-is.
	 * @param {StorelyValue<T>} data The value envelope to encode.
	 * @returns {Promise<unknown>} The encoded value, or the original data on failure.
	 */
	public async encode<T>(data: StorelyValue<T>): Promise<unknown> {
		if (!this._serialization) {
			return data;
		}

		let result: string = await this._serialization.stringify(data);

		if (this._compression?.compress) {
			result = await this._compression.compress(result);
		}

		if (this._encryption?.encrypt) {
			result = await this._encryption.encrypt(result);
		}

		return result;
	}

	/**
	 * Decodes a stored value. Pipeline: decrypt → decompress → deserialize (reverse of encode).
	 * If serialization is not configured, returns the data as a StorelyValue or undefined for strings.
	 * @param {unknown} data The raw data from the store.
	 * @returns {Promise<StorelyValue<T> | undefined>} The decoded value envelope, or undefined on failure.
	 */
	public async decode<T>(data: unknown): Promise<StorelyValue<T> | undefined> {
		if (data === undefined || data === null) {
			return undefined;
		}

		if (!this._serialization) {
			return typeof data === "string" ? undefined : (data as StorelyValue<T>);
		}

		try {
			let result: unknown = data;

			if (this._encryption?.decrypt) {
				result = await this._encryption.decrypt(result as string);
			}

			if (this._compression?.decompress) {
				result = await this._compression.decompress(result as string);
			}

			if (typeof result === "string") {
				return await this._serialization.parse<StorelyValue<T>>(result);
			}

			return result as StorelyValue<T>;
		} catch (error) {
			this.emit(StorelyEvents.ERROR, error);
			return undefined;
		}
	}

	/**
	 * Deserializes raw data from the store, checks for expiry, and deletes expired keys.
	 * Accepts a single key/value or arrays. Returns an array of decoded StorelyValue objects
	 * (undefined for missing or expired entries).
	 * @param {string | string[]} keys the key(s) to process
	 * @param {unknown | unknown[]} rawData the raw data from the store
	 * @returns {Promise<Array<StorelyValue<Value> | undefined>>} decoded values with expired entries removed
	 */
	public async decodeWithExpire<Value>(
		keys: string | string[],
		rawData: unknown | unknown[],
	): Promise<Array<StorelyValue<Value> | undefined>> {
		const keyArray = Array.isArray(keys) ? keys : [keys];
		const dataArray = Array.isArray(rawData) ? (rawData as unknown[]) : [rawData];

		const results: Array<StorelyValue<Value> | undefined> = [];

		for (const row of dataArray) {
			if (row === undefined || row === null) {
				results.push(undefined);
				continue;
			}

			const deserialized =
				typeof row === "string"
					? await this.decode<Value>(row as string)
					: (row as StorelyValue<Value>);

			if (deserialized === undefined || deserialized === null) {
				results.push(undefined);
				continue;
			}

			results.push(deserialized);
		}

		await deleteExpiredKeys(keyArray, results, this);

		return results;
	}

	/**
	 * Recomputes whether the fast path is active. Fast path requires: in-memory store,
	 * no serialization, compression, encryption, expiry-check, or key sanitization.
	 */
	private recomputeFastPath(): void {
		this._fastPath =
			this._serialization === undefined &&
			this._compression === undefined &&
			this._encryption === undefined &&
			this._checkExpired === false &&
			(this._sanitize?.enabled ?? false) === false &&
			this._store?.capabilities?.inMemory === true;
	}

	/**
	 * Fires a hook under its new name and also under the deprecated alias (if any),
	 * so that integrations still subscribing to the old PRE_/POST_ names keep working.
	 */
	private async hookWithDeprecated(
		event: string,
		// biome-ignore lint/suspicious/noExplicitAny: hook data varies
		...args: any[]
	): Promise<void> {
		const primaryCount = this.getHooks(event)?.length ?? 0;
		const alias = deprecatedHookAliases.get(event);
		const aliasCount = alias ? (this.getHooks(alias)?.length ?? 0) : 0;
		// Safe to skip hook() entirely when no listeners are registered: hookified's hook() body only
		// calls validateHookName() (no-op when enforceBeforeAfter is false) and then iterates
		// eventHandlers — if the map entry is absent it returns immediately with no side effects.
		// Verified against hookified@2.2.0 dist/node/index.js lines 745-756.
		if (primaryCount === 0 && aliasCount === 0) return;
		if (primaryCount > 0) await this.hook(event, ...args);
		if (aliasCount > 0) await this.hook(alias as string, ...args);
	}

	/**
	 * Emit a telemetry event for cache operations.
	 * @param {StorelyEvents} event the telemetry event type
	 * @param {string | string[]} [key] the cache key or keys (emits one event per key)
	 */
	private emitTelemetry(event: StorelyEvents, key?: string | string[]): void {
		// Skip object allocation when nobody is listening. Stats subscribes to all
		// stat:* events when enabled (see StorelyStats), so listenerCount > 0 in
		// that case and the body still runs.
		if (this.listenerCount(event) === 0) return;

		if (key === undefined) {
			this.emit(event, {
				event: event.replace("stat:", ""),
				namespace: this._namespace,
				timestamp: Date.now(),
			} as StorelyTelemetryEvent);
			return;
		}

		const keys = Array.isArray(key) ? key : [key];
		for (const k of keys) {
			this.emit(event, {
				event: event.replace("stat:", ""),
				key: k,
				namespace: this._namespace,
				timestamp: Date.now(),
			} as StorelyTelemetryEvent);
		}
	}

	/**
	 * Merges the overloaded constructor arguments into a single StorelyOptions object.
	 */
	private static resolveOptions(
		store?: StorelyStorageAdapter | StorelyOptions,
		options?: Omit<StorelyOptions, "store">,
	): StorelyOptions {
		options ??= {};
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		store ??= {} as StorelyOptions;
		const merged: StorelyOptions = { ...options };
		if (store && (store as StorelyStorageAdapter).get) {
			merged.store = store as StorelyStorageAdapter;
		} else {
			Object.assign(merged, store);
		}

		return merged;
	}

	/**
	 * Initializes the serialization adapter from options.
	 */
	private initSerialization(options: StorelyOptions): void {
		if (options.serialization === false) {
			this._serialization = undefined;
			return;
		}
		if (options.serialization !== undefined) {
			this._serialization = options.serialization;
			return;
		}
		// No explicit option: default to JSON for non-memory stores; skip for memory stores.
		// Matches keyv's behavior — keyv's memory store does not serialize.
		if (this._store?.capabilities?.inMemory === true) {
			this._serialization = undefined;
			return;
		}
		this._serialization = new StorelyJsonSerializer();
	}

	/**
	 * Initializes the sanitization handler from options.
	 */
	private initSanitize(options: StorelyOptions): void {
		const sanitize = new StorelySanitize();
		if (options.sanitize) {
			sanitize.updateOptions(options.sanitize);
		}

		this._sanitize = sanitize;
	}

	/**
	 * Initializes the stats manager from options.
	 */
	private initStats(options: StorelyOptions): void {
		this._stats = new StorelyStats({
			emitter: this,
			enabled: options.stats ?? false,
		});
	}

	/**
	 * Initializes the namespace, applying sanitization if enabled.
	 */
	private initNamespace(namespace?: string): void {
		this._namespace = namespace;
		if (this._namespace && this._sanitize.enabled) {
			this._namespace = this._sanitize.cleanNamespace(this._namespace);
		}
	}
}

export default Storely;
