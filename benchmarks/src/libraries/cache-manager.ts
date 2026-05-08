import { createCache } from "cache-manager";
import Keyv from "keyv";
import type { BenchClient, Mode, Operation } from "../types.js";

export interface CacheManagerAdapterArgs {
	mode: Mode;
	store?: unknown;
	disconnect?: () => Promise<void>;
}

export function buildCacheManagerClient(args: CacheManagerAdapterArgs): BenchClient {
	const { mode, store, disconnect } = args;
	// In "json" mode, override with bare JSON.stringify/parse to make the encode
	// pipeline directly comparable. In "defaults" mode, do NOT pass `serialize`/
	// `deserialize` — passing `undefined` disables keyv's built-in `@keyv/serialize`
	// (`serializeData` becomes a no-op), so the redis adapter receives a raw object,
	// node-redis throws, and the catch path swallows it. cache-manager wraps keyv,
	// so the same bug applied here. See benchmarks/src/libraries/keyv.ts for context.
	const keyv =
		mode === "json"
			? new Keyv({
					store: store as never,
					serialize: JSON.stringify,
					deserialize: JSON.parse,
				})
			: new Keyv({ store: store as never });
	const cache = createCache({ stores: [keyv] });

	// cache-manager has no native has(); we emulate via get() !== null.
	// It also has no native delete-many or has-many on every release; we use mdel where present.
	const fallbacks: Operation[] = ["has"];

	return {
		name: "cache-manager",
		fallbacks,
		async get(key) {
			return await cache.get(key);
		},
		async set(key, value) {
			await cache.set(key, value);
		},
		async delete(key) {
			await cache.del(key);
		},
		async has(key) {
			const v = await cache.get(key);
			return v !== null && v !== undefined;
		},
		async getMany(keys) {
			return (await cache.mget(keys)) as Array<unknown>;
		},
		async setMany(entries) {
			await cache.mset(entries.map(([key, value]) => ({ key, value })));
		},
		async deleteMany(keys) {
			await cache.mdel(keys);
		},
		async clear() {
			await cache.clear();
		},
		async disconnect() {
			await keyv.disconnect();
			if (disconnect) await disconnect();
		},
	};
}
