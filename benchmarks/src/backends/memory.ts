import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildCacheManagerClient } from "../libraries/cache-manager.js";
import { buildKeyvClient } from "../libraries/keyv.js";
import { buildStorelyClient } from "../libraries/storely.js";

export const memoryBackend: BackendFactory = {
	name: "memory",
	async available() {
		return true;
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		// Each library gets its own fresh Map-backed store.
		return [
			buildStorelyClient({ mode, store: new Map() }),
			buildKeyvClient({ mode, store: new Map() }),
			buildCacheManagerClient({ mode, store: new Map() }),
		];
	},
};
