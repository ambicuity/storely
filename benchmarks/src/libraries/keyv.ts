import Keyv from "keyv";
import type { BenchClient, Mode, Operation } from "../types.js";

export interface KeyvAdapterArgs {
	mode: Mode;
	store?: unknown;
	disconnect?: () => Promise<void>;
}

export function buildKeyvClient(args: KeyvAdapterArgs): BenchClient {
	const { mode, store, disconnect } = args;
	// In "json" mode, override with bare JSON.stringify/parse to make the encode
	// pipeline directly comparable across libraries. In "defaults" mode, do NOT
	// pass `serialize`/`deserialize` — letting `undefined` through disables keyv's
	// built-in `@keyv/serialize` (`serializeData` becomes a no-op), so `keyv.set`
	// hands the raw `{value, expires}` object to the redis adapter, which throws
	// inside node-redis (`arguments[2]` must be string|Buffer) and silently
	// no-ops via the catch path. Earlier baselines were measuring thrown errors,
	// not real SETs, which produced a misleading 17-50× "gap" vs. storely.
	const keyv =
		mode === "json"
			? new Keyv({
					store: store as never,
					serialize: JSON.stringify,
					deserialize: JSON.parse,
				})
			: new Keyv({ store: store as never });

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
