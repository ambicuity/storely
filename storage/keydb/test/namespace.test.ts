import { delay } from "@ambicuity/test-suite";
import { faker } from "@faker-js/faker";
import type { RedisClientType } from "@redis/client";
import { beforeEach, describe, expect, test } from "vitest";
import StorelyKeyDB from "../src/index.js";

describe("Namespace", () => {
	beforeEach(async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const client = (await storelyKeyDB.getClient()) as RedisClientType;
		await client.flushDb();
		await storelyKeyDB.disconnect();
	});

	test("if there is a namespace on key prefix", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.namespace = "ns1";
		const testKey = faker.string.uuid();
		const key = storelyKeyDB.createKeyPrefix(testKey, "ns2");
		expect(key).toBe(`ns2::${testKey}`);
	});

	test("if no namespace on key prefix and no default namespace", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.namespace = undefined;
		const testKey = faker.string.uuid();
		const key = storelyKeyDB.createKeyPrefix(testKey);
		expect(key).toBe(testKey);
	});

	test("should clear with no namespace", async () => {
		const storelyKeyDB = new StorelyKeyDB();
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

	test("should clear with no namespace and useUnlink to false", async () => {
		const storelyKeyDB = new StorelyKeyDB();
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
		const storelyKeyDB = new StorelyKeyDB();
		const client = (await storelyKeyDB.getClient()) as RedisClientType;
		await client.flushDb();
		const nsKey = faker.string.uuid();
		const nsVal = faker.lorem.word();
		const noNsKey1 = faker.string.uuid();
		const noNsKey2 = faker.string.uuid();
		const noNsVal1 = faker.lorem.word();
		const noNsVal2 = faker.lorem.word();
		storelyKeyDB.namespace = "ns1";
		await storelyKeyDB.set(nsKey, nsVal);
		storelyKeyDB.namespace = undefined;
		await storelyKeyDB.set(noNsKey1, noNsVal1);
		await storelyKeyDB.set(noNsKey2, noNsVal2);
		await storelyKeyDB.clear();
		storelyKeyDB.namespace = "ns1";
		const value = await storelyKeyDB.get(nsKey);
		expect(value).toBe(nsVal);
		await storelyKeyDB.disconnect();
	});

	test("should not clear all with no namespace if noNamespaceAffectsAll is false", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.noNamespaceAffectsAll = false;

		const nsKey = faker.string.uuid();
		const nsVal = faker.lorem.word();
		const noNsKey1 = faker.string.uuid();
		const noNsKey2 = faker.string.uuid();
		const noNsVal1 = faker.lorem.word();
		const noNsVal2 = faker.lorem.word();
		storelyKeyDB.namespace = "ns1";
		await storelyKeyDB.set(nsKey, nsVal);
		storelyKeyDB.namespace = undefined;
		await storelyKeyDB.set(noNsKey1, noNsVal1);
		await storelyKeyDB.set(noNsKey2, noNsVal2);
		await storelyKeyDB.clear();
		storelyKeyDB.namespace = "ns1";
		const value = await storelyKeyDB.get(nsKey);
		expect(value).toBeDefined();
	});

	test("should clear all with no namespace if noNamespaceAffectsAll is true", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.noNamespaceAffectsAll = true;

		const nsKey = faker.string.uuid();
		const nsVal = faker.lorem.word();
		const noNsKey1 = faker.string.uuid();
		const noNsKey2 = faker.string.uuid();
		const noNsVal1 = faker.lorem.word();
		const noNsVal2 = faker.lorem.word();
		storelyKeyDB.namespace = "ns1";
		await storelyKeyDB.set(nsKey, nsVal);
		storelyKeyDB.namespace = undefined;
		await storelyKeyDB.set(noNsKey1, noNsVal1);
		await storelyKeyDB.set(noNsKey2, noNsVal2);
		await storelyKeyDB.clear();
		storelyKeyDB.namespace = "ns1";
		const value = await storelyKeyDB.get(nsKey);
		expect(value).toBeUndefined();
	});

	test("should clear namespace but not other ones", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const client = (await storelyKeyDB.getClient()) as RedisClientType;
		await client.flushDb();
		const ns1Key = faker.string.uuid();
		const ns1Val = faker.lorem.word();
		const ns2Key = faker.string.uuid();
		const ns2Val = faker.lorem.word();
		storelyKeyDB.namespace = "ns1";
		await storelyKeyDB.set(ns1Key, ns1Val);
		storelyKeyDB.namespace = "ns2";
		await storelyKeyDB.set(ns2Key, ns2Val);
		await storelyKeyDB.clear();
		storelyKeyDB.namespace = "ns1";
		const value = await storelyKeyDB.get(ns1Key);
		expect(value).toBe(ns1Val);
		await storelyKeyDB.disconnect();
	});

	test("should be able to set many keys with namespace", async () => {
		const storelyKeyDB = new StorelyKeyDB("keydb://localhost:6378", {
			namespace: "ns-many1",
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await storelyKeyDB.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3, ttl: 5 },
		]);
		const value = await storelyKeyDB.get(key1);
		expect(value).toBe(val1);
		const value2 = await storelyKeyDB.get(key2);
		expect(value2).toBe(val2);
		await delay(10);
		const value3 = await storelyKeyDB.get(key3);
		expect(value3).toBeUndefined();
		await storelyKeyDB.disconnect();
	});

	test("should be able to has many keys with namespace", async () => {
		const storelyKeyDB = new StorelyKeyDB("keydb://localhost:6378", {
			namespace: "ns-many2",
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await storelyKeyDB.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3, ttl: 5 },
		]);
		await delay(10);
		const exists = await storelyKeyDB.hasMany([key1, key2, key3]);
		expect(exists).toEqual([true, true, false]);
		await storelyKeyDB.disconnect();
	});

	test("should be able to delete many with namespace", async () => {
		const storelyKeyDB = new StorelyKeyDB("keydb://localhost:6378", {
			namespace: "ns-dm1",
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await storelyKeyDB.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3, ttl: 5 },
		]);
		await storelyKeyDB.deleteMany([key2, key3]);
		await delay(10);
		const value = await storelyKeyDB.get(key1);
		expect(value).toBe(val1);
		const value2 = await storelyKeyDB.get(key2);
		expect(value2).toBeUndefined();
		const value3 = await storelyKeyDB.get(key3);
		expect(value3).toBeUndefined();
		await storelyKeyDB.disconnect();
	});
});
