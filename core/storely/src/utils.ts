import { StorelyHooks, type StorelyValue } from "./types/storely.js";

/**
 * Check whether a deserialized entry has expired based on its `expires` timestamp.
 */
export function isDataExpired<Value>(data: StorelyValue<Value>): boolean {
	return typeof data.expires === "number" && Date.now() > data.expires;
}

/**
 * Calculate an absolute expiry timestamp from a TTL value.
 * Returns `undefined` when `ttl` is absent, zero, negative, or non-finite
 * (meaning "no expiry").
 *
 * @param ttl - Time-to-live in milliseconds, or `undefined`
 * @returns Absolute expiry timestamp (ms since epoch), or `undefined`
 */
export function calculateExpires(ttl: number | undefined): number | undefined {
	if (typeof ttl !== "number" || ttl <= 0 || !Number.isFinite(ttl)) {
		return undefined;
	}

	return Date.now() + ttl;
}

/**
 * Resolve a TTL value by falling back to a default when none is given,
 * then normalising zero, negative, or non-finite values to `undefined` (meaning "no expiry").
 *
 * @param ttl - Explicit TTL in milliseconds, or `undefined`
 * @param defaultTtl - Fallback TTL (typically `Storely._ttl`), or `undefined`
 * @returns The resolved TTL in milliseconds, or `undefined` for no expiry
 */
export function resolveTtl(
	ttl: number | undefined,
	defaultTtl: number | undefined,
): number | undefined {
	const resolved = ttl ?? defaultTtl;
	if (resolved === undefined || resolved <= 0 || !Number.isFinite(resolved)) {
		return undefined;
	}

	return resolved;
}

/**
 * Derive a store-level TTL from an absolute `expires` timestamp.
 * Returns `undefined` when `expires` is absent, non-finite, or when the derived
 * TTL is zero or negative (i.e. the entry has already expired).
 *
 * @param expires - Absolute expiry timestamp in milliseconds since epoch, or `undefined`
 * @returns The remaining TTL in milliseconds, or `undefined`
 */
export function ttlFromExpires(expires: number | undefined): number | undefined {
	if (typeof expires !== "number" || !Number.isFinite(expires)) {
		return undefined;
	}

	const remaining = expires - Date.now();
	return remaining > 0 ? remaining : undefined;
}

/**
 * Scan parallel `keys` and `data` arrays, nullify any expired entries in
 * `data`, and batch-delete the corresponding keys via `storely.deleteMany()`.
 */
export async function deleteExpiredKeys<Value>(
	keys: string[],
	data: Array<StorelyValue<Value> | undefined | null>,
	storely: { deleteMany(keys: string[]): Promise<boolean[]> },
): Promise<void> {
	const expiredKeys: string[] = [];
	for (const [index, row] of data.entries()) {
		if (row !== undefined && row !== null && isDataExpired(row)) {
			expiredKeys.push(keys[index]);
			data[index] = undefined;
		}
	}

	if (expiredKeys.length > 0) {
		await storely.deleteMany(expiredKeys);
	}
}

/**
 * Maps new hook names to their deprecated equivalents so both fire during migration.
 */
export const deprecatedHookAliases = new Map<string, string>([
	[StorelyHooks.BEFORE_SET, StorelyHooks.PRE_SET],
	[StorelyHooks.AFTER_SET, StorelyHooks.POST_SET],
	[StorelyHooks.BEFORE_GET, StorelyHooks.PRE_GET],
	[StorelyHooks.AFTER_GET, StorelyHooks.POST_GET],
	[StorelyHooks.BEFORE_GET_MANY, StorelyHooks.PRE_GET_MANY],
	[StorelyHooks.AFTER_GET_MANY, StorelyHooks.POST_GET_MANY],
	[StorelyHooks.BEFORE_GET_RAW, StorelyHooks.PRE_GET_RAW],
	[StorelyHooks.AFTER_GET_RAW, StorelyHooks.POST_GET_RAW],
	[StorelyHooks.BEFORE_GET_MANY_RAW, StorelyHooks.PRE_GET_MANY_RAW],
	[StorelyHooks.AFTER_GET_MANY_RAW, StorelyHooks.POST_GET_MANY_RAW],
	[StorelyHooks.BEFORE_SET_RAW, StorelyHooks.PRE_SET_RAW],
	[StorelyHooks.AFTER_SET_RAW, StorelyHooks.POST_SET_RAW],
	[StorelyHooks.BEFORE_SET_MANY, StorelyHooks.PRE_SET_MANY],
	[StorelyHooks.AFTER_SET_MANY, StorelyHooks.POST_SET_MANY],
	[StorelyHooks.BEFORE_SET_MANY_RAW, StorelyHooks.PRE_SET_MANY_RAW],
	[StorelyHooks.AFTER_SET_MANY_RAW, StorelyHooks.POST_SET_MANY_RAW],
	[StorelyHooks.BEFORE_DELETE, StorelyHooks.PRE_DELETE],
	[StorelyHooks.AFTER_DELETE, StorelyHooks.POST_DELETE],
	[StorelyHooks.BEFORE_DELETE_MANY, StorelyHooks.PRE_DELETE_MANY],
	[StorelyHooks.AFTER_DELETE_MANY, StorelyHooks.POST_DELETE_MANY],
	[StorelyHooks.BEFORE_HAS, StorelyHooks.PRE_HAS],
	[StorelyHooks.AFTER_HAS, StorelyHooks.POST_HAS],
]);

/**
 * Build the deprecated-hooks map used by Hookified to warn when old PRE_/POST_ hook names are registered.
 */
export function buildDeprecatedHooks(): Map<string, string> {
	return new Map([
		["preSet", "Use StorelyHooks.BEFORE_SET ('before:set') instead"],
		["postSet", "Use StorelyHooks.AFTER_SET ('after:set') instead"],
		["preGet", "Use StorelyHooks.BEFORE_GET ('before:get') instead"],
		["postGet", "Use StorelyHooks.AFTER_GET ('after:get') instead"],
		["preGetMany", "Use StorelyHooks.BEFORE_GET_MANY ('before:getMany') instead"],
		["postGetMany", "Use StorelyHooks.AFTER_GET_MANY ('after:getMany') instead"],
		["preGetRaw", "Use StorelyHooks.BEFORE_GET_RAW ('before:getRaw') instead"],
		["postGetRaw", "Use StorelyHooks.AFTER_GET_RAW ('after:getRaw') instead"],
		["preGetManyRaw", "Use StorelyHooks.BEFORE_GET_MANY_RAW ('before:getManyRaw') instead"],
		["postGetManyRaw", "Use StorelyHooks.AFTER_GET_MANY_RAW ('after:getManyRaw') instead"],
		["preSetRaw", "Use StorelyHooks.BEFORE_SET_RAW ('before:setRaw') instead"],
		["postSetRaw", "Use StorelyHooks.AFTER_SET_RAW ('after:setRaw') instead"],
		["preSetMany", "Use StorelyHooks.BEFORE_SET_MANY ('before:setMany') instead"],
		["postSetMany", "Use StorelyHooks.AFTER_SET_MANY ('after:setMany') instead"],
		["preSetManyRaw", "Use StorelyHooks.BEFORE_SET_MANY_RAW ('before:setManyRaw') instead"],
		["postSetManyRaw", "Use StorelyHooks.AFTER_SET_MANY_RAW ('after:setManyRaw') instead"],
		["preDelete", "Use StorelyHooks.BEFORE_DELETE ('before:delete') instead"],
		["postDelete", "Use StorelyHooks.AFTER_DELETE ('after:delete') instead"],
		["preDeleteMany", "Use StorelyHooks.BEFORE_DELETE_MANY ('before:deleteMany') instead"],
		["postDeleteMany", "Use StorelyHooks.AFTER_DELETE_MANY ('after:deleteMany') instead"],
		["preHas", "Use StorelyHooks.BEFORE_HAS ('before:has') instead"],
		["postHas", "Use StorelyHooks.AFTER_HAS ('after:has') instead"],
	]);
}
