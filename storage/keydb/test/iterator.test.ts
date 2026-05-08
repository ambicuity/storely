import { faker } from "@faker-js/faker";
import type { RedisClientType } from "@redis/client";
import { beforeEach, describe, expect, test } from "vitest";
import StorelyKeyDB, { createStorelyKeyDB } from "../src/index.js";

describe("iterators", () => {
	beforeEach(async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const client = (await storelyKeyDB.getClient()) as RedisClientType;
		await client.flushDb();
		await storelyKeyDB.disconnect();
	});
	test("should be able to iterate over keys", async () => {
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
		const storelyKeyDB = new StorelyKeyDB();
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
		const storelyKeyDB = new StorelyKeyDB();
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

	test("should only iterate over keys with no namespace if name is undefined set and noNamespaceAffectsAll is false", async () => {
		const storelyKeyDB = new StorelyKeyDB();
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

	test("should be able to pass undefined on connect to get localhost", async () => {
		const storely = createStorelyKeyDB();
		const sKeyDB = storely.store as StorelyKeyDB<string>;
		expect((sKeyDB.client as RedisClientType).options?.url).toBe("redis://localhost:6378");
	});

	test("should go to the RedisClientOptions if passed in", async () => {
		const reconnectStrategy = (times: number) => Math.min(times * 50, 2000);

		const storelyKeyDB = new StorelyKeyDB({
			socket: {
				host: "localhost",
				port: 6378,
				reconnectStrategy,
			},
		});

		expect((storelyKeyDB.client as RedisClientType).options?.socket?.reconnectStrategy).toBe(
			reconnectStrategy,
		);
	});
});
