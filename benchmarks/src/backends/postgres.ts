import KeyvPostgres from "@keyv/postgres";
import StorelyPostgres from "@storely/postgres";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

// Default to 127.0.0.1:5432 to match the project's docker-compose. On hosts where
// a native Postgres already owns 5432 (common on macOS dev machines) the user can
// run a benchmark-specific Postgres on 5435 and override via POSTGRES_URI.
const POSTGRES_URI =
	process.env.POSTGRES_URI ?? "postgresql://postgres:postgres@127.0.0.1:5432/storely_test";

export const postgresBackend: BackendFactory = {
	name: "postgres",
	async available() {
		const url = new URL(POSTGRES_URI);
		return await probeTcp(url.hostname, Number(url.port || 5432));
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		return [
			buildStorelyClient({ mode, store: new StorelyPostgres({ uri: POSTGRES_URI }) }),
			buildKeyvClient({ mode, store: new KeyvPostgres({ uri: POSTGRES_URI }) }),
			buildCacheManagerClient({ mode, store: new KeyvPostgres({ uri: POSTGRES_URI }) }),
		];
	},
};
