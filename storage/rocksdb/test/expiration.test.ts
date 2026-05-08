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

describe("clearExpired", () => {
	it("removes expired entries", async (t) => {
		await store.clear();
		const expiredValue = JSON.stringify({
			value: "old",
			expires: Date.now() - 1000,
		});
		const validValue = JSON.stringify({ value: "current", expires: null });
		const expiredKey = faker.string.uuid();
		const validKey = faker.string.uuid();
		await store.set(expiredKey, expiredValue);
		await store.set(validKey, validValue);
		// has() should already filter expired entries
		t.expect(await store.has(expiredKey)).toBe(false);
		t.expect(await store.has(validKey)).toBe(true);
		await store.clearExpired();
		t.expect(await store.has(expiredKey)).toBe(false);
		t.expect(await store.has(validKey)).toBe(true);
	});

	it("removes all expired entries while keeping valid ones", async (t) => {
		await store.clear();
		const expiredValue = JSON.stringify({
			value: "expired",
			expires: Date.now() - 1000,
		});
		const validValue = JSON.stringify({
			value: "valid",
			expires: Date.now() + 60_000,
		});
		const keys = {
			expired1: faker.string.uuid(),
			expired2: faker.string.uuid(),
			valid1: faker.string.uuid(),
			valid2: faker.string.uuid(),
		};
		await store.set(keys.expired1, expiredValue);
		await store.set(keys.expired2, expiredValue);
		await store.set(keys.valid1, validValue);
		await store.set(keys.valid2, validValue);
		await store.clearExpired();
		t.expect(await store.has(keys.expired1)).toBe(false);
		t.expect(await store.has(keys.expired2)).toBe(false);
		t.expect(await store.has(keys.valid1)).toBe(true);
		t.expect(await store.has(keys.valid2)).toBe(true);
	});
});

describe("clearExpiredInterval", () => {
	it("auto-cleans expired entries", async (t) => {
		const autoStore = new StorelyRocksDB({
			uri: `rocksdb://${dbPath}-auto`,
			clearExpiredInterval: 100,
		});
		await autoStore.clear();
		const expiredValue = JSON.stringify({
			value: "old",
			expires: Date.now() - 1000,
		});
		const autoExpiredKey = faker.string.uuid();
		await autoStore.set(autoExpiredKey, expiredValue);
		// has() should already filter expired entries
		t.expect(await autoStore.has(autoExpiredKey)).toBe(false);
		// Wait for the cleanup timer to fire
		await new Promise((resolve) => {
			setTimeout(resolve, 250);
		});
		t.expect(await autoStore.has(autoExpiredKey)).toBe(false);
		await autoStore.disconnect();
	});

	it("setter restarts timer", (t) => {
		const testStore = new StorelyRocksDB({ uri: `rocksdb://${dbPath}-timer` });
		t.expect(testStore.clearExpiredInterval).toBe(0);
		testStore.clearExpiredInterval = 500;
		t.expect(testStore.clearExpiredInterval).toBe(500);
		testStore.clearExpiredInterval = 0;
		t.expect(testStore.clearExpiredInterval).toBe(0);
	});

	it("0 disables timer", (t) => {
		const testStore = new StorelyRocksDB({ uri: `rocksdb://${dbPath}-disabled` });
		t.expect(testStore.clearExpiredInterval).toBe(0);
	});
});

describe("lazy expiration", () => {
	it("get returns undefined for expired key", async (t) => {
		await store.clear();
		const key = faker.string.uuid();
		const expiredValue = JSON.stringify({
			value: "old",
			expires: Date.now() - 1000,
		});
		await store.set(key, expiredValue);
		t.expect(await store.get(key)).toBeUndefined();
	});

	it("has returns false and deletes expired key", async (t) => {
		await store.clear();
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

	it("getMany returns undefined for expired keys and deletes them", async (t) => {
		await store.clear();
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
		t.expect(await store.get(expiredKey1)).toBeUndefined();
		t.expect(await store.get(expiredKey2)).toBeUndefined();
	});

	it("hasMany returns false for expired keys and deletes them", async (t) => {
		await store.clear();
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
});
