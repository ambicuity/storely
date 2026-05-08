export type MethodType = "sync" | "async" | "none";

export type StorelyStorageMethod = {
	exists: boolean;
	methodType: MethodType;
};

// --- Storely (full interface) ---

const storelyMethodNames = [
	"get",
	"set",
	"delete",
	"clear",
	"has",
	"getMany",
	"setMany",
	"deleteMany",
	"hasMany",
	"disconnect",
	"getRaw",
	"getManyRaw",
	"setRaw",
	"setManyRaw",
	"iterator",
] as const;

const storelyPropertyNames = ["hooks", "stats"] as const;

export type StorelyMethods = Record<(typeof storelyMethodNames)[number], StorelyStorageMethod>;

export type StorelyProperties = Record<(typeof storelyPropertyNames)[number], boolean>;

export type StorelyCapability = {
	compatible: boolean;
	methods: StorelyMethods;
	properties: StorelyProperties;
};

// --- Storage adapter ---

const storelyStorageMethodNames = [
	"get",
	"getMany",
	"has",
	"hasMany",
	"set",
	"setMany",
	"delete",
	"deleteMany",
	"clear",
	"disconnect",
	"iterator",
] as const;

export type StorelyStorageMethods = Record<
	(typeof storelyStorageMethodNames)[number],
	StorelyStorageMethod
>;

export type StorelyStorageCapability = {
	compatible: boolean;
	store: "mapLike" | "storelyStorage" | "asyncMap" | "none";
	methods: StorelyStorageMethods;
};

// --- Compression adapter ---

const storelyCompressionMethodNames = ["compress", "decompress"] as const;

export type StorelyCompressionMethods = Record<
	(typeof storelyCompressionMethodNames)[number],
	StorelyStorageMethod
>;

export type StorelyCompressionCapability = {
	compatible: boolean;
	methods: StorelyCompressionMethods;
};

// --- Serialization adapter ---

const storelySerializationMethodNames = ["stringify", "parse"] as const;

export type StorelySerializationMethods = Record<
	(typeof storelySerializationMethodNames)[number],
	StorelyStorageMethod
>;

export type StorelySerializationCapability = {
	compatible: boolean;
	methods: StorelySerializationMethods;
};

// --- Encryption adapter ---

const storelyEncryptionMethodNames = ["encrypt", "decrypt"] as const;

export type StorelyEncryptionMethods = Record<
	(typeof storelyEncryptionMethodNames)[number],
	StorelyStorageMethod
>;

export type StorelyEncryptionCapability = {
	compatible: boolean;
	methods: StorelyEncryptionMethods;
};

// --- Helpers ---

function isMethod(obj: object, name: string): boolean {
	return name in obj && typeof (obj as Record<string, unknown>)[name] === "function";
}

function isProperty(obj: object, name: string): boolean {
	return name in obj;
}

function resolveMethodType(obj: object, name: string): MethodType {
	if (!(name in obj)) {
		return "none";
	}

	const value = (obj as Record<string, unknown>)[name];
	if (typeof value !== "function") {
		return "none";
	}

	return value.constructor.name === "AsyncFunction" ? "async" : "sync";
}

function resolveMethod(obj: object, name: string): StorelyStorageMethod {
	return {
		exists: isMethod(obj, name),
		methodType: resolveMethodType(obj, name),
	};
}

const noneMethod: StorelyStorageMethod = { exists: false, methodType: "none" };

function buildMethods<T extends Record<string, StorelyStorageMethod>>(
	obj: object | null,
	names: readonly (keyof T & string)[],
): T {
	const methods = {} as Record<string, StorelyStorageMethod>;
	for (const name of names) {
		methods[name] = obj ? resolveMethod(obj, name) : { ...noneMethod };
	}

	return methods as T;
}

// --- Detect functions ---

/**
 * Detect whether an object implements the full Storely interface
 * @param obj - The object to check
 * @returns A {@link StorelyCapability} where `compatible` is `true` only when all required capabilities are present
 * @example
 * ```typescript
 * import Storely, { detectStorely } from 'storely';
 *
 * const result = detectStorely(new Storely());
 * result.compatible;              // true — all capabilities present
 * result.methods.get.exists;      // true
 * result.methods.get.methodType;  // "async"
 *
 * const partial = detectStorely(new Map());
 * partial.compatible;             // false — missing getMany, setMany, hooks, stats, etc.
 * partial.methods.get.exists;     // true
 * ```
 */
export function detectStorely(obj: unknown): StorelyCapability {
	if (obj === null || obj === undefined || typeof obj !== "object") {
		const methods = buildMethods<StorelyMethods>(null, storelyMethodNames);
		const properties: StorelyProperties = { hooks: false, stats: false };
		return { compatible: false, methods, properties };
	}

	const methods = buildMethods<StorelyMethods>(obj, storelyMethodNames);
	const properties: StorelyProperties = {
		hooks: isProperty(obj, "hooks"),
		stats: isProperty(obj, "stats"),
	};

	const allRequired = [...storelyMethodNames, ...storelyPropertyNames] as const;
	const compatible = allRequired.every((k) => {
		if (k === "hooks" || k === "stats") {
			return properties[k];
		}

		return methods[k as keyof StorelyMethods].exists;
	});

	return { compatible, methods, properties };
}

/**
 * Detect whether an object implements the Storely storage adapter interface
 * @param obj - The object to check
 * @returns A {@link StorelyStorageCapability} where:
 * - `compatible` is `true` when the object is a valid storage adapter (`"storelyStorage"`, `"mapLike"`, or `"asyncMap"`)
 * - `store` indicates the detected store type: `"storelyStorage"`, `"mapLike"`, `"asyncMap"`, or `"none"`
 * - `methods` maps each method name to `{ exists, methodType }`
 * @example
 * ```typescript
 * import { detectStorelyStorage } from 'storely';
 *
 * const map = detectStorelyStorage(new Map());
 * map.compatible;               // true
 * map.store;                    // "mapLike"
 * map.methods.get.exists;       // true
 * map.methods.get.methodType;   // "sync"
 *
 * const adapter = detectStorelyStorage(asyncAdapter);
 * adapter.compatible;               // true
 * adapter.store;                    // "storelyStorage"
 * adapter.methods.get.methodType;   // "async"
 * ```
 */
export function detectStorelyStorage(obj: unknown): StorelyStorageCapability {
	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			store: "none",
			methods: buildMethods<StorelyStorageMethods>(null, storelyStorageMethodNames),
		};
	}

	const methods = buildMethods<StorelyStorageMethods>(obj, storelyStorageMethodNames);

	// storelyStorage: all required methods present and async
	const requiredKeys: Array<keyof StorelyStorageMethods> = [
		"get",
		"has",
		"hasMany",
		"set",
		"setMany",
		"delete",
		"deleteMany",
		"clear",
	];
	const isStorelyStorage = requiredKeys.every(
		(k) => methods[k].exists && methods[k].methodType === "async",
	);

	if (isStorelyStorage) {
		return { compatible: true, store: "storelyStorage", methods };
	}

	// mapLike: get, set, delete, has all synchronous
	const mapLikeMethods: Array<keyof StorelyStorageMethods> = ["get", "set", "delete", "has"];
	const isMapLike = mapLikeMethods.every(
		(m) => methods[m].exists && methods[m].methodType === "sync",
	);

	if (isMapLike) {
		return { compatible: true, store: "mapLike", methods };
	}

	// asyncMap: get, set, delete, clear all present (not all sync — that would be mapLike)
	const asyncMapMethods: Array<keyof StorelyStorageMethods> = ["get", "set", "delete", "clear"];
	const isAsyncMap = asyncMapMethods.every((m) => methods[m].exists);

	if (isAsyncMap) {
		return { compatible: true, store: "asyncMap", methods };
	}

	return { compatible: false, store: "none", methods };
}

/**
 * Detect whether an object implements the Storely compression adapter interface
 * @param obj - The object to check
 * @returns A {@link StorelyCompressionCapability} where `compatible` is `true` when both `compress` and `decompress` methods are present
 * @example
 * ```typescript
 * import { detectStorelyCompression } from 'storely';
 *
 * detectStorelyCompression({ compress: (d) => d, decompress: (d) => d });
 * // { compatible: true, methods: { compress: { exists: true, methodType: "sync" }, decompress: { exists: true, methodType: "sync" } } }
 * ```
 */
export function detectStorelyCompression(obj: unknown): StorelyCompressionCapability {
	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			methods: buildMethods<StorelyCompressionMethods>(null, storelyCompressionMethodNames),
		};
	}

	const methods = buildMethods<StorelyCompressionMethods>(obj, storelyCompressionMethodNames);
	const compatible = storelyCompressionMethodNames.every((k) => methods[k].exists);
	return { compatible, methods };
}

/**
 * Detect whether an object implements the Storely serialization adapter interface
 * @param obj - The object to check
 * @returns A {@link StorelySerializationCapability} where `compatible` is `true` when both `stringify` and `parse` methods are present
 * @example
 * ```typescript
 * import { detectStorelySerialization } from 'storely';
 *
 * detectStorelySerialization(JSON);
 * // { compatible: true, methods: { stringify: { exists: true, methodType: "sync" }, parse: { exists: true, methodType: "sync" } } }
 * ```
 */
export function detectStorelySerialization(obj: unknown): StorelySerializationCapability {
	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			methods: buildMethods<StorelySerializationMethods>(null, storelySerializationMethodNames),
		};
	}

	const methods = buildMethods<StorelySerializationMethods>(obj, storelySerializationMethodNames);
	const compatible = storelySerializationMethodNames.every((k) => methods[k].exists);
	return { compatible, methods };
}

/**
 * Detect whether an object implements the Storely encryption adapter interface
 * @param obj - The object to check
 * @returns A {@link StorelyEncryptionCapability} where `compatible` is `true` when both `encrypt` and `decrypt` methods are present
 * @example
 * ```typescript
 * import { detectStorelyEncryption } from 'storely';
 *
 * detectStorelyEncryption({ encrypt: (d) => d, decrypt: (d) => d });
 * // { compatible: true, methods: { encrypt: { exists: true, methodType: "sync" }, decrypt: { exists: true, methodType: "sync" } } }
 * ```
 */
export function detectStorelyEncryption(obj: unknown): StorelyEncryptionCapability {
	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			methods: buildMethods<StorelyEncryptionMethods>(null, storelyEncryptionMethodNames),
		};
	}

	const methods = buildMethods<StorelyEncryptionMethods>(obj, storelyEncryptionMethodNames);
	const compatible = storelyEncryptionMethodNames.every((k) => methods[k].exists);
	return { compatible, methods };
}
