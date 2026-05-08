import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storageTestSuite, storelyTestSuite } from "@storely/test-suite";
import Storely from "storely";
import { afterEach, beforeEach, it } from "vitest";
import StorelyRocksDB from "../src/index.js";

let tempDir: string;

const store = () => {
	const db = new StorelyRocksDB({ uri: `rocksdb://${join(tempDir, "suite-testdb")}` });
	return db;
};

storelyTestSuite(it, Storely, store);
storageTestSuite(it, store, { ttl: false });

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "storely-rocksdb-suite-"));
});

afterEach(async () => {
	try {
		rmSync(tempDir, { recursive: true, force: true });
	} catch {}
});
