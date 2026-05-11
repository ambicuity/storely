import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, test } from "vitest";
import StorelyKeyDB, { createSentinel } from "../src/index.js";

// Sentinel tests require docker-compose-redis-sentinel.yaml to be running
// (sentinels on 26379/26380/26381). Gate behind STORELY_KEYDB_SENTINEL=1
// so the default `pnpm test:ci` doesn't hang waiting on missing infra.
// To run: STORELY_KEYDB_SENTINEL=1 pnpm test:ci.
const describeSentinel = process.env.STORELY_KEYDB_SENTINEL === "1" ? describe : describe.skip;

const defaultSentinelOptions = {
	name: "mymaster",
	sentinelRootNodes: [
		{
			host: "localhost",
			port: 26_379,
		},
		{
			host: "localhost",
			port: 26_380,
		},
		{
			host: "localhost",
			port: 26_381,
		},
	],
};

describeSentinel("StorelyKeyDB Sentinel", () => {
	beforeEach(async () => {
		const sentinel = createSentinel(defaultSentinelOptions);
		const storelyKeyDB = new StorelyKeyDB(sentinel);
		storelyKeyDB.noNamespaceAffectsAll = true;
		await storelyKeyDB.clear();
		await storelyKeyDB.disconnect();
	});

	test("should be able to connect to a sentinel", async () => {
		const sentinel = createSentinel(defaultSentinelOptions);

		const storelyKeyDB = new StorelyKeyDB(sentinel);

		expect(storelyKeyDB).toBeDefined();
		expect(storelyKeyDB.client).toEqual(sentinel);

		await storelyKeyDB.disconnect();
	});

	test("should be able to send in sentinel options", async () => {
		const storelyKeyDB = new StorelyKeyDB(defaultSentinelOptions);
		expect(storelyKeyDB.isSentinel()).toBe(true);
	});

	test("should be able to set the keydb sentinel client", async () => {
		const sentinel = createSentinel(defaultSentinelOptions);

		const storelyKeyDB = new StorelyKeyDB();
		expect(storelyKeyDB.isSentinel()).toBe(false);

		storelyKeyDB.client = sentinel;
		expect(storelyKeyDB.client).toEqual(sentinel);
		expect(storelyKeyDB.isSentinel()).toBe(true);

		await storelyKeyDB.disconnect();
	});

	test("should be able to set a value", async () => {
		const sentinel = createSentinel(defaultSentinelOptions);

		const storelyKeyDB = new StorelyKeyDB(sentinel);

		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await storelyKeyDB.delete(key);

		const undefinedResult = await storelyKeyDB.get(key);
		expect(undefinedResult).toBeUndefined();

		await storelyKeyDB.set(key, value);

		const result = await storelyKeyDB.get(key);

		expect(result).toBe(value);

		await storelyKeyDB.delete(key);

		await storelyKeyDB.disconnect();
	});

	describe("StorelyKeyDB clear method", () => {
		test("should not throw an error on clear", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);

			const storelyKeyDB = new StorelyKeyDB(sentinel);

			let errorThrown = false;
			try {
				await storelyKeyDB.clear();
			} catch (error) {
				console.log(error);
				expect(error).toBeDefined();
				errorThrown = true;
			}

			expect(errorThrown).toBe(false);

			await storelyKeyDB.disconnect();
		});

		test("should do nothing if no keys on clear", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);

			await storelyKeyDB.clear();
			storelyKeyDB.namespace = "ns1";
			await storelyKeyDB.clear();
			await storelyKeyDB.disconnect();
		});

		test("should clear with no namespace", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			const key1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();
			await storelyKeyDB.set(key1, val1);
			await storelyKeyDB.set(key2, val2);
			await storelyKeyDB.set(key3, val3);
			await storelyKeyDB.clear();
			const value = await storelyKeyDB.get(key1);
			expect(value).toBeUndefined();
			await storelyKeyDB.disconnect();
		});

		test("should clear with no namespace and useUnlink set to false", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			storelyKeyDB.useUnlink = false;
			const key1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();
			await storelyKeyDB.set(key1, val1);
			await storelyKeyDB.set(key2, val2);
			await storelyKeyDB.set(key3, val3);
			await storelyKeyDB.clear();
			const value = await storelyKeyDB.get(key1);
			expect(value).toBeUndefined();
			await storelyKeyDB.disconnect();
		});

		test("should clear with no namespace but not the namespace ones", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			const key1 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const key2 = faker.string.uuid();
			const val2 = faker.lorem.word();
			const key3 = faker.string.uuid();
			const val3 = faker.lorem.word();
			storelyKeyDB.namespace = "ns1";
			await storelyKeyDB.set(key1, val1);
			storelyKeyDB.namespace = undefined;
			await storelyKeyDB.set(key2, val2);
			await storelyKeyDB.set(key3, val3);
			await storelyKeyDB.clear();
			storelyKeyDB.namespace = "ns1";
			const value = await storelyKeyDB.get(key1);
			expect(value).toBe(val1);
			await storelyKeyDB.disconnect();
		});

		test("should not clear all with no namespace if noNamespaceAffectsAll is false", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			storelyKeyDB.noNamespaceAffectsAll = false;

			const key1 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const key2 = faker.string.uuid();
			const val2 = faker.lorem.word();
			const key3 = faker.string.uuid();
			const val3 = faker.lorem.word();
			storelyKeyDB.namespace = "ns1";
			await storelyKeyDB.set(key1, val1);
			storelyKeyDB.namespace = undefined;
			await storelyKeyDB.set(key2, val2);
			await storelyKeyDB.set(key3, val3);
			await storelyKeyDB.clear();
			storelyKeyDB.namespace = "ns1";
			const value = await storelyKeyDB.get(key1);
			expect(value).toBeDefined();
		});

		test("should clear all with no namespace if noNamespaceAffectsAll is true", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			storelyKeyDB.noNamespaceAffectsAll = true;

			const key1 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const key2 = faker.string.uuid();
			const val2 = faker.lorem.word();
			const key3 = faker.string.uuid();
			const val3 = faker.lorem.word();
			storelyKeyDB.namespace = "ns1";
			await storelyKeyDB.set(key1, val1);
			storelyKeyDB.namespace = undefined;
			await storelyKeyDB.set(key2, val2);
			await storelyKeyDB.set(key3, val3);
			await storelyKeyDB.clear();
			storelyKeyDB.namespace = "ns1";
			const value = await storelyKeyDB.get(key1);
			expect(value).toBeUndefined();
		});

		test("should clear namespace but not other ones", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			const key1 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const key2 = faker.string.uuid();
			const val2 = faker.lorem.word();
			storelyKeyDB.namespace = "ns1";
			await storelyKeyDB.set(key1, val1);
			storelyKeyDB.namespace = "ns2";
			await storelyKeyDB.set(key2, val2);
			await storelyKeyDB.clear();
			storelyKeyDB.namespace = "ns1";
			const value = await storelyKeyDB.get(key1);
			expect(value).toBe(val1);
			await storelyKeyDB.disconnect();
		});
	});

	describe("StorelyKeyDB Iterators", () => {
		test("should not throw an error on iterator", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			const iteratorNamespace = faker.string.uuid();
			storelyKeyDB.namespace = iteratorNamespace;

			let errorThrown = false;
			try {
				const keys = [];
				const values = [];
				for await (const [key, value] of storelyKeyDB.iterator()) {
					keys.push(key);
					values.push(value);
				}
			} catch (error) {
				console.log(error);
				expect(error).toBeDefined();
				errorThrown = true;
			}

			expect(errorThrown).toBe(false);
		});

		test("should be able to iterate over keys", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			const key1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();
			await storelyKeyDB.set(key1, val1);
			await storelyKeyDB.set(key2, val2);
			await storelyKeyDB.set(key3, val3);
			const keys = [];
			for await (const [key] of storelyKeyDB.iterator()) {
				keys.push(key);
			}

			expect(keys).toContain(key1);
			expect(keys).toContain(key2);
			expect(keys).toContain(key3);
			await storelyKeyDB.disconnect();
		});

		test("should be able to iterate over keys by namespace", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			const namespace = "ns1";
			const noNsKey1 = faker.string.uuid();
			const noNsKey2 = faker.string.uuid();
			const noNsKey3 = faker.string.uuid();
			const noNsVal1 = faker.lorem.word();
			const noNsVal2 = faker.lorem.word();
			const noNsVal3 = faker.lorem.word();
			await storelyKeyDB.set(noNsKey1, noNsVal1);
			await storelyKeyDB.set(noNsKey2, noNsVal2);
			await storelyKeyDB.set(noNsKey3, noNsVal3);
			storelyKeyDB.namespace = namespace;
			const nsKey1 = faker.string.uuid();
			const nsKey2 = faker.string.uuid();
			const nsKey3 = faker.string.uuid();
			const nsVal1 = faker.lorem.word();
			const nsVal2 = faker.lorem.word();
			const nsVal3 = faker.lorem.word();
			await storelyKeyDB.set(nsKey1, nsVal1);
			await storelyKeyDB.set(nsKey2, nsVal2);
			await storelyKeyDB.set(nsKey3, nsVal3);
			const keys = [];
			const values = [];
			for await (const [key, value] of storelyKeyDB.iterator()) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain(nsKey1);
			expect(keys).toContain(nsKey2);
			expect(keys).toContain(nsKey3);
			expect(values).toContain(nsVal1);
			expect(values).toContain(nsVal2);
			expect(values).toContain(nsVal3);

			await storelyKeyDB.disconnect();
		});

		test("should be able to iterate over all keys if namespace is undefined and noNamespaceAffectsAll is true", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			storelyKeyDB.noNamespaceAffectsAll = true;

			const key1 = faker.string.uuid();
			const val1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const val2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val3 = faker.string.uuid();
			storelyKeyDB.namespace = "ns1";
			await storelyKeyDB.set(key1, val1);
			storelyKeyDB.namespace = "ns2";
			await storelyKeyDB.set(key2, val2);
			storelyKeyDB.namespace = undefined;
			await storelyKeyDB.set(key3, val3);

			const keys = [];
			const values = [];
			for await (const [key, value] of storelyKeyDB.iterator()) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain(`ns1::${key1}`);
			expect(keys).toContain(`ns2::${key2}`);
			expect(keys).toContain(key3);
			expect(values).toContain(val1);
			expect(values).toContain(val2);
			expect(values).toContain(val3);
		});

		test("should only iterate over keys with no namespace if namespace is undefined and noNamespaceAffectsAll is false", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const storelyKeyDB = new StorelyKeyDB(sentinel);
			storelyKeyDB.noNamespaceAffectsAll = false;

			const key1 = faker.string.uuid();
			const val1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const val2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val3 = faker.string.uuid();

			storelyKeyDB.namespace = "ns1";
			await storelyKeyDB.set(key1, val1);
			storelyKeyDB.namespace = "ns2";
			await storelyKeyDB.set(key2, val2);
			storelyKeyDB.namespace = undefined;
			await storelyKeyDB.set(key3, val3);

			const keys = [];
			const values = [];
			for await (const [key, value] of storelyKeyDB.iterator()) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain(key3);
			expect(values).toContain(val3);

			expect(keys).not.toContain(key1);
			expect(keys).not.toContain(`ns1::${key1}`);
			expect(keys).not.toContain(`ns2::${key2}`);
			expect(keys).not.toContain(key2);
			expect(values).not.toContain(val1);
			expect(values).not.toContain(val2);
		});
	});
});
