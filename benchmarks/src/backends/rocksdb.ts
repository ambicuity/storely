import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildStorelyClient } from "../libraries/storely.js";

// RocksDB is embedded — no Docker service. available() probes module load:
// if @storely/rocksdb's native binding fails to load on this platform/node
// version, the import throws and the bench skips this backend.
//
// build() creates a fresh tmp directory per run via mkdtempSync, so back-
// to-back invocations don't fight over the same DB file. The directory is
// not deleted automatically — see benchmarks/README.md for the cleanup
// recipe.
export const rocksdbBackend: BackendFactory = {
	name: "rocksdb",
	async available() {
		try {
			await import("@storely/rocksdb");
			return true;
		} catch {
			return false;
		}
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		const StorelyRocksDB = (await import("@storely/rocksdb")).default;
		const dir = mkdtempSync(join(tmpdir(), "storely-bench-rocksdb-"));
		const store = new StorelyRocksDB({ uri: `rocksdb://${dir}` });
		return [buildStorelyClient({ mode, store })];
	},
};
