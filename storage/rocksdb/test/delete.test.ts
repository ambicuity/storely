import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { afterEach, beforeEach, describe, it } from "vitest";
import StorelyRocksDB from "../src/index.js";

let tempDir: string;
let dbPath: string;
let store: StorelyRocksDB;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "storely-rocksdb-test-"));
	dbPath = join(tempDir, "testdb");
	store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
});

afterEach(async () => {
	await store.disconnect();
	try {
		rmSync(tempDir, { recursive: true, force: true });
	} catch {}
});

describe("delete", () => {
	it("returns true for existing key", async (t) => {
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await store.set(key, val);
		const result = await store.delete(key);
		t.expect(result).toBe(true);
		t.expect(await store.get(key)).toBeUndefined();
	});

	it("returns false for non-existent key", async (t) => {
		const key = faker.string.uuid();
		const result = await store.delete(key);
		t.expect(result).toBe(false);
	});
});

describe("deleteMany", () => {
	it("deletes multiple keys", async (t) => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await store.set(key1, val1);
		await store.set(key2, val2);
		await store.set(key3, val3);
		const result = await store.deleteMany([key1, key2, key3]);
		t.expect(result).toStrictEqual([true, true, true]);
		t.expect(await store.get(key1)).toBeUndefined();
		t.expect(await store.get(key2)).toBeUndefined();
		t.expect(await store.get(key3)).toBeUndefined();
	});

	it("returns false for missing keys in batch", async (t) => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const val1 = faker.lorem.word();
		await store.set(key1, val1);
		const result = await store.deleteMany([key1, key2]);
		t.expect(result[0]).toBe(true);
		t.expect(result[1]).toBe(false);
	});

	it("returns empty array for empty keys input", async (t) => {
		const result = await store.deleteMany([]);
		t.expect(result).toStrictEqual([]);
	});
});
