import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, test, vitest } from "vitest";
import StorelyRedis, { createCluster } from "../src/index.js";

const defaultClusterOptions = {
	rootNodes: [
		{
			url: "redis://localhost:7001",
		},
		{
			url: "redis://localhost:7002",
		},
		{
			url: "redis://localhost:7003",
		},
	],
	useReplicas: true,
};

describe("StorelyRedis Cluster", () => {
	beforeEach(async () => {
		const cluster = createCluster(defaultClusterOptions);
		const storelyRedis = new StorelyRedis(cluster);
		storelyRedis.noNamespaceAffectsAll = true;
		await storelyRedis.clear();
		await storelyRedis.disconnect();
	});

	test("should be able to connect to a cluster", async () => {
		const cluster = createCluster(defaultClusterOptions);

		const storelyRedis = new StorelyRedis(cluster);

		expect(storelyRedis).toBeDefined();
		expect(storelyRedis.client).toEqual(cluster);

		await storelyRedis.disconnect();
	});

	test("should be able to send in cluster options", async () => {
		const storelyRedis = new StorelyRedis(defaultClusterOptions);
		expect(storelyRedis.isCluster()).toBe(true);
	});

	test("should be able to set the redis cluster client", async () => {
		const cluster = createCluster(defaultClusterOptions);

		const storelyRedis = new StorelyRedis();
		expect(storelyRedis.isCluster()).toBe(false);

		storelyRedis.client = cluster;
		expect(storelyRedis.client).toEqual(cluster);
		expect(storelyRedis.isCluster()).toBe(true);

		await storelyRedis.disconnect();
	});

	test("should be able to set a value", async () => {
		const cluster = createCluster(defaultClusterOptions);

		const storelyRedis = new StorelyRedis(cluster);

		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await storelyRedis.delete(key);

		const undefinedResult = await storelyRedis.get(key);
		expect(undefinedResult).toBeUndefined();

		await storelyRedis.set(key, value);

		const result = await storelyRedis.get(key);

		expect(result).toBe(value);

		await storelyRedis.delete(key);

		await storelyRedis.disconnect();
	});

	test("should split getMany by slot to avoid CROSSSLOT errors", async () => {
		const cluster = createCluster(defaultClusterOptions);
		await cluster.connect();

		const spies = cluster.masters.map((master) => vitest.spyOn(master.client, "mGet"));

		const storelyRedis = new StorelyRedis(cluster);
		const keys = Array.from({ length: 4 }, () => faker.string.uuid());
		// These keys may hash to different slots, so multiple mGet calls may be needed
		await storelyRedis.getMany(keys);

		// Verify that mGet was called (may be multiple times per master if keys hash to different slots)
		let totalCalls = 0;
		spies.forEach((spy) => {
			totalCalls += spy.mock.calls.length;
		});

		// Should have made at least one call
		expect(totalCalls).toBeGreaterThan(0);

		// Each call should only contain keys from the same slot (no CROSSSLOT errors)
		// The test passes if no error was thrown during getMany
	});

	describe("StorelyRedis clear method", () => {
		test("should not throw an error on clear", async () => {
			const cluster = createCluster(defaultClusterOptions);

			const storelyRedis = new StorelyRedis(cluster);

			let errorThrown = false;
			try {
				await storelyRedis.clear();
			} catch (error) {
				console.log(error);
				expect(error).toBeDefined();
				errorThrown = true;
			}

			expect(errorThrown).toBe(false);

			await storelyRedis.disconnect();
		});

		test("should do nothing if no keys on clear", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);

			await storelyRedis.clear();
			storelyRedis.namespace = "ns1";
			await storelyRedis.clear();
			await storelyRedis.disconnect();
		});

		test("should clear with no namespace", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			const key1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();
			await storelyRedis.set(key1, val1);
			await storelyRedis.set(key2, val2);
			await storelyRedis.set(key3, val3);
			await storelyRedis.clear();
			const value = await storelyRedis.get(key1);
			expect(value).toBeUndefined();
			await storelyRedis.disconnect();
		});

		test("should clear with no namespace and useUnlink to false", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			storelyRedis.useUnlink = false;
			const key1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();
			await storelyRedis.set(key1, val1);
			await storelyRedis.set(key2, val2);
			await storelyRedis.set(key3, val3);
			await storelyRedis.clear();
			const value = await storelyRedis.get(key1);
			expect(value).toBeUndefined();
			await storelyRedis.disconnect();
		});

		test("should clear with no namespace but not the namespace ones", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			const nsKey = faker.string.uuid();
			const nsVal = faker.lorem.word();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();
			storelyRedis.namespace = "ns1";
			await storelyRedis.set(nsKey, nsVal);
			storelyRedis.namespace = undefined;
			await storelyRedis.set(key2, val2);
			await storelyRedis.set(key3, val3);
			await storelyRedis.clear();
			storelyRedis.namespace = "ns1";
			const value = await storelyRedis.get(nsKey);
			expect(value).toBe(nsVal);
			await storelyRedis.disconnect();
		});

		test("should not clear all with no namespace if noNamespaceAffectsAll is false", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			storelyRedis.noNamespaceAffectsAll = false;

			const nsKey = faker.string.uuid();
			const nsVal = faker.lorem.word();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();

			storelyRedis.namespace = "ns1";
			await storelyRedis.set(nsKey, nsVal);
			storelyRedis.namespace = undefined;
			await storelyRedis.set(key2, val2);
			await storelyRedis.set(key3, val3);
			await storelyRedis.clear();
			storelyRedis.namespace = "ns1";
			const value = await storelyRedis.get(nsKey);
			expect(value).toBeDefined();
		});

		test("should clear all with no namespace if noNamespaceAffectsAll is true", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			storelyRedis.noNamespaceAffectsAll = true;

			const nsKey = faker.string.uuid();
			const nsVal = faker.lorem.word();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();

			storelyRedis.namespace = "ns1";
			await storelyRedis.set(nsKey, nsVal);
			storelyRedis.namespace = undefined;
			await storelyRedis.set(key2, val2);
			await storelyRedis.set(key3, val3);
			await storelyRedis.clear();
			storelyRedis.namespace = "ns1";
			const value = await storelyRedis.get(nsKey);
			expect(value).toBeUndefined();
		});

		test("should clear namespace but not other ones", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			const key1 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const key2 = faker.string.uuid();
			const val2 = faker.lorem.word();
			storelyRedis.namespace = "ns1";
			await storelyRedis.set(key1, val1);
			storelyRedis.namespace = "ns2";
			await storelyRedis.set(key2, val2);
			await storelyRedis.clear();
			storelyRedis.namespace = "ns1";
			const value = await storelyRedis.get(key1);
			expect(value).toBe(val1);
			await storelyRedis.disconnect();
		});
	});

	describe("StorelyRedis Iterators", () => {
		test("should no throw an error on iterator", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);

			const iteratorNamespace = faker.string.uuid();
			let errorThrown = false;
			try {
				const keys = [];
				const values = [];
				for await (const [key, value] of storelyRedis.iterator(iteratorNamespace)) {
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
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			const iterKey1 = faker.string.uuid();
			const iterKey2 = faker.string.uuid();
			const iterKey3 = faker.string.uuid();
			const iterVal1 = faker.lorem.word();
			const iterVal2 = faker.lorem.word();
			const iterVal3 = faker.lorem.word();
			await storelyRedis.set(iterKey1, iterVal1);
			await storelyRedis.set(iterKey2, iterVal2);
			await storelyRedis.set(iterKey3, iterVal3);
			const keys = [];
			for await (const [key] of storelyRedis.iterator()) {
				keys.push(key);
			}

			expect(keys).toContain(iterKey1);
			expect(keys).toContain(iterKey2);
			expect(keys).toContain(iterKey3);
			await storelyRedis.disconnect();
		});

		test("should be able to iterate over keys by namespace", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			const namespace = "ns1";
			const noNsKey1 = faker.string.uuid();
			const noNsKey2 = faker.string.uuid();
			const noNsKey3 = faker.string.uuid();
			const noNsVal1 = faker.lorem.word();
			const noNsVal2 = faker.lorem.word();
			const noNsVal3 = faker.lorem.word();
			await storelyRedis.set(noNsKey1, noNsVal1);
			await storelyRedis.set(noNsKey2, noNsVal2);
			await storelyRedis.set(noNsKey3, noNsVal3);
			storelyRedis.namespace = namespace;
			const nsKey1 = faker.string.uuid();
			const nsKey2 = faker.string.uuid();
			const nsKey3 = faker.string.uuid();
			const nsVal1 = faker.lorem.word();
			const nsVal2 = faker.lorem.word();
			const nsVal3 = faker.lorem.word();
			await storelyRedis.set(nsKey1, nsVal1);
			await storelyRedis.set(nsKey2, nsVal2);
			await storelyRedis.set(nsKey3, nsVal3);
			const keys = [];
			const values = [];
			for await (const [key, value] of storelyRedis.iterator(namespace)) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain(nsKey1);
			expect(keys).toContain(nsKey2);
			expect(keys).toContain(nsKey3);
			expect(values).toContain(nsVal1);
			expect(values).toContain(nsVal2);
			expect(values).toContain(nsVal3);

			await storelyRedis.disconnect();
		});

		test("should be able to iterate over all keys if namespace is undefined and noNamespaceAffectsAll is true", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			storelyRedis.noNamespaceAffectsAll = true;

			const key1 = faker.string.uuid();
			const val1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const val2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val3 = faker.string.uuid();

			storelyRedis.namespace = "ns1";
			await storelyRedis.set(key1, val1);
			storelyRedis.namespace = "ns2";
			await storelyRedis.set(key2, val2);
			storelyRedis.namespace = undefined;
			await storelyRedis.set(key3, val3);

			const keys = [];
			const values = [];
			for await (const [key, value] of storelyRedis.iterator()) {
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

		test("should only iterate over keys with no namespace if name is undefined set and noNamespaceAffectsAll is false", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);
			storelyRedis.noNamespaceAffectsAll = false;

			const key1 = faker.string.uuid();
			const val1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const val2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val3 = faker.string.uuid();

			storelyRedis.namespace = "ns1";
			await storelyRedis.set(key1, val1);
			storelyRedis.namespace = "ns2";
			await storelyRedis.set(key2, val2);
			storelyRedis.namespace = undefined;
			await storelyRedis.set(key3, val3);

			const keys = [];
			const values = [];
			for await (const [key, value] of storelyRedis.iterator()) {
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

	describe("StorelyRedis Batch Operations", () => {
		test("setMany should work with cluster mode without CROSSSLOT errors", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);

			// These keys may hash to different slots
			const entries = Array.from({ length: 5 }, () => ({
				key: faker.string.uuid(),
				value: faker.lorem.word(),
			}));

			// Should not throw CROSSSLOT error
			await expect(storelyRedis.setMany(entries)).resolves.toEqual(entries.map(() => true));

			// Verify all keys were set
			const values = await storelyRedis.getMany(entries.map((e) => e.key));
			expect(values).toEqual(entries.map((e) => e.value));

			await storelyRedis.disconnect();
		});

		test("hasMany should work with cluster mode without CROSSSLOT errors", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);

			// Set some keys first
			const setKeys = Array.from({ length: 3 }, () => faker.string.uuid());
			const setValues = Array.from({ length: 3 }, () => faker.lorem.word());
			await storelyRedis.set(setKeys[0], setValues[0]);
			await storelyRedis.set(setKeys[1], setValues[1]);
			await storelyRedis.set(setKeys[2], setValues[2]);

			// Check multiple keys that may hash to different slots
			const missingKeys = Array.from({ length: 2 }, () => faker.string.uuid());
			const keys = [...setKeys, ...missingKeys];

			// Should not throw CROSSSLOT error
			const results = await storelyRedis.hasMany(keys);
			expect(results).toEqual([true, true, true, false, false]);

			await storelyRedis.disconnect();
		});

		test("deleteMany should work with cluster mode without CROSSSLOT errors", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);

			// Set some keys first
			const allKeys = Array.from({ length: 5 }, () => faker.string.uuid());
			const allValues = Array.from({ length: 5 }, () => faker.lorem.word());
			for (let i = 0; i < 5; i++) {
				await storelyRedis.set(allKeys[i], allValues[i]);
			}

			// Delete first 3 keys
			const keysToDelete = allKeys.slice(0, 3);

			// Should not throw CROSSSLOT error
			const result = await storelyRedis.deleteMany(keysToDelete);
			expect(result).toEqual([true, true, true]);

			// Verify keys were deleted
			const hasKeys = await storelyRedis.hasMany(allKeys);
			expect(hasKeys).toEqual([false, false, false, true, true]);

			await storelyRedis.disconnect();
		});

		test("setMany with TTL should work with cluster mode", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster);

			// These keys may hash to different slots
			const entries = Array.from({ length: 3 }, () => ({
				key: faker.string.uuid(),
				value: faker.lorem.word(),
				ttl: 5000,
			}));

			// Should not throw CROSSSLOT error
			await expect(storelyRedis.setMany(entries)).resolves.toEqual(entries.map(() => true));

			// Verify all keys were set
			const values = await storelyRedis.getMany(entries.map((e) => e.key));
			expect(values).toEqual(entries.map((e) => e.value));

			await storelyRedis.disconnect();
		});

		test("deleteMany with useUnlink false should work with cluster mode", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const storelyRedis = new StorelyRedis(cluster, { useUnlink: false });

			// Set some keys first that may hash to different slots
			const allKeys = Array.from({ length: 5 }, () => faker.string.uuid());
			const allValues = Array.from({ length: 5 }, () => faker.lorem.word());
			for (let i = 0; i < 5; i++) {
				await storelyRedis.set(allKeys[i], allValues[i]);
			}

			// Delete first 3 keys using del instead of unlink
			const keysToDelete = allKeys.slice(0, 3);

			// Should not throw CROSSSLOT error and should use del command
			const result = await storelyRedis.deleteMany(keysToDelete);
			expect(result).toEqual([true, true, true]);

			// Verify keys were deleted
			const hasKeys = await storelyRedis.hasMany(allKeys);
			expect(hasKeys).toEqual([false, false, false, true, true]);

			await storelyRedis.disconnect();
		});
	});
});
