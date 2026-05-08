import { faker } from "@faker-js/faker";
import type { RedisClientType } from "@redis/client";
import { delay } from "@storely/test-suite";
import { beforeEach, describe, expect, test } from "vitest";
import StorelyRedis from "../src/index.js";

describe("Namespace", () => {
	beforeEach(async () => {
		const storelyRedis = new StorelyRedis();
		const client = (await storelyRedis.getClient()) as RedisClientType;
		await client.flushDb();
		await storelyRedis.disconnect();
	});

	test("if there is a namespace on key prefix", async () => {
		const storelyRedis = new StorelyRedis();
		storelyRedis.namespace = "ns1";
		const testKey = faker.string.uuid();
		const key = storelyRedis.createKeyPrefix(testKey, "ns2");
		expect(key).toBe(`ns2::${testKey}`);
	});

	test("if no namespace on key prefix and no default namespace", async () => {
		const storelyRedis = new StorelyRedis();
		storelyRedis.namespace = undefined;
		const testKey = faker.string.uuid();
		const key = storelyRedis.createKeyPrefix(testKey);
		expect(key).toBe(testKey);
	});

	test("should clear with no namespace", async () => {
		const storelyRedis = new StorelyRedis();
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
		const storelyRedis = new StorelyRedis();
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
		const storelyRedis = new StorelyRedis();
		const client = (await storelyRedis.getClient()) as RedisClientType;
		await client.flushDb();
		const nsKey = faker.string.uuid();
		const nsVal = faker.lorem.word();
		const noNsKey1 = faker.string.uuid();
		const noNsKey2 = faker.string.uuid();
		const noNsVal1 = faker.lorem.word();
		const noNsVal2 = faker.lorem.word();
		storelyRedis.namespace = "ns1";
		await storelyRedis.set(nsKey, nsVal);
		storelyRedis.namespace = undefined;
		await storelyRedis.set(noNsKey1, noNsVal1);
		await storelyRedis.set(noNsKey2, noNsVal2);
		await storelyRedis.clear();
		storelyRedis.namespace = "ns1";
		const value = await storelyRedis.get(nsKey);
		expect(value).toBe(nsVal);
		await storelyRedis.disconnect();
	});

	test("should not clear all with no namespace if noNamespaceAffectsAll is false", async () => {
		const storelyRedis = new StorelyRedis();
		storelyRedis.noNamespaceAffectsAll = false;

		const nsKey = faker.string.uuid();
		const nsVal = faker.lorem.word();
		const noNsKey1 = faker.string.uuid();
		const noNsKey2 = faker.string.uuid();
		const noNsVal1 = faker.lorem.word();
		const noNsVal2 = faker.lorem.word();
		storelyRedis.namespace = "ns1";
		await storelyRedis.set(nsKey, nsVal);
		storelyRedis.namespace = undefined;
		await storelyRedis.set(noNsKey1, noNsVal1);
		await storelyRedis.set(noNsKey2, noNsVal2);
		await storelyRedis.clear();
		storelyRedis.namespace = "ns1";
		const value = await storelyRedis.get(nsKey);
		expect(value).toBeDefined();
	});

	test("should clear all with no namespace if noNamespaceAffectsAll is true", async () => {
		const storelyRedis = new StorelyRedis();
		storelyRedis.noNamespaceAffectsAll = true;

		const nsKey = faker.string.uuid();
		const nsVal = faker.lorem.word();
		const noNsKey1 = faker.string.uuid();
		const noNsKey2 = faker.string.uuid();
		const noNsVal1 = faker.lorem.word();
		const noNsVal2 = faker.lorem.word();
		storelyRedis.namespace = "ns1";
		await storelyRedis.set(nsKey, nsVal);
		storelyRedis.namespace = undefined;
		await storelyRedis.set(noNsKey1, noNsVal1);
		await storelyRedis.set(noNsKey2, noNsVal2);
		await storelyRedis.clear();
		storelyRedis.namespace = "ns1";
		const value = await storelyRedis.get(nsKey);
		expect(value).toBeUndefined();
	});

	test("should clear namespace but not other ones", async () => {
		const storelyRedis = new StorelyRedis();
		const client = (await storelyRedis.getClient()) as RedisClientType;
		await client.flushDb();
		const ns1Key = faker.string.uuid();
		const ns1Val = faker.lorem.word();
		const ns2Key = faker.string.uuid();
		const ns2Val = faker.lorem.word();
		storelyRedis.namespace = "ns1";
		await storelyRedis.set(ns1Key, ns1Val);
		storelyRedis.namespace = "ns2";
		await storelyRedis.set(ns2Key, ns2Val);
		await storelyRedis.clear();
		storelyRedis.namespace = "ns1";
		const value = await storelyRedis.get(ns1Key);
		expect(value).toBe(ns1Val);
		await storelyRedis.disconnect();
	});

	test("should be able to set many keys with namespace", async () => {
		const storelyRedis = new StorelyRedis("redis://localhost:6379", {
			namespace: "ns-many1",
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await storelyRedis.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3, ttl: 5 },
		]);
		const value = await storelyRedis.get(key1);
		expect(value).toBe(val1);
		const value2 = await storelyRedis.get(key2);
		expect(value2).toBe(val2);
		await delay(10);
		const value3 = await storelyRedis.get(key3);
		expect(value3).toBeUndefined();
		await storelyRedis.disconnect();
	});

	test("should be able to has many keys with namespace", async () => {
		const storelyRedis = new StorelyRedis("redis://localhost:6379", {
			namespace: "ns-many2",
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await storelyRedis.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3, ttl: 5 },
		]);
		await delay(10);
		const exists = await storelyRedis.hasMany([key1, key2, key3]);
		expect(exists).toEqual([true, true, false]);
		await storelyRedis.disconnect();
	});

	test("should be able to delete many with namespace", async () => {
		const storelyRedis = new StorelyRedis("redis://localhost:6379", {
			namespace: "ns-dm1",
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await storelyRedis.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3, ttl: 5 },
		]);
		await storelyRedis.deleteMany([key2, key3]);
		await delay(10);
		const value = await storelyRedis.get(key1);
		expect(value).toBe(val1);
		const value2 = await storelyRedis.get(key2);
		expect(value2).toBeUndefined();
		const value3 = await storelyRedis.get(key3);
		expect(value3).toBeUndefined();
		await storelyRedis.disconnect();
	});
});
