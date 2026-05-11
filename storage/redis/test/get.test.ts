import process from "node:process";
import { delay } from "@ambicuity/test-suite";
import { faker } from "@faker-js/faker";
import { describe, expect, test, vi } from "vitest";
import StorelyRedis from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";

describe("get", () => {
	test("should get many values", async () => {
		const storelyRedis = new StorelyRedis(redisUri);
		const data = {
			key1: faker.string.alphanumeric(10),
			value1: faker.lorem.sentence(),
			key2: faker.string.alphanumeric(10),
			value2: faker.lorem.sentence(),
		};

		await storelyRedis.set(data.key1, data.value1);
		await storelyRedis.set(data.key2, data.value2);

		const results = await storelyRedis.getMany([data.key1, data.key2]);

		expect(results).toEqual([data.value1, data.value2]);
	});

	test("should return undefined for keys that do not exist", async () => {
		const storelyRedis = new StorelyRedis(redisUri);
		const data = {
			key1: faker.string.alphanumeric(10),
			key2: faker.string.alphanumeric(10),
		};

		const results = await storelyRedis.getMany([data.key1, data.key2]);

		expect(results).toEqual([undefined, undefined]);
	});

	test("should handle empty array input", async () => {
		const storelyRedis = new StorelyRedis(redisUri);
		const results = await storelyRedis.getMany([]);
		expect(results).toEqual([]);
	});

	test("should throw an error on client error", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyRedis.client, "get").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await storelyRedis.get(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyRedis.client, "get").mockRestore();
	});

	test("should not throw an error on client error", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { throwOnErrors: false });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyRedis.client, "get").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		let result: string | undefined = "";
		try {
			result = await storelyRedis.get(data.key);
		} catch {
			didError = true;
		}

		expect(didError).toBe(false);
		expect(result).toBeUndefined();
		vi.spyOn(storelyRedis.client, "get").mockRestore();
	});

	test("should throw and error on getMany client error", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { throwOnErrors: true });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(storelyRedis.client, "mGet").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await storelyRedis.getMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyRedis.client, "mGet").mockRestore();
	});

	test("should not throw and error on getMany client error", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { throwOnErrors: false });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(storelyRedis.client, "mGet").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		let result: Array<string | undefined> = [];
		try {
			result = await storelyRedis.getMany(data.keys);
		} catch {
			didError = true;
		}

		expect(didError).toBe(false);
		expect(result).toEqual([undefined, undefined]);
		vi.spyOn(storelyRedis.client, "mGet").mockRestore();
	});

	test("should be able to get many keys", async () => {
		const storelyRedis = new StorelyRedis();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await storelyRedis.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: faker.lorem.word(), ttl: 5 },
		]);
		await delay(10);
		const values = await storelyRedis.getMany([key1, key2, key3]);
		expect(values).toEqual([val1, val2, undefined]);
		await storelyRedis.disconnect();
	});

	test("should be able to call getMany with an empty array", async () => {
		const storelyRedis = new StorelyRedis();
		const values = await storelyRedis.getMany([]);
		expect(values).toEqual([]);
		await storelyRedis.disconnect();
	});
});
