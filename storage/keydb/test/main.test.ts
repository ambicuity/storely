import process from "node:process";
import { faker } from "@faker-js/faker";
import { createClient, type RedisClientType } from "@redis/client";
import { beforeEach, describe, expect, test } from "vitest";
import StorelyKeyDB, { createStorelyKeyDB } from "../src/index.js";

const keydbUri = process.env.KEYDB_URI ?? "keydb://localhost:6378";

describe("StorelyKeyDB Module Loading", () => {
	test("should not create a KeyDB connection on module import", async () => {
		expect(typeof StorelyKeyDB).toBe("function");
		expect(StorelyKeyDB.prototype).toBeDefined();

		const instance = new StorelyKeyDB("keydb://localhost:6378");
		expect(instance.client).toBeDefined();
		expect(instance.client.isOpen).toBe(false);
	});
});

describe("StorelyKeyDB", () => {
	test("should be a class", () => {
		expect(StorelyKeyDB).toBeInstanceOf(Function);
	});

	test("should have a client property", () => {
		const storelyKeyDB = new StorelyKeyDB();
		expect(storelyKeyDB.client).toBeDefined();
	});

	test("should be able to create Storely instance", async () => {
		const storely = createStorelyKeyDB("keydb://localhost:6378", { namespace: "test" });
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
		const storelyKeyDB = new StorelyKeyDB();
		const client = createClient() as RedisClientType;
		storelyKeyDB.client = client;
		expect(storelyKeyDB.client).toBe(client);
	});

	test("should be able to pass in a client to constructor", () => {
		const client = createClient() as RedisClientType;
		const storelyKeyDB = new StorelyKeyDB(client);
		expect(storelyKeyDB.client).toBe(client);
	});

	test("should be able to pass in client options to constructor", () => {
		const uri = "keydb://foo:6378";
		const storelyKeyDB = new StorelyKeyDB({ url: uri });
		expect((storelyKeyDB.client as RedisClientType).options?.url).toBe("redis://foo:6378");
	});

	test("should be able to pass in the url and options to constructor", () => {
		const uri = "keydb://localhost:6378";
		const storelyKeyDB = new StorelyKeyDB(uri, { namespace: "test" });
		expect((storelyKeyDB.client as RedisClientType).options?.url).toBe("redis://localhost:6378");
		expect(storelyKeyDB.namespace).toBe("test");
	});

	test("should be able to pass in the url and options to constructor", () => {
		const uri = "keydb://localhost:6378";
		const options = {
			namespace: "test",
			keyPrefixSeparator: "->",
			clearBatchSize: 100,
			useUnlink: true,
			noNamespaceAffectsAll: true,
		};
		const storelyKeyDB = new StorelyKeyDB(uri, options);
		expect(storelyKeyDB.namespace).toBe("test");
		expect(storelyKeyDB.keyPrefixSeparator).toBe("->");
		expect(storelyKeyDB.clearBatchSize).toBe(100);
		expect(storelyKeyDB.useUnlink).toBe(true);
		expect(storelyKeyDB.noNamespaceAffectsAll).toBe(true);
	});

	test("should be able to get and set properties", () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.namespace = "test";
		storelyKeyDB.keyPrefixSeparator = "->";
		storelyKeyDB.clearBatchSize = 1001;
		storelyKeyDB.useUnlink = false;
		expect(storelyKeyDB.namespace).toBe("test");
		expect(storelyKeyDB.keyPrefixSeparator).toBe("->");
		expect(storelyKeyDB.clearBatchSize).toBe(1001);
		expect(storelyKeyDB.useUnlink).toBe(false);
	});

	test("keyPrefixSeparator should be able to set to blank string", () => {
		const storelyKeyDB = new StorelyKeyDB("keydb://localhost:6378", {
			keyPrefixSeparator: "",
		});
		expect(storelyKeyDB.keyPrefixSeparator).toBe("");
		storelyKeyDB.keyPrefixSeparator = "->";
		expect(storelyKeyDB.keyPrefixSeparator).toBe("->");
		storelyKeyDB.keyPrefixSeparator = "";
		expect(storelyKeyDB.keyPrefixSeparator).toBe("");
	});

	test("clearBatchSize should not set if 0 or less than", () => {
		const storelyKeyDB = new StorelyKeyDB("keydb://localhost:6378", {
			clearBatchSize: 0,
		});
		expect(storelyKeyDB.clearBatchSize).toBe(1000);
		storelyKeyDB.clearBatchSize = 200;
		expect(storelyKeyDB.clearBatchSize).toBe(200);
		let error = "";
		storelyKeyDB.on("error", (message) => {
			error = message as string;
		});
		storelyKeyDB.clearBatchSize = -1;
		expect(error).toBe("clearBatchSize must be greater than 0");
		expect(storelyKeyDB.clearBatchSize).toBe(200);
	});

	test("should be able to get and set properties individually", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.namespace = "test";
		storelyKeyDB.keyPrefixSeparator = ":1";
		storelyKeyDB.clearBatchSize = 2000;
		storelyKeyDB.noNamespaceAffectsAll = true;

		expect(storelyKeyDB.namespace).toBe("test");
		expect(storelyKeyDB.keyPrefixSeparator).toBe(":1");
		expect(storelyKeyDB.clearBatchSize).toBe(2000);
		expect(storelyKeyDB.noNamespaceAffectsAll).toBe(true);
		expect(storelyKeyDB.throwOnErrors).toBe(false);
		expect(storelyKeyDB.throwOnConnectError).toBe(true);
		expect(storelyKeyDB.useUnlink).toBe(true);
	});

	test("client options should contain the url", () => {
		const uri = "keydb://foo:6378";
		const storelyKeyDB = new StorelyKeyDB(uri);
		expect((storelyKeyDB.client as RedisClientType).options?.url).toBe("redis://foo:6378");
	});

	test("should get and set throwOnConnectError", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnConnectError: true });
		const client = await storelyKeyDB.getClient();
		expect(client).toBeDefined();

		expect(storelyKeyDB.throwOnConnectError).toBe(true);
		storelyKeyDB.throwOnConnectError = false;
		expect(storelyKeyDB.throwOnConnectError).toBe(false);
		storelyKeyDB.throwOnConnectError = true;
		expect(storelyKeyDB.throwOnConnectError).toBe(true);
	});

	test("should get and set throwOnErrors", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });
		const client = await storelyKeyDB.getClient();
		expect(client).toBeDefined();
		expect(storelyKeyDB.throwOnErrors).toBe(true);
		storelyKeyDB.throwOnErrors = false;
		expect(storelyKeyDB.throwOnErrors).toBe(false);
		storelyKeyDB.throwOnErrors = true;
		expect(storelyKeyDB.throwOnErrors).toBe(true);
	});
});

describe("StorelyKeyDB Methods", () => {
	beforeEach(async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const client = (await storelyKeyDB.getClient()) as RedisClientType;
		await client.flushDb();
		await storelyKeyDB.disconnect();
	});
	test("should be able to connect, set, delete, and disconnect", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await storelyKeyDB.set(key, val);
		const value = await storelyKeyDB.get(key);
		expect(value).toBe(val);
		const deleted = await storelyKeyDB.delete(key);
		expect(deleted).toBe(true);
		await storelyKeyDB.disconnect();
	});

	test("should be able to connect, set, delete, and disconnect using useUnlink to false", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.useUnlink = false;
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await storelyKeyDB.set(key, val);
		const value = await storelyKeyDB.get(key);
		expect(value).toBe(val);
		const deleted = await storelyKeyDB.delete(key);
		expect(deleted).toBe(true);
		await storelyKeyDB.disconnect();
	});

	test("should do nothing if no keys on clear", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const client = (await storelyKeyDB.getClient()) as RedisClientType;
		await client.flushDb();
		await storelyKeyDB.clear();
		storelyKeyDB.namespace = "ns1";
		await storelyKeyDB.clear();
		await storelyKeyDB.disconnect();
	});
});
