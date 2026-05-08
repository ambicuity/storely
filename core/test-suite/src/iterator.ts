import { faker } from "@faker-js/faker";
import type StorelyModule from "storely";
import { delay } from "./helper.js";
import type { StorelyStoreFn, TestFunction } from "./types.js";

/**
 * Registers Storely iterator tests: async iterator protocol, iterating all values,
 * namespace filtering, and expired value handling.
 * Tests operate through the Storely wrapper.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param Storely - The Storely constructor
 * @param store - Factory that returns a fresh store instance per test
 */
const storelyIteratorTests = (
	test: TestFunction,
	Storely: typeof StorelyModule,
	store: StorelyStoreFn,
) => {
	test(".iterator() returns an asyncIterator", (t) => {
		const storely = new Storely({ store: store() });
		t.expect(typeof storely.iterator()[Symbol.asyncIterator]).toBe("function");
	});

	test("iterator() iterates over all values", async (t) => {
		const namespace = faker.string.alphanumeric(8);
		const storely = new Storely({ store: store(), namespace });
		const map = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map) {
			toResolve.push(storely.set(key, value));
		}

		await Promise.all(toResolve);
		let count = 0;
		for await (const [key, value] of storely.iterator(namespace)) {
			const doesKeyExist = map.has(key);
			const isValueSame = map.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
			count++;
		}

		t.expect(count).toBe(map.size);
	});

	test("iterator() doesn't yield values from other namespaces", async (t) => {
		const storelyStore = store();

		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);

		const storely1 = new Storely({ store: storelyStore, namespace: ns1 });
		const map1 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(storely1.set(key, value));
		}

		await Promise.all(toResolve);

		const storely2 = new Storely({ store: storelyStore, namespace: ns2 });
		const map2 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), String(i + 11)]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(storely2.set(key, value));
		}

		await Promise.all(toResolve);
		let count = 0;
		for await (const [key, value] of storely2.iterator(ns2)) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
			count++;
		}

		t.expect(count).toBe(map2.size);
	});

	test("iterator() doesn't yield expired values, and deletes them", async (t) => {
		const namespace = faker.string.alphanumeric(8);
		const storely = new Storely({ store: store(), namespace });

		// Create 5 unique key-value pairs that will expire
		const expiringKey1 = faker.string.alphanumeric(10);
		const expiringValue1 = faker.lorem.sentence();
		const expiringKey2 = faker.string.alphanumeric(10);
		const expiringValue2 = faker.lorem.sentence();
		const expiringKey3 = faker.string.alphanumeric(10);
		const expiringValue3 = faker.lorem.sentence();
		const expiringKey4 = faker.string.alphanumeric(10);
		const expiringValue4 = faker.lorem.sentence();
		const expiringKey5 = faker.string.alphanumeric(10);
		const expiringValue5 = faker.lorem.sentence();

		// Create a non-expiring key-value pair
		const nonExpiringKey = faker.string.alphanumeric(10);
		const nonExpiringValue = faker.lorem.sentence();

		// Set expiring keys with 100ms TTL
		await storely.set(expiringKey1, expiringValue1, 100);
		await storely.set(expiringKey2, expiringValue2, 100);
		await storely.set(expiringKey3, expiringValue3, 100);
		await storely.set(expiringKey4, expiringValue4, 100);
		await storely.set(expiringKey5, expiringValue5, 100);

		// Set non-expiring key
		await storely.set(nonExpiringKey, nonExpiringValue);

		await delay(300);
		const iterator = storely.iterator(namespace);

		// Collect all yielded entries
		const keys: string[] = [];
		const values: string[] = [];
		for await (const [key, value] of iterator) {
			keys.push(key);
			values.push(value as string);
		}

		// Should only yield the non-expired key
		t.expect(keys.length).toBe(1);
		t.expect(keys).toContain(nonExpiringKey);
		t.expect(values).toContain(nonExpiringValue);
	});
};

export { storelyIteratorTests };
