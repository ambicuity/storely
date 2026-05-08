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

describe("set", () => {
	it("stores a value and retrieves it", async (t) => {
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		const result = await store.set(key, val);
		t.expect(result).toBe(true);
		t.expect(await store.get(key)).toBe(val);
	});

	it("overwrites an existing value", async (t) => {
		const key = faker.string.uuid();
		const oldVal = faker.lorem.word();
		const newVal = faker.lorem.word();
		await store.set(key, oldVal);
		await store.set(key, newVal);
		t.expect(await store.get(key)).toBe(newVal);
	});

	it("stores a JSON stringified value with expires", async (t) => {
		const key = faker.string.uuid();
		const val = JSON.stringify({
			value: "data",
			expires: Date.now() + 60_000,
		});
		await store.set(key, val);
		t.expect(await store.get(key)).toBe(val);
	});
});

describe("setMany", () => {
	it("stores multiple values", async (t) => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		const result = await store.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3 },
		]);
		t.expect(result).toStrictEqual([true, true, true]);
		t.expect(await store.get(key1)).toBe(val1);
		t.expect(await store.get(key2)).toBe(val2);
		t.expect(await store.get(key3)).toBe(val3);
	});

	it("upserts existing keys", async (t) => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const oldVal = faker.lorem.word();
		const newVal = faker.lorem.word();
		const val2 = faker.lorem.word();
		await store.set(key1, oldVal);
		await store.setMany([
			{ key: key1, value: newVal },
			{ key: key2, value: val2 },
		]);
		t.expect(await store.get(key1)).toBe(newVal);
		t.expect(await store.get(key2)).toBe(val2);
	});

	it("returns empty array for empty entries input", async (t) => {
		const result = await store.setMany([]);
		t.expect(result).toStrictEqual([]);
	});
});
