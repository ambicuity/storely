import KeyvEtcd from "@keyv/etcd";
import StorelyEtcd from "@storely/etcd";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const ETCD_URI_HOST = process.env.ETCD_HOST ?? "127.0.0.1";
const ETCD_URI_PORT = Number(process.env.ETCD_PORT ?? 2379);
const ETCD_STORELY_URI = `etcd://${ETCD_URI_HOST}:${ETCD_URI_PORT}`;
const ETCD_KEYV_URI = `${ETCD_URI_HOST}:${ETCD_URI_PORT}`;

export const etcdBackend: BackendFactory = {
	name: "etcd",
	async available() {
		return await probeTcp(ETCD_URI_HOST, ETCD_URI_PORT);
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({
				mode,
				store: new StorelyEtcd({ uri: ETCD_STORELY_URI, busyTimeout: 3000 }),
			}),
			buildKeyvClient({ mode, store: new KeyvEtcd(ETCD_KEYV_URI) }),
			buildCacheManagerClient({ mode, store: new KeyvEtcd(ETCD_KEYV_URI) }),
		];
	},
};
