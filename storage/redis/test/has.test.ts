import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@storely/test-suite";
import { describe, expect, test, vi } from "vitest";
import StorelyRedis, { RedisErrorMessages } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

describe("has", () => {
	test("should return true for existing keys", async () => {
		const storelyRedis = new StorelyRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await storelyRedis.set(data.key, data.value);

		const result = await storelyRedis.has(data.key);

		expect(result).toBe(true);
	});

	test("should return false for non-existing keys", async () => {
		const storelyRedis = new StorelyRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
		};

		const result = await storelyRedis.has(data.key);

		expect(result).toBe(false);
	});

	test("should throw on connection error", async () => {
		const storelyRedis = new StorelyRedis(redisBadUri, {
			throwOnConnectError: true,
			connectionTimeout: 500,
		});
		storelyRedis.on("error", () => {}); // Silence expected connection errors

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyRedis.client, "exists").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await storelyRedis.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(RedisErrorMessages.RedisClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyRedis.client, "exists").mockRestore();
	});

	test("should not throw on connection error when throwOnConnectError is false", async () => {
		const storelyRedis = new StorelyRedis(redisBadUri, {
			throwOnConnectError: false,
			connectionTimeout: 500,
		});
		storelyRedis.on("error", () => {}); // Silence expected connection errors

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyRedis.client, "exists").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await storelyRedis.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(false);
		vi.spyOn(storelyRedis.client, "exists").mockRestore();
	});

	test("should throw an error when throwErrors is true and an error occurs", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyRedis.client, "exists").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await storelyRedis.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyRedis.client, "exists").mockRestore();
	});

	test("should not throw an error on hasMany when throwErrors is false", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { throwOnErrors: false });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(storelyRedis.client, "multi").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await storelyRedis.hasMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(false);
		vi.spyOn(storelyRedis.client, "multi").mockRestore();
	});

	test("should throw an error on hasMany when throwErrors is true", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { throwOnErrors: true });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(storelyRedis.client, "multi").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await storelyRedis.hasMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyRedis.client, "multi").mockRestore();
	});

	test("should be able to has many keys", async () => {
		const storelyRedis = new StorelyRedis();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		await storelyRedis.setMany([
			{ key: key1, value: value1 },
			{ key: key2, value: value2 },
			{ key: key3, value: value3, ttl: 5 },
		]);
		await delay(10);
		const exists = await storelyRedis.hasMany([key1, key2, key3]);
		expect(exists).toEqual([true, true, false]);
		await storelyRedis.disconnect();
	});

	test("should return true on has if key exists", async () => {
		const storelyRedis = new StorelyRedis();
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await storelyRedis.set(key, value);
		const exists = await storelyRedis.has(key);
		expect(exists).toBe(true);
		await storelyRedis.disconnect();
	});

	test("should return false on has if key does not exist", async () => {
		const storelyRedis = new StorelyRedis();
		const key = faker.string.uuid();
		const exists = await storelyRedis.has(key);
		expect(exists).toBe(false);
		await storelyRedis.disconnect();
	});
});
