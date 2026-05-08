import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import Storely from "storely";
import { afterEach, beforeEach, describe, it } from "vitest";
import StorelyRocksDB from "../src/index.js";

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

describe("namespace isolation", () => {
	it("two instances with different namespaces do not interfere", async (t) => {
		const storeA = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		const storeB = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		const storelyA = new Storely({ store: storeA, namespace: "ns1" });
		const storelyB = new Storely({ store: storeB, namespace: "ns2" });

		await storelyA.clear();
		await storelyB.clear();

		const keyA1 = faker.string.uuid();
		const keyA2 = faker.string.uuid();
		const keyA3 = faker.string.uuid();
		const valA1 = faker.lorem.word();
		const valA2 = faker.lorem.word();
		const valA3 = faker.lorem.word();
		const valB1 = faker.lorem.word();
		const valB2 = faker.lorem.word();
		const valB3 = faker.lorem.word();

		await storelyA.set(keyA1, valA1);
		await storelyA.set(keyA2, valA2);
		await storelyA.set(keyA3, valA3);

		await storelyB.set(keyA1, valB1);
		await storelyB.set(keyA2, valB2);
		await storelyB.set(keyA3, valB3);

		const resultA = await storelyA.get([keyA1, keyA2, keyA3]);
		const resultB = await storelyB.get([keyA1, keyA2, keyA3]);

		t.expect(resultA).toStrictEqual([valA1, valA2, valA3]);
		t.expect(resultB).toStrictEqual([valB1, valB2, valB3]);

		await storeA.disconnect();
		await storeB.disconnect();
	});

	it("clear only clears current namespace", async (t) => {
		const storeA = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		const storeB = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		storeA.namespace = "nsA";
		storeB.namespace = "nsB";

		await storeA.clear();
		await storeB.clear();

		const nsKey = faker.string.uuid();
		const valA = faker.lorem.word();
		const valB = faker.lorem.word();
		await storeA.set(`nsA:${nsKey}`, valA);
		await storeB.set(`nsB:${nsKey}`, valB);

		t.expect(await storeA.get(`nsA:${nsKey}`)).toBe(valA);
		t.expect(await storeB.get(`nsB:${nsKey}`)).toBe(valB);

		await storeA.clear();
		t.expect(await storeA.get(`nsA:${nsKey}`)).toBeUndefined();
		t.expect(await storeB.get(`nsB:${nsKey}`)).toBe(valB);

		await storeB.clear();
		await storeA.disconnect();
		await storeB.disconnect();
	});

	it("namespace prefix is properly stripped in iterator", async (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		store.namespace = "myns";
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await store.set(`myns:${key}`, val);

		const entries: Array<[string, string]> = [];
		for await (const [k, v] of store.iterator()) {
			entries.push([k as string, v as string]);
		}

		t.expect(entries.length).toBe(1);
		// The key should have the namespace prefix stripped
		t.expect(entries[0][0]).toBe(key);
		t.expect(entries[0][1]).toBe(val);

		await store.disconnect();
	});
});
