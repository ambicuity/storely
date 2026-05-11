import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storageTestSuite, storelyTestSuite } from "@storely/test-suite";
import Storely from "storely";
import { afterEach, beforeEach, it } from "vitest";
import StorelyRocksDB from "../src/index.js";

let tempDir: string;
let storeCounter = 0;

// Each `store()` call must return an adapter pointed at a unique path
// because RocksDB acquires an exclusive lock on the database directory.
// The test-suite's namespace tests open two adapters concurrently, so a
// shared path would fail with LEVEL_LOCKED.
const store = () => {
	storeCounter += 1;
	const dbPath = join(tempDir, `suite-testdb-${storeCounter}`);
	return new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
};

storelyTestSuite(it, Storely, store);
storageTestSuite(it, store, { ttl: false });

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "storely-rocksdb-suite-"));
	storeCounter = 0;
});

afterEach(async () => {
	try {
		rmSync(tempDir, { recursive: true, force: true });
	} catch {}
});
