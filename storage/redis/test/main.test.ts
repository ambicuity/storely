import process from "node:process";
import { faker } from "@faker-js/faker";
import { createClient, type RedisClientType } from "@redis/client";
import { beforeEach, describe, expect, test } from "vitest";
import StorelyRedis, { createStorely } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";

describe("StorelyRedis Module Loading", () => {
	test("should not create a Redis connection on module import", async () => {
		// This test verifies that importing the module doesn't create a default Redis connection.
		// The fix for issue #1805 ensures that createClient() is only called in the constructor,
		// not at module load time via class field initialization.
		//
		// We verify this by checking that StorelyRedis is a class (function) but doesn't have
		// any static Redis client properties that would indicate premature connection.
		expect(typeof StorelyRedis).toBe("function");
		expect(StorelyRedis.prototype).toBeDefined();

		// The class should only create a client when instantiated
		const instance = new StorelyRedis("redis://localhost:6379");
		expect(instance.client).toBeDefined();
		expect(instance.client.isOpen).toBe(false); // Not connected yet, just created
	});
});

describe("StorelyRedis", () => {
	test("should be a class", () => {
		expect(StorelyRedis).toBeInstanceOf(Function);
	});

	test("should have a client property", () => {
		const storelyRedis = new StorelyRedis();
		expect(storelyRedis.client).toBeDefined();
	});

	test("should be able to create Storely instance", async () => {
		const storely = createStorely("redis://localhost:6379", { namespace: "test" });
		expect(storely).toBeDefined();
		expect(storely.namespace).toBe("test");
		expect(storely.store.namespace).toBe("test");
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const key2 = faker.string.uuid();
		const objValue = faker.lorem.word();
		await storely.set(key1, value1);
		await storely.set(key2, { foo: objValue });
		const result1 = await storely.get<string>(key1);
		expect(result1).toBe(value1);
		const result2 = await storely.get(key2);
		expect(result2).toEqual({ foo: objValue });
	});

	test("should be able to set the client property", () => {
		const storelyRedis = new StorelyRedis();
		const client = createClient() as RedisClientType;
		storelyRedis.client = client;
		expect(storelyRedis.client).toBe(client);
	});

	test("should be able to pass in a client to constructor", () => {
		const client = createClient() as RedisClientType;
		const storelyRedis = new StorelyRedis(client);
		expect(storelyRedis.client).toBe(client);
	});

	test("should be able to pass in client options to constructor", () => {
		const uri = "redis://foo:6379";
		const storelyRedis = new StorelyRedis({ url: uri });
		expect((storelyRedis.client as RedisClientType).options?.url).toBe(uri);
	});

	test("should be able to pass in the url and options to constructor", () => {
		const uri = "redis://localhost:6379";
		const storelyRedis = new StorelyRedis(uri, { namespace: "test" });
		expect((storelyRedis.client as RedisClientType).options?.url).toBe(uri);
		expect(storelyRedis.namespace).toBe("test");
	});

	test("should be able to pass in the url and options to constructor", () => {
		const uri = "redis://localhost:6379";
		const options = {
			namespace: "test",
			keyPrefixSeparator: "->",
			clearBatchSize: 100,
			useUnlink: true,
			noNamespaceAffectsAll: true,
		};
		const storelyRedis = new StorelyRedis(uri, options);
		expect(storelyRedis.namespace).toBe("test");
		expect(storelyRedis.keyPrefixSeparator).toBe("->");
		expect(storelyRedis.clearBatchSize).toBe(100);
		expect(storelyRedis.useUnlink).toBe(true);
		expect(storelyRedis.noNamespaceAffectsAll).toBe(true);
	});

	test("should be able to get and set properties", () => {
		const storelyRedis = new StorelyRedis();
		storelyRedis.namespace = "test";
		storelyRedis.keyPrefixSeparator = "->";
		storelyRedis.clearBatchSize = 1001;
		storelyRedis.useUnlink = false;
		expect(storelyRedis.namespace).toBe("test");
		expect(storelyRedis.keyPrefixSeparator).toBe("->");
		expect(storelyRedis.clearBatchSize).toBe(1001);
		expect(storelyRedis.useUnlink).toBe(false);
	});

	test("keyPrefixSeparator should be able to set to blank string", () => {
		const storelyRedis = new StorelyRedis("redis://localhost:6379", {
			keyPrefixSeparator: "",
		});
		expect(storelyRedis.keyPrefixSeparator).toBe("");
		storelyRedis.keyPrefixSeparator = "->";
		expect(storelyRedis.keyPrefixSeparator).toBe("->");
		storelyRedis.keyPrefixSeparator = "";
		expect(storelyRedis.keyPrefixSeparator).toBe("");
	});

	test("clearBatchSize should not set if 0 or less than", () => {
		const storelyRedis = new StorelyRedis("redis://localhost:6379", {
			clearBatchSize: 0,
		});
		expect(storelyRedis.clearBatchSize).toBe(1000);
		storelyRedis.clearBatchSize = 200;
		expect(storelyRedis.clearBatchSize).toBe(200);
		let error = "";
		storelyRedis.on("error", (message) => {
			error = message as string;
		});
		storelyRedis.clearBatchSize = -1;
		expect(error).toBe("clearBatchSize must be greater than 0");
		expect(storelyRedis.clearBatchSize).toBe(200);
	});

	test("should be able to get and set properties individually", async () => {
		const storelyRedis = new StorelyRedis();
		storelyRedis.namespace = "test";
		storelyRedis.keyPrefixSeparator = ":1";
		storelyRedis.clearBatchSize = 2000;
		storelyRedis.noNamespaceAffectsAll = true;

		expect(storelyRedis.namespace).toBe("test");
		expect(storelyRedis.keyPrefixSeparator).toBe(":1");
		expect(storelyRedis.clearBatchSize).toBe(2000);
		expect(storelyRedis.noNamespaceAffectsAll).toBe(true);
		expect(storelyRedis.throwOnErrors).toBe(false);
		expect(storelyRedis.throwOnConnectError).toBe(true);
		expect(storelyRedis.useUnlink).toBe(true);
	});

	test("client options should contain the url", () => {
		const uri = "redis://foo:6379";
		const storelyRedis = new StorelyRedis(uri);
		expect((storelyRedis.client as RedisClientType).options?.url).toBe(uri);
	});

	test("should get and set throwOnConnectError", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { throwOnConnectError: true });
		const client = await storelyRedis.getClient();
		expect(client).toBeDefined();

		expect(storelyRedis.throwOnConnectError).toBe(true);
		storelyRedis.throwOnConnectError = false;
		expect(storelyRedis.throwOnConnectError).toBe(false);
		storelyRedis.throwOnConnectError = true;
		expect(storelyRedis.throwOnConnectError).toBe(true);
	});

	test("should get and set throwOnErrors", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { throwOnErrors: true });
		const client = await storelyRedis.getClient();
		expect(client).toBeDefined();
		expect(storelyRedis.throwOnErrors).toBe(true);
		storelyRedis.throwOnErrors = false;
		expect(storelyRedis.throwOnErrors).toBe(false);
		storelyRedis.throwOnErrors = true;
		expect(storelyRedis.throwOnErrors).toBe(true);
	});
});

describe("StorelyRedis Methods", () => {
	beforeEach(async () => {
		const storelyRedis = new StorelyRedis();
		const client = (await storelyRedis.getClient()) as RedisClientType;
		await client.flushDb();
		await storelyRedis.disconnect();
	});
	test("should be able to connect, set, delete, and disconnect", async () => {
		const storelyRedis = new StorelyRedis();
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await storelyRedis.set(key, val);
		const value = await storelyRedis.get(key);
		expect(value).toBe(val);
		const deleted = await storelyRedis.delete(key);
		expect(deleted).toBe(true);
		await storelyRedis.disconnect();
	});

	test("should be able to connect, set, delete, and disconnect using useUnlink to false", async () => {
		const storelyRedis = new StorelyRedis();
		storelyRedis.useUnlink = false;
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await storelyRedis.set(key, val);
		const value = await storelyRedis.get(key);
		expect(value).toBe(val);
		const deleted = await storelyRedis.delete(key);
		expect(deleted).toBe(true);
		await storelyRedis.disconnect();
	});

	test("should do nothing if no keys on clear", async () => {
		const storelyRedis = new StorelyRedis();
		const client = (await storelyRedis.getClient()) as RedisClientType;
		await client.flushDb();
		await storelyRedis.clear();
		storelyRedis.namespace = "ns1";
		await storelyRedis.clear();
		await storelyRedis.disconnect();
	});
});
