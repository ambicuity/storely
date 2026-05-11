import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
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
		// RocksDB takes an exclusive lock on the directory, so we can't open
		// the same path twice. Test namespace isolation by using a single
		// adapter and switching its namespace between writes.
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });

		const keyA1 = faker.string.uuid();
		const keyA2 = faker.string.uuid();
		const valA1 = faker.lorem.word();
		const valA2 = faker.lorem.word();
		const valB1 = faker.lorem.word();
		const valB2 = faker.lorem.word();

		store.namespace = "ns1";
		await store.set(keyA1, valA1);
		await store.set(keyA2, valA2);

		store.namespace = "ns2";
		await store.set(keyA1, valB1);
		await store.set(keyA2, valB2);

		store.namespace = "ns1";
		t.expect(await store.get(keyA1)).toBe(valA1);
		t.expect(await store.get(keyA2)).toBe(valA2);

		store.namespace = "ns2";
		t.expect(await store.get(keyA1)).toBe(valB1);
		t.expect(await store.get(keyA2)).toBe(valB2);

		await store.disconnect();
	});

	it("clear only clears current namespace", async (t) => {
		// Single adapter, namespace toggled between writes — see the comment
		// in the previous test for why two instances cannot share a path.
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });

		const nsKey = faker.string.uuid();
		const valA = faker.lorem.word();
		const valB = faker.lorem.word();

		store.namespace = "nsA";
		await store.set(nsKey, valA);

		store.namespace = "nsB";
		await store.set(nsKey, valB);

		store.namespace = "nsA";
		t.expect(await store.get(nsKey)).toBe(valA);
		await store.clear();
		t.expect(await store.get(nsKey)).toBeUndefined();

		store.namespace = "nsB";
		t.expect(await store.get(nsKey)).toBe(valB);

		await store.disconnect();
	});

	it("namespace prefix is properly stripped in iterator", async (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		store.namespace = "myns";
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		// The adapter prepends the namespace, so pass the bare key.
		await store.set(key, val);

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
