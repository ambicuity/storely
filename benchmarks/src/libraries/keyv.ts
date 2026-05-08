import Keyv from "keyv";
import type { BenchClient, Mode, Operation } from "../types.js";

export interface KeyvAdapterArgs {
	mode: Mode;
	store?: unknown;
	disconnect?: () => Promise<void>;
}

export function buildKeyvClient(args: KeyvAdapterArgs): BenchClient {
	const { mode, store, disconnect } = args;
	const keyv = new Keyv({
		store: store as never,
		serialize: mode === "json" ? JSON.stringify : undefined,
		deserialize: mode === "json" ? JSON.parse : undefined,
	});

	// Keyv has no native batch set; we emulate via Promise.all of singles.
	const fallbacks: Operation[] = ["setMany"];

	return {
		name: "keyv",
		fallbacks,
		async get(key) {
			return await keyv.get(key);
		},
		async set(key, value) {
			await keyv.set(key, value);
		},
		async delete(key) {
			await keyv.delete(key);
		},
		async has(key) {
			return await keyv.has(key);
		},
		async getMany(keys) {
			// Keyv v5 supports passing an array to .get
			return (await keyv.get(keys)) as Array<unknown>;
		},
		async setMany(entries) {
			await Promise.all(entries.map(([key, value]) => keyv.set(key, value)));
		},
		async deleteMany(keys) {
			await keyv.delete(keys);
		},
		async clear() {
			await keyv.clear();
		},
		async disconnect() {
			await keyv.disconnect();
			if (disconnect) await disconnect();
		},
	};
}
