import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import KeyvSqlite from "@keyv/sqlite";
import StorelySqlite from "@storely/sqlite";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";

export const sqliteBackend: BackendFactory = {
	name: "sqlite",
	async available() {
		// SQLite uses local files — always available.
		return true;
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		// Each library gets its own database file in a fresh tmp dir to avoid
		// cross-library lock contention skewing the comparison.
		const dir = mkdtempSync(join(tmpdir(), "storely-bench-sqlite-"));
		const cleanup = async () => {
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {}
		};
		return [
			buildStorelyClient({
				mode,
				store: new StorelySqlite({ uri: `sqlite://${join(dir, "storely.sqlite")}` }),
				disconnect: cleanup,
			}),
			buildKeyvClient({
				mode,
				store: new KeyvSqlite({ uri: `sqlite://${join(dir, "keyv.sqlite")}` }),
			}),
			buildCacheManagerClient({
				mode,
				store: new KeyvSqlite({ uri: `sqlite://${join(dir, "cache-manager.sqlite")}` }),
			}),
		];
	},
};
