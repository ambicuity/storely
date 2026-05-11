import type StorelyModule from "@ambicuity/storely-core";
import { faker } from "@faker-js/faker";
import type { StorelyStoreFn, TestFunction } from "./types.js";

/**
 * Registers Storely namespace isolation tests: verifies that namespaced set/get,
 * delete, and clear operations do not collide across namespaces.
 * Tests operate through the Storely wrapper.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param Storely - The Storely constructor
 * @param store - Factory that returns a fresh store instance per test
 */
const storelyNamespaceTests = (
	test: TestFunction,
	Storely: typeof StorelyModule,
	store: StorelyStoreFn,
) => {
	test("namespaced set/get don't collide", async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const storely1 = new Storely({ store: store(), namespace: ns1 });
		const storely2 = new Storely({ store: store(), namespace: ns2 });
		const key = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const value2 = faker.lorem.sentence();
		await storely1.set(key, value1);
		await storely2.set(key, value2);
		t.expect(await storely1.get(key)).toBe(value1);
		t.expect(await storely2.get(key)).toBe(value2);
	});

	test("namespaced delete only deletes from current namespace", async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const storely1 = new Storely({ store: store(), namespace: ns1 });
		const storely2 = new Storely({ store: store(), namespace: ns2 });
		const key = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const value2 = faker.lorem.sentence();
		await storely1.set(key, value1);
		await storely2.set(key, value2);
		t.expect(await storely1.delete(key)).toBe(true);
		t.expect(await storely1.get(key)).toBeUndefined();
		t.expect(await storely2.get(key)).toBe(value2);
	});

	test("namespaced clear only clears current namespace", async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const storely1 = new Storely({ store: store(), namespace: ns1 });
		const storely2 = new Storely({ store: store(), namespace: ns2 });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const value2 = faker.lorem.sentence();
		await storely1.set(key1, value1);
		await storely1.set(key2, value1);
		await storely2.set(key1, value2);
		await storely2.set(key2, value2);
		await storely1.clear();
		t.expect(await storely1.get(key1)).toBeUndefined();
		t.expect(await storely1.get(key2)).toBeUndefined();
		t.expect(await storely2.get(key1)).toBe(value2);
		t.expect(await storely2.get(key2)).toBe(value2);
	});
};

export { storelyNamespaceTests };
