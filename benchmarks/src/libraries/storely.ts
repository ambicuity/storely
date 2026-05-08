import { Storely, jsonSerializer } from "storely";
import type { BenchClient, Mode, Operation } from "../types.js";

export interface StorelyAdapterArgs {
	mode: Mode;
	store?: unknown;
	disconnect?: () => Promise<void>;
}

export function buildStorelyClient(args: StorelyAdapterArgs): BenchClient {
	const { mode, store, disconnect } = args;
	const storely = new Storely({
		store,
		serialization: mode === "json" ? jsonSerializer : undefined,
	});
	const fallbacks: Operation[] = [];
	return {
		name: "storely",
		fallbacks,
		async get(key) {
			return await storely.get(key);
		},
		async set(key, value) {
			await storely.set(key, value);
		},
		async delete(key) {
			await storely.delete(key);
		},
		async has(key) {
			return await storely.has(key);
		},
		async getMany(keys) {
			return await storely.getMany(keys);
		},
		async setMany(entries) {
			await storely.setMany(entries.map(([key, value]) => ({ key, value })));
		},
		async deleteMany(keys) {
			await storely.deleteMany(keys);
		},
		async clear() {
			await storely.clear();
		},
		async disconnect() {
			await storely.disconnect();
			if (disconnect) await disconnect();
		},
	};
}
