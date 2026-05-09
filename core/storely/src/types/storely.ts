import type { StorelySanitizeOptions } from "../sanitize.js";
import type {
	StorelyCompressionAdapter,
	StorelyEncryptionAdapter,
	StorelySerializationAdapter,
	StorelyStorageAdapter,
} from "./adapters.js";

/**
 * A Map or Map-like object. Used as a flexible input type for stores.
 *
 * The runtime path performs duck-typing on this via `resolveStore`, so we
 * only require the structural shape `Map` exposes. Earlier revisions
 * unioned this with `any`, which collapsed the entire type back to `any`
 * and defeated the type system.
 */
// biome-ignore lint/suspicious/noExplicitAny: Map's value type is genuinely arbitrary here
export type StorelyMapAny = Map<unknown, any>;

/**
 * The envelope structure used to store values in Storely.
 * Wraps the actual value with an optional expiration timestamp.
 */
export type StorelyValue<Value> = {
	/** The stored value. */
	value?: Value;
	/** Absolute expiration timestamp in milliseconds since epoch, or `undefined` for no expiry. */
	expires?: number | undefined;
};

/** @deprecated Use `StorelyValue` instead. */
export type DeserializedData<Value> = StorelyValue<Value>;

/**
 * Events emitted by Storely for error handling and telemetry.
 */
export enum StorelyEvents {
	/** Emitted when an error occurs in a store operation. */
	ERROR = "error",
	/** Emitted for informational messages. */
	INFO = "info",
	/** Emitted for warning messages. */
	WARN = "warn",
	/** Telemetry: cache hit. */
	STAT_HIT = "stat:hit",
	/** Telemetry: cache miss. */
	STAT_MISS = "stat:miss",
	/** Telemetry: value set. */
	STAT_SET = "stat:set",
	/** Telemetry: value deleted. */
	STAT_DELETE = "stat:delete",
	/** Telemetry: operation error. */
	STAT_ERROR = "stat:error",
}

export type { StorelyStatsOptions, StorelyTelemetryEvent } from "../stats.js";

/**
 * Hook names for intercepting Storely operations.
 * Register hooks via `storely.on(StorelyHooks.BEFORE_SET, callback)` to run logic before/after operations.
 */
export enum StorelyHooks {
	/** @deprecated Use BEFORE_SET instead */
	PRE_SET = "preSet",
	/** @deprecated Use AFTER_SET instead */
	POST_SET = "postSet",
	/** @deprecated Use BEFORE_GET instead */
	PRE_GET = "preGet",
	/** @deprecated Use AFTER_GET instead */
	POST_GET = "postGet",
	/** @deprecated Use BEFORE_GET_MANY instead */
	PRE_GET_MANY = "preGetMany",
	/** @deprecated Use AFTER_GET_MANY instead */
	POST_GET_MANY = "postGetMany",
	/** @deprecated Use BEFORE_GET_RAW instead */
	PRE_GET_RAW = "preGetRaw",
	/** @deprecated Use AFTER_GET_RAW instead */
	POST_GET_RAW = "postGetRaw",
	/** @deprecated Use BEFORE_GET_MANY_RAW instead */
	PRE_GET_MANY_RAW = "preGetManyRaw",
	/** @deprecated Use AFTER_GET_MANY_RAW instead */
	POST_GET_MANY_RAW = "postGetManyRaw",
	/** @deprecated Use BEFORE_SET_RAW instead */
	PRE_SET_RAW = "preSetRaw",
	/** @deprecated Use AFTER_SET_RAW instead */
	POST_SET_RAW = "postSetRaw",
	/** @deprecated Use BEFORE_SET_MANY_RAW instead */
	PRE_SET_MANY_RAW = "preSetManyRaw",
	/** @deprecated Use AFTER_SET_MANY_RAW instead */
	POST_SET_MANY_RAW = "postSetManyRaw",
	/** @deprecated Use BEFORE_SET_MANY instead */
	PRE_SET_MANY = "preSetMany",
	/** @deprecated Use AFTER_SET_MANY instead */
	POST_SET_MANY = "postSetMany",
	/** @deprecated Use BEFORE_DELETE instead */
	PRE_DELETE = "preDelete",
	/** @deprecated Use AFTER_DELETE instead */
	POST_DELETE = "postDelete",
	/** @deprecated Use BEFORE_DELETE_MANY instead */
	PRE_DELETE_MANY = "preDeleteMany",
	/** @deprecated Use AFTER_DELETE_MANY instead */
	POST_DELETE_MANY = "postDeleteMany",
	/** @deprecated Use BEFORE_HAS instead */
	PRE_HAS = "preHas",
	/** @deprecated Use AFTER_HAS instead */
	POST_HAS = "postHas",

	BEFORE_SET = "before:set",
	AFTER_SET = "after:set",
	BEFORE_GET = "before:get",
	AFTER_GET = "after:get",
	BEFORE_GET_MANY = "before:getMany",
	AFTER_GET_MANY = "after:getMany",
	BEFORE_GET_RAW = "before:getRaw",
	AFTER_GET_RAW = "after:getRaw",
	BEFORE_GET_MANY_RAW = "before:getManyRaw",
	AFTER_GET_MANY_RAW = "after:getManyRaw",
	BEFORE_SET_RAW = "before:setRaw",
	AFTER_SET_RAW = "after:setRaw",
	BEFORE_SET_MANY = "before:setMany",
	AFTER_SET_MANY = "after:setMany",
	BEFORE_SET_MANY_RAW = "before:setManyRaw",
	AFTER_SET_MANY_RAW = "after:setManyRaw",
	BEFORE_DELETE = "before:delete",
	AFTER_DELETE = "after:delete",
	BEFORE_DELETE_MANY = "before:deleteMany",
	AFTER_DELETE_MANY = "after:deleteMany",
	BEFORE_HAS = "before:has",
	AFTER_HAS = "after:has",
	BEFORE_HAS_MANY = "before:hasMany",
	AFTER_HAS_MANY = "after:hasMany",
	BEFORE_CLEAR = "before:clear",
	AFTER_CLEAR = "after:clear",
	BEFORE_DISCONNECT = "before:disconnect",
	AFTER_DISCONNECT = "after:disconnect",
}

/**
 * Represents a key-value entry with an optional TTL, used for batch operations like `setMany`.
 */
// biome-ignore lint/suspicious/noExplicitAny: type format
export type StorelyEntry<Value = any> = {
	/**
	 * Key to set.
	 */
	key: string;
	/**
	 * Value to set.
	 */
	value: Value;
	/**
	 * Time to live in milliseconds.
	 */
	ttl?: number;
};

/**
 * Configuration options for the Storely constructor.
 */
export type StorelyOptions = {
	/**
	 * Namespace for the current instance.
	 * @default undefined
	 */
	namespace?: string;
	/**
	 * A custom serialization adapter with stringify and parse methods.
	 * @default StorelyJsonSerializer (built-in)
	 */
	serialization?: StorelySerializationAdapter | false;
	/**
	 * The storage adapter instance to be used by Storely.
	 * @default new Map() - in-memory store
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	store?: StorelyStorageAdapter | Map<any, any> | any;
	/**
	 * Default TTL in milliseconds. Can be overridden by specifying a TTL on `.set()`.
	 * @default undefined
	 */
	ttl?: number;
	/**
	 * Enable compression option
	 * @default undefined
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	compression?: StorelyCompressionAdapter | any;
	/**
	 * Enable or disable statistics (default is false)
	 * @default false
	 */
	stats?: boolean;
	/**
	 * Will throw on all errors if this is enabled to true. By default, errors
	 * will only throw if there are no listeners to the error event.
	 * This maps to hookified's `throwOnEmitError` under the hood.
	 * @default false
	 */
	throwOnErrors?: boolean;
	/**
	 * Enable sanitization of keys and namespaces by detecting dangerous patterns
	 * for SQL, MongoDB, or filesystem-based storage backends. Pass a `StorelySanitizeOptions`
	 * object for granular control over targets and patterns.
	 * @default undefined
	 */
	sanitize?: StorelySanitizeOptions;
	/**
	 * Enable encryption of stored values. Pass a `StorelyEncryptionAdapter` with
	 * `encrypt` and `decrypt` methods.
	 * @default undefined
	 */
	encryption?: StorelyEncryptionAdapter;
	/**
	 * When true, Storely checks expiry on get/getMany/has/hasMany at its layer.
	 * When false (default), trusts the storage adapter to handle expiry.
	 * @default false
	 */
	checkExpired?: boolean;
};
