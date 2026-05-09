import KeyvRedis from "@keyv/redis";
import StorelyKeyDB from "@storely/keydb";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

// KeyDB is a redis-protocol fork. Storely uses @storely/keydb; the keyv side
// reuses @keyv/redis pointed at the keydb port. Bench labels the row "keydb"
// (per the factory's name) so it stays distinguishable from the existing
// "redis" row even though the keyv-side library is the same.
const KEYDB_HOST = process.env.KEYDB_HOST ?? "127.0.0.1";
const KEYDB_PORT = Number(process.env.KEYDB_PORT ?? 6378);
const KEYDB_URI = `redis://${KEYDB_HOST}:${KEYDB_PORT}`;

export const keydbBackend: BackendFactory = {
	name: "keydb",
	async available() {
		return await probeTcp(KEYDB_HOST, KEYDB_PORT);
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({ mode, store: new StorelyKeyDB(KEYDB_URI) }),
			buildKeyvClient({ mode, store: new KeyvRedis(KEYDB_URI) }),
			buildCacheManagerClient({ mode, store: new KeyvRedis(KEYDB_URI) }),
		];
	},
};
