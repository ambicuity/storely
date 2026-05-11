import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Storely from "@ambicuity/ambicore";
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

describe("iterator", () => {
	it("yields all key-value pairs", async (t) => {
		await store.clear();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await store.set(key1, val1);
		await store.set(key2, val2);
		await store.set(key3, val3);
		const expected = new Map([
			[key1, val1],
			[key2, val2],
			[key3, val3],
		]);
		const actual = new Map<string, string>();
		for await (const [key, value] of store.iterator()) {
			actual.set(key as string, value as string);
		}
		t.expect(actual).toStrictEqual(expected);
	});

	it("respects iterationLimit as a total cap", async (t) => {
		// The underlying abstract-level driver treats `limit` as a TOTAL cap,
		// not a batch size, so `iterationLimit: 1` truncates the iterator to
		// the first key. The test reflects that documented contract.
		const limitedStore = new StorelyRocksDB({
			uri: `rocksdb://${dbPath}-limited`,
			iterationLimit: 1,
		});
		await limitedStore.clear();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		await limitedStore.set(key1, faker.lorem.word());
		await limitedStore.set(key2, faker.lorem.word());
		await limitedStore.set(key3, faker.lorem.word());

		const collected: string[] = [];
		for await (const [key] of limitedStore.iterator()) {
			collected.push(key as string);
		}
		t.expect(collected.length).toBe(1);

		await limitedStore.disconnect();
	});

	it("skips expired entries", async (t) => {
		await store.clear();
		const validKey = faker.string.uuid();
		const expiredKey = faker.string.uuid();
		const validValue = faker.lorem.word();
		const expiredValue = JSON.stringify({
			value: "old",
			expires: Date.now() - 1000,
		});
		await store.set(validKey, validValue);
		await store.set(expiredKey, expiredValue);
		const entries: Array<[string, string]> = [];
		for await (const [key, value] of store.iterator()) {
			entries.push([key as string, value as string]);
		}
		t.expect(entries.length).toBe(1);
		t.expect(entries[0][0]).toBe(validKey);
		t.expect(entries[0][1]).toBe(validValue);
	});

	it("returns empty for no entries", async (t) => {
		await store.clear();
		const entries: Array<[string, string]> = [];
		for await (const [key, value] of store.iterator()) {
			entries.push([key as string, value as string]);
		}
		t.expect(entries.length).toBe(0);
	});

	it("works with Storely instance", async (t) => {
		const storely = new Storely({ store });
		await storely.clear();
		const testData = {
			key: faker.string.alphanumeric(10),
			value: faker.string.alphanumeric(10),
		};
		await storely.set(testData.key, testData.value);
		const result = await storely.get(testData.key);
		t.expect(result).toBe(testData.value);
		t.expect(storely.iterator).toBeDefined();
		if (typeof storely.iterator === "function") {
			let found = false;
			for await (const [key, raw] of storely.iterator()) {
				t.expect(key).toBe(testData.key);
				t.expect(raw).toBe(testData.value);
				found = true;
			}
			t.expect(found).toBe(true);
		}
	});
});
