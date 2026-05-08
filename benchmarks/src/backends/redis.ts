import KeyvRedis from "@keyv/redis";
import StorelyRedis from "@storely/redis";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const REDIS_URI = process.env.REDIS_URI ?? "redis://localhost:6379";

export const redisBackend: BackendFactory = {
	name: "redis",
	async available() {
		const url = new URL(REDIS_URI);
		return await probeTcp(url.hostname, Number(url.port || 6379));
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({ mode, store: new StorelyRedis(REDIS_URI) }),
			buildKeyvClient({ mode, store: new KeyvRedis(REDIS_URI) }),
			buildCacheManagerClient({ mode, store: new KeyvRedis(REDIS_URI) }),
		];
	},
};
