import type StorelyModule from "@ambicuity/core";
import { faker } from "@faker-js/faker";
import type { StorelyStoreFn, TestFunction } from "./types.js";

const delay = async (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

/**
 * Registers Storely API tests: set, get, getMany, delete, deleteMany, clear, and has.
 * Tests operate through the Storely wrapper, not directly on the storage adapter.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param Storely - The Storely constructor
 * @param store - Factory that returns a fresh store instance per test
 */
const storelyApiTests = (
	test: TestFunction,
	Storely: typeof StorelyModule,
	store: StorelyStoreFn,
) => {
	test(".set(key, value) returns a Promise", (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		t.expect(storely.set(key, value) instanceof Promise).toBeTruthy();
	});

	test(".set(key, value) resolves to true", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		t.expect(await storely.set(key, value)).toBeTruthy();
	});

	test(".set(key, value) sets a value", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await storely.set(key, value);
		t.expect(await storely.get(key)).toBe(value);
	});

	test(".set(key, value, ttl) sets a value that expires", async (t) => {
		const ttl = 1000;
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await storely.set(key, value, ttl);
		t.expect(await storely.get(key)).toBe(value);
		await delay(ttl + 100);
		t.expect(await storely.get(key)).toBeUndefined();
	});

	test(".get(key) returns a Promise", (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(storely.get(key) instanceof Promise).toBeTruthy();
	});

	test(".get(key) resolves to value", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await storely.set(key, value);
		t.expect(await storely.get(key)).toBe(value);
	});

	test(".get(key) with nonexistent key resolves to undefined", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(await storely.get(key)).toBeUndefined();
	});

	test(".get([keys]) should return array values", async (t) => {
		const storely = new Storely({ store: store() });
		const ttl = 3000;
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await storely.set(key1, value1, ttl);
		await storely.set(key2, value2, ttl);
		await storely.set(key3, value3, ttl);
		const values = (await storely.get([key1, key2, key3])) as string[];
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBe(value1);
		t.expect(values[1]).toBe(value2);
		t.expect(values[2]).toBe(value3);
	});

	test(".get([keys]) should return array value undefined when expires", async (t) => {
		const storely = new Storely({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await storely.set(key1, value1);
		await storely.set(key2, value2, 1000);
		await storely.set(key3, value3);
		await delay(1100);
		const values = await storely.get([key1, key2, key3]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBe(value1);
		t.expect(values[1]).toBeUndefined();
		t.expect(values[2]).toBe(value3);
	});

	test(".get([keys]) should return array values with undefined", async (t) => {
		const storely = new Storely({ store: store() });
		const ttl = 3000;
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await storely.set(key1, value1, ttl);
		await storely.set(key3, value3, ttl);
		const values = (await storely.get([key1, key2, key3])) as string[] | undefined[];
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBe(value1);
		t.expect(values[1]).toBeUndefined();
		t.expect(values[2]).toBe(value3);
	});

	test(".get([keys]) should return undefined array for all no existent keys", async (t) => {
		const storely = new Storely({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const values = await storely.get([key1, key2, key3]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values).toEqual([undefined, undefined, undefined]);
	});

	test(".delete(key) returns a Promise", (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(storely.delete(key) instanceof Promise).toBeTruthy();
	});

	test(".delete([key]) returns a Promise", (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(storely.delete([key]) instanceof Promise).toBeTruthy();
	});

	test(".delete(key) resolves to true", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await storely.set(key, value);
		t.expect(await storely.delete(key)).toBeTruthy();
	});

	test(".delete(key) with nonexistent key resolves to false", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(await storely.delete(key)).toBeFalsy();
	});

	test(".delete(key) deletes a key", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await storely.set(key, value);
		t.expect(await storely.delete(key)).toBeTruthy();
		t.expect(await storely.get(key)).toBeUndefined();
	});

	test(".deleteMany([keys]) should delete multiple key", async (t) => {
		const storely = new Storely({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await storely.set(key1, value1);
		await storely.set(key2, value2);
		await storely.set(key3, value3);
		const result = await storely.delete([key1, key2, key3]);
		t.expect(Array.isArray(result)).toBe(true);
		t.expect(await storely.get(key1)).toBeUndefined();
		t.expect(await storely.get(key2)).toBeUndefined();
		t.expect(await storely.get(key3)).toBeUndefined();
	});

	test(".deleteMany([keys]) with nonexistent keys resolves to array of false", async (t) => {
		const storely = new Storely({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const result = await storely.delete([key1, key2, key3]);
		t.expect(Array.isArray(result)).toBe(true);
		t.expect((result as boolean[]).every((v) => v === false)).toBe(true);
	});

	test(".clear() returns a Promise", async (t) => {
		const storely = new Storely({ store: store() });
		const returnValue = storely.clear();
		t.expect(returnValue instanceof Promise).toBeTruthy();
		await returnValue;
	});

	test(".clear() resolves to undefined", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		t.expect(await storely.clear()).toBeUndefined();
		await storely.set(key, value);
		t.expect(await storely.clear()).toBeUndefined();
	});

	test(".clear() deletes all key/value pairs", async (t) => {
		const storely = new Storely({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		await storely.set(key1, value1);
		await storely.set(key2, value2);
		await storely.clear();
		t.expect(await storely.get(key1)).toBeUndefined();
		t.expect(await storely.get(key2)).toBeUndefined();
	});

	test(".has(key) where key is the key we are looking for", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		const nonExistentKey = faker.string.alphanumeric(10);
		await storely.set(key, value);
		t.expect(await storely.has(key)).toBeTruthy();
		t.expect(await storely.has(nonExistentKey)).toBeFalsy();
	});
};

export { storelyApiTests };
