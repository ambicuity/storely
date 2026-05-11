import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Storely from "@ambicuity/storely-core";
import { afterEach, beforeEach, describe, it } from "vitest";
import type StorelyRocksDB from "../src/index.js";
import { createStorelyRocksDB, createStorelyRocksDBNonBlocking } from "../src/index.js";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "storely-rocksdb-test-"));
	dbPath = join(tempDir, "testdb");
});

afterEach(async () => {
	try {
		rmSync(tempDir, { recursive: true, force: true });
	} catch {}
});

describe("createStorelyRocksDB", () => {
	it("creates a Storely instance", async (t) => {
		const storely = createStorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		t.expect(storely).toBeInstanceOf(Storely);
		const key = "test-key";
		const val = "test-value";
		await storely.set(key, val);
		t.expect(await storely.get(key)).toBe(val);
		const store = storely.store as StorelyRocksDB;
		await store.disconnect();
	});

	it("creates a Storely instance with string URI", async (t) => {
		const storely = createStorelyRocksDB(`rocksdb://${dbPath}`);
		t.expect(storely).toBeInstanceOf(Storely);
		await (storely.store as StorelyRocksDB).disconnect();
	});

	it("creates a Storely instance with namespace option", async (t) => {
		const storely = createStorelyRocksDB({
			uri: `rocksdb://${dbPath}`,
			namespace: "testns",
		});
		t.expect(storely).toBeInstanceOf(Storely);
		t.expect(storely.namespace).toBe("testns");
		await (storely.store as StorelyRocksDB).disconnect();
	});

	it("creates a Storely instance without namespace when not specified", async (t) => {
		const storely = createStorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		t.expect(storely).toBeInstanceOf(Storely);
		t.expect(storely.namespace).toBeUndefined();
		await (storely.store as StorelyRocksDB).disconnect();
	});
});

describe("createStorelyRocksDBNonBlocking", () => {
	it("creates a Storely instance", async (t) => {
		const storely = createStorelyRocksDBNonBlocking({ uri: `rocksdb://${dbPath}` });
		t.expect(storely).toBeInstanceOf(Storely);
		const store = storely.store as StorelyRocksDB;
		await store.disconnect();
	});

	it("sets throwOnErrors to false", async (t) => {
		const storely = createStorelyRocksDBNonBlocking({ uri: `rocksdb://${dbPath}` });
		const store = storely.store as StorelyRocksDB;
		t.expect(store.throwOnErrors).toBe(false);
		t.expect(storely.throwOnErrors).toBe(false);
		await store.disconnect();
	});

	it("creates a Storely instance with string URI", async (t) => {
		const storely = createStorelyRocksDBNonBlocking(`rocksdb://${dbPath}`);
		t.expect(storely).toBeInstanceOf(Storely);
		await (storely.store as StorelyRocksDB).disconnect();
	});

	it("basic get/set works in non-blocking mode", async (t) => {
		const storely = createStorelyRocksDBNonBlocking({ uri: `rocksdb://${dbPath}` });
		const key = "test-key";
		const val = "test-value";
		await storely.set(key, val);
		t.expect(await storely.get(key)).toBe(val);
		await (storely.store as StorelyRocksDB).disconnect();
	});
});
