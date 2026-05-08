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
	const keyv = new Keyv({
		store: store as never,
		serialize: mode === "json" ? JSON.stringify : undefined,
		deserialize: mode === "json" ? JSON.parse : undefined,
	});
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
