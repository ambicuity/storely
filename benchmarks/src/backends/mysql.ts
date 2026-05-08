import KeyvMysql from "@keyv/mysql";
import StorelyMysql from "@storely/mysql";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

const MYSQL_URI = process.env.MYSQL_URI ?? "mysql://root@127.0.0.1:3306/storely_test";

export const mysqlBackend: BackendFactory = {
	name: "mysql",
	async available() {
		const url = new URL(MYSQL_URI);
		return await probeTcp(url.hostname, Number(url.port || 3306));
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({ mode, store: new StorelyMysql(MYSQL_URI) }),
			buildKeyvClient({ mode, store: new KeyvMysql({ uri: MYSQL_URI }) }),
			buildCacheManagerClient({ mode, store: new KeyvMysql({ uri: MYSQL_URI }) }),
		];
	},
};
