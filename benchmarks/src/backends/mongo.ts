import KeyvMongo from "@keyv/mongo";
import StorelyMongo from "@storely/mongo";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017";
const MONGO_DB = process.env.MONGO_DB ?? "storely_bench";

export const mongoBackend: BackendFactory = {
	name: "mongo",
	async available() {
		const url = new URL(MONGO_URI);
		return await probeTcp(url.hostname, Number(url.port || 27017));
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({
				mode,
				store: new StorelyMongo(MONGO_URI, { db: MONGO_DB, collection: "storely" }),
			}),
			buildKeyvClient({
				mode,
				store: new KeyvMongo(MONGO_URI, { db: MONGO_DB, collection: "keyv" }),
			}),
			buildCacheManagerClient({
				mode,
				store: new KeyvMongo(MONGO_URI, { db: MONGO_DB, collection: "cache_manager" }),
			}),
		];
	},
};
