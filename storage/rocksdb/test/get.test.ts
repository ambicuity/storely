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

describe("get", () => {
	it("returns value for existing key", async (t) => {
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await store.set(key, val);
		t.expect(await store.get(key)).toBe(val);
	});

	it("returns undefined for missing key", async (t) => {
		const key = faker.string.uuid();
		t.expect(await store.get(key)).toBeUndefined();
	});

	it("returns undefined for expired key and deletes it (lazy expiration)", async (t) => {
		const key = faker.string.uuid();
		const expiredValue = JSON.stringify({
			value: "old",
			expires: Date.now() - 1000,
		});
		await store.set(key, expiredValue);
		t.expect(await store.get(key)).toBeUndefined();
		// Verify the key was deleted from the store
		t.expect(await store.has(key)).toBe(false);
	});

	it("returns value for key with future expiration", async (t) => {
		const key = faker.string.uuid();
		const val = JSON.stringify({
			value: "fresh",
			expires: Date.now() + 60_000,
		});
		await store.set(key, val);
		const result = await store.get(key);
		t.expect(result).toBe(val);
	});

	it("returns undefined for value without expires that is non-parseable string", async (t) => {
		const key = faker.string.uuid();
		await store.set(key, "hello");
		// parseValue should return { value: "hello" } for non-JSON string
		t.expect(await store.get(key)).toBe("hello");
	});
});

describe("getMany", () => {
	it("returns multiple values", async (t) => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await store.set(key1, val1);
		await store.set(key2, val2);
		await store.set(key3, val3);
		const values = await store.getMany([key1, key2, key3]);
		t.expect(values).toStrictEqual([val1, val2, val3]);
	});

	it("returns undefined for missing keys", async (t) => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const val1 = faker.lorem.word();
		await store.set(key1, val1);
		const values = await store.getMany([key1, key2]);
		t.expect(values[0]).toBe(val1);
		t.expect(values[1]).toBeUndefined();
	});

	it("handles expired keys with lazy deletion", async (t) => {
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
		const result = await store.getMany([expiredKey1, expiredKey2, validKey]);
		t.expect(result[0]).toBeUndefined();
		t.expect(result[1]).toBeUndefined();
		t.expect(result[2]).toBe(validValue);
		// Verify expired keys were deleted
		t.expect(await store.has(expiredKey1)).toBe(false);
		t.expect(await store.has(expiredKey2)).toBe(false);
	});

	it("returns empty array for empty keys input", async (t) => {
		const result = await store.getMany([]);
		t.expect(result).toStrictEqual([]);
	});
});
