import KeyvMemcache from "@keyv/memcache";
import StorelyMemcache from "@storely/memcache";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const MEMCACHE_URI = process.env.MEMCACHE_URI ?? "localhost:11211";

export const memcacheBackend: BackendFactory = {
	name: "memcache",
	async available() {
		return await probeTcp("localhost", 11211);
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({ mode, store: new StorelyMemcache(MEMCACHE_URI) }),
			buildKeyvClient({ mode, store: new KeyvMemcache(MEMCACHE_URI) }),
			buildCacheManagerClient({ mode, store: new KeyvMemcache(MEMCACHE_URI) }),
		];
	},
};
