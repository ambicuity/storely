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

describe("has", () => {
	it("returns true for existing key", async (t) => {
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await store.set(key, val);
		t.expect(await store.has(key)).toBe(true);
	});

	it("returns false for non-existent key", async (t) => {
		const key = faker.string.uuid();
		t.expect(await store.has(key)).toBe(false);
	});

	it("returns false and deletes expired key", async (t) => {
		const key = faker.string.uuid();
		const expiredValue = JSON.stringify({
			value: "old",
			expires: Date.now() - 1000,
		});
		await store.set(key, expiredValue);
		t.expect(await store.has(key)).toBe(false);
		// Verify the key was deleted
		t.expect(await store.get(key)).toBeUndefined();
	});
});

describe("hasMany", () => {
	it("returns correct booleans for mixed keys", async (t) => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		await store.set(key1, val1);
		const result = await store.hasMany([key1, key2, key3]);
		t.expect(result).toStrictEqual([true, false, false]);
	});

	it("returns false for expired keys and deletes them", async (t) => {
		const expiredKey1 = faker.string.uuid();
		const expiredKey2 = faker.string.uuid();
		const validKey = faker.string.uuid();
		const expiredValue = JSON.stringify({
			value: "old",
			expires: Date.now() - 1000,
		});
		const validValue = JSON.stringify({
			value: "fresh",
			expires: Date.now() + 60_000,
		});
		await store.set(expiredKey1, expiredValue);
		await store.set(expiredKey2, expiredValue);
		await store.set(validKey, validValue);
		const result = await store.hasMany([expiredKey1, expiredKey2, validKey]);
		t.expect(result[0]).toBe(false);
		t.expect(result[1]).toBe(false);
		t.expect(result[2]).toBe(true);
		// Verify expired keys were deleted
		t.expect(await store.has(expiredKey1)).toBe(false);
		t.expect(await store.has(expiredKey2)).toBe(false);
	});

	it("returns empty array for empty keys input", async (t) => {
		const result = await store.hasMany([]);
		t.expect(result).toStrictEqual([]);
	});
});
