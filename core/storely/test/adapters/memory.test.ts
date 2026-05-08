import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import { createStorely, StorelyMemoryAdapter } from "../../src/adapters/memory.js";
import { delay as sleep } from "../test-utils.js";

describe("Storely Generic Store Options", () => {
	test("should accept a store, allow replacement, and expose capabilities", () => {
		const store = new Map();
		const storely = new StorelyMemoryAdapter(store);
		expect(storely.store).toBe(store);
		storely.store = new Map();
		expect(storely.store).not.toBe(store);

		const cap = storely.capabilities;
		expect(cap.store).toBe("mapLike");
		expect(cap.methods.get.exists).toBe(true);
		expect(cap.methods.get.methodType).toBe("sync");
	});

	test("should handle namespace and keySeparator options", () => {
		const ns = faker.string.alphanumeric(8);
		const storely = new StorelyMemoryAdapter(new Map(), { namespace: ns, keySeparator: "::" });
		expect(storely.namespace).toBe(ns);
		expect(storely.keySeparator).toBe("::");
		storely.keySeparator = "~";
		expect(storely.keySeparator).toBe("~");
		storely.namespace = "new";
		expect(storely.namespace).toBe("new");
	});
});

describe("Storely Generic Store Namespace", () => {
	test("should handle key prefix with and without namespace", () => {
		const storely = new StorelyMemoryAdapter(new Map());
		const key = faker.string.uuid();
		const ns = faker.string.alphanumeric(8);
		expect(storely.getKeyPrefix(key, ns)).toBe(`${ns}:${key}`);
		expect(storely.getKeyPrefix(key)).toBe(key);

		// Key prefix data
		const storely2 = new StorelyMemoryAdapter(new Map(), { namespace: ns });
		expect(storely2.getKeyPrefixData(`${ns}:${key}`)).toEqual({ key, namespace: ns });
		expect(storely2.getKeyPrefixData(key)).toEqual({ key });

		// No namespace configured
		expect(storely.getKeyPrefixData("user:123")).toEqual({ key: "user:123" });
	});
});

describe("Storely Generic set / get / has Operations", () => {
	test("should set, get, setMany, and handle missing keys", async () => {
		const storely = new StorelyMemoryAdapter(new Map());
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();
		await storely.set(key, value);
		expect(await storely.get(key)).toBe(value);
		expect(await storely.get(faker.string.uuid())).toBe(undefined);

		// setMany
		const k1 = faker.string.uuid();
		const k2 = faker.string.uuid();
		const result = await storely.setMany([
			{ key: k1, value: "v1" },
			{ key: k2, value: "v2" },
		]);
		expect(result).toEqual([true, true]);
		expect(await storely.get(k1)).toBe("v1");
	});

	test("should handle TTL expiration", async () => {
		const storely = new StorelyMemoryAdapter(new Map());
		const key = faker.string.uuid();
		await storely.set(key, { value: "test", expires: Date.now() + 10 }, 10);
		await sleep(20);
		expect(await storely.get(key)).toBe(undefined);
	});

	test("should handle has, hasMany, and falsy values", async () => {
		const storely = new StorelyMemoryAdapter(new Map());
		const k1 = faker.string.uuid();
		await storely.set(k1, "val");
		expect(await storely.has(k1)).toBe(true);
		expect(await storely.has(faker.string.uuid())).toBe(false);

		// Falsy values
		const keys = [
			faker.string.uuid(),
			faker.string.uuid(),
			faker.string.uuid(),
			faker.string.uuid(),
		];
		await storely.set(keys[0], 0);
		await storely.set(keys[1], "");
		await storely.set(keys[2], false);
		await storely.set(keys[3], null);
		for (const k of keys) {
			expect(await storely.has(k)).toBe(true);
		}

		// Expired has
		const expKey = faker.string.uuid();
		await storely.set(expKey, "test", 1);
		await new Promise((r) => {
			setTimeout(r, 10);
		});
		expect(await storely.has(expKey)).toBe(false);

		// hasMany
		const k2 = faker.string.uuid();
		await storely.set(k2, "v2");
		expect(await storely.hasMany([k1, k2, faker.string.uuid()])).toEqual([true, true, false]);
	});

	test("should handle getMany with expired keys", async () => {
		const storely = new StorelyMemoryAdapter(new Map());
		const k1 = faker.string.uuid();
		const k2 = faker.string.uuid();
		await storely.set(k1, { value: "v1", expires: Date.now() + 1 }, 1);
		await storely.set(k2, "v2");
		await new Promise((r) => {
			setTimeout(r, 10);
		});
		const values = await storely.getMany([k1, k2, faker.string.uuid()]);
		expect(values[0]).toBe(undefined);
		expect(values[1]).toBe("v2");
		expect(values[2]).toBe(undefined);
	});
});

describe("Storely Generic Delete / Clear Operations", () => {
	test("should delete, deleteMany, and clear with namespace", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const storely = new StorelyMemoryAdapter(store, { namespace: ns1 });

		const k1 = faker.string.uuid();
		const k2 = faker.string.uuid();
		const k3 = faker.string.uuid();
		await storely.set(k1, "v1");
		await storely.set(k2, "v2");
		await storely.set(k3, "v3");

		// Delete single
		await storely.delete(k1);
		expect(await storely.get(k1)).toBe(undefined);

		// DeleteMany
		await storely.deleteMany([k2]);
		expect(await storely.get(k2)).toBe(undefined);
		expect(await storely.get(k3)).toBe("v3");

		// Clear namespace only
		store.set(`${ns2}:other`, { value: "other", expires: undefined });
		await storely.clear();
		expect(store.has(`${ns2}:other`)).toBe(true);

		// Clear entire store when no namespace
		const storely2 = new StorelyMemoryAdapter(store);
		await storely2.clear();
		expect(store.size).toBe(0);
	});

	test("should emit errors on deleteMany and setMany failures", async () => {
		// deleteMany error
		const store1 = new Map();
		store1.delete = () => {
			throw new Error("delete error");
		};
		const storely1 = new StorelyMemoryAdapter(store1);
		let errorEmitted = false;
		storely1.on("error", () => {
			errorEmitted = true;
		});
		await storely1.deleteMany([faker.string.uuid()]);
		expect(errorEmitted).toBe(true);

		// setMany error via createStorely
		const store2 = new Map();
		store2.set = () => {
			throw new Error("Test Error");
		};
		const storely2 = createStorely(store2);
		let setError = false;
		storely2.on("error", () => {
			setError = true;
		});
		const result = await storely2.setMany(
			Array.from({ length: 3 }, () => ({ key: faker.string.uuid(), value: "v" })),
		);
		expect(result).toEqual([false, false, false]);
		expect(setError).toBe(true);

		// deleteMany error via createStorely
		const store3 = new Map();
		const storely3 = createStorely(store3);
		storely3.store.deleteMany = () => {
			throw new Error("Test Error");
		};
		let deleteError = false;
		storely3.on("error", () => {
			deleteError = true;
		});
		const delResult = await storely3.deleteMany(
			Array.from({ length: 3 }, () => faker.string.uuid()),
		);
		expect(delResult).toEqual([false, false, false]);
		expect(deleteError).toBe(true);
	});

	test("hasMany through createStorely with store hasMany", async () => {
		const storely = createStorely(new Map());
		const testData = Array.from({ length: 5 }, () => ({
			key: faker.string.uuid(),
			value: faker.lorem.sentence(),
		}));
		await storely.setMany(testData);
		expect((await storely.hasMany(testData.map((d) => d.key))).length).toBe(5);

		// Delete one and check
		await storely.delete(testData[0].key);
		const result = await storely.hasMany(testData.map((d) => d.key));
		expect(result[0]).toBe(false);
		expect(result.length).toBe(5);
	});
});

describe("createStorely namespace forwarding", () => {
	test("should prefix and isolate keys with namespace", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const key = faker.string.uuid();
		const kv1 = createStorely(store, { namespace: ns1 });
		const kv2 = createStorely(store, { namespace: ns2 });
		await kv1.set(key, "v1");
		await kv2.set(key, "v2");
		expect(store.has(`${ns1}:${key}`)).toBe(true);
		expect(store.has(key)).toBe(false);
		expect(await kv1.get(key)).toBe("v1");
		expect(await kv2.get(key)).toBe("v2");
	});
});

describe("Storely Generic Store Iterator", () => {
	test("should iterate, filter by namespace, and strip prefix", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);

		// No namespace
		const storely = new StorelyMemoryAdapter(store);
		const k1 = faker.string.uuid();
		const k2 = faker.string.uuid();
		await storely.set(k1, "v1");
		await storely.set(k2, "v2");
		const entries: Array<[string, unknown]> = [];
		for await (const entry of storely.iterator()) {
			entries.push(entry as [string, unknown]);
		}
		expect(entries.length).toBe(2);
		store.clear();

		// With namespace filtering
		const nsStorely = new StorelyMemoryAdapter(new Map(), { namespace: ns1 });
		const nk1 = faker.string.uuid();
		const nk2 = faker.string.uuid();
		await nsStorely.set(nk1, "v1");
		await nsStorely.set(nk2, "v2");
		nsStorely.store.set(`${ns2}:other`, { value: "other", expires: undefined });
		const nsEntries: Array<[string, unknown]> = [];
		for await (const entry of nsStorely.iterator()) {
			nsEntries.push(entry as [string, unknown]);
		}
		expect(nsEntries.length).toBe(2);
		// Keys should not have namespace prefix
		expect(nsEntries.map(([k]) => k).sort()).toEqual([nk1, nk2].sort());
	});

	test("should skip expired entries and delete them", async () => {
		const store = new Map();
		const storely = new StorelyMemoryAdapter(store);
		const k1 = faker.string.uuid();
		await storely.set(k1, "v1");
		store.set("expired", { value: "old", expires: Date.now() - 1000 });
		const entries: Array<[string, unknown]> = [];
		for await (const entry of storely.iterator()) {
			entries.push(entry as [string, unknown]);
		}
		expect(entries.length).toBe(1);
		expect(store.has("expired")).toBe(false);
	});

	test("should return empty iterator when store does not support entries", async () => {
		const customStore = {
			get: () => undefined,
			set: () => {},
			delete: () => true,
			clear: () => {},
			has: () => false,
		};
		const storely = new StorelyMemoryAdapter(customStore);
		const entries: unknown[] = [];
		for await (const entry of storely.iterator()) {
			entries.push(entry);
		}
		expect(entries.length).toBe(0);
	});

	test("should work with custom key separator", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const storely = new StorelyMemoryAdapter(store, { namespace: ns1, keySeparator: ":" });
		const k1 = faker.string.uuid();
		await storely.set(k1, "v1");
		store.set(`${ns2}:other`, { value: "other", expires: undefined });
		const entries: Array<[string, unknown]> = [];
		for await (const entry of storely.iterator()) {
			entries.push(entry as [string, unknown]);
		}
		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe(k1);
	});
});
