import KeyvValkey from "@keyv/valkey";
import StorelyValkey from "@storely/valkey";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const VALKEY_HOST = process.env.VALKEY_HOST ?? "127.0.0.1";
const VALKEY_PORT = Number(process.env.VALKEY_PORT ?? 6370);
const VALKEY_URI = `redis://${VALKEY_HOST}:${VALKEY_PORT}`;

export const valkeyBackend: BackendFactory = {
	name: "valkey",
	async available() {
		return await probeTcp(VALKEY_HOST, VALKEY_PORT);
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({ mode, store: new StorelyValkey(VALKEY_URI) }),
			buildKeyvClient({ mode, store: new KeyvValkey(VALKEY_URI) }),
			buildCacheManagerClient({ mode, store: new KeyvValkey(VALKEY_URI) }),
		];
	},
};
