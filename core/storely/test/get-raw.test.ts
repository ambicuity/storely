import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import { Storely } from "../src/index.js";
import { createMockCompression, createStore, delay } from "./test-utils.js";

describe("Storely Get Raw", async () => {
	test("should return raw data", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await storely.set(key, value);
		const result = await storely.getRaw(key);
		expect(result).toEqual({ value });
	});

	test("should return undefined for non-existing key", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const result = await storely.getRaw(key);
		expect(result).toBeUndefined();
	});

	test("should return raw data with expiration", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await storely.set(key, value, 1000); // Set with 1 second expiration
		const result = await storely.getRaw(key);
		expect(result).toEqual({ value, expires: expect.any(Number) });
	});

	test("should return undefined for expired key", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await storely.set(key, value, 50); // Set with 50ms expiration
		await delay(100); // Wait for expiration
		const result = await storely.getRaw(key);
		expect(result).toBeUndefined();
	});

	test("should show a miss in stats for non-existing key", async () => {
		const storely = new Storely({ stats: true });
		const key = faker.string.alphanumeric(10);
		await storely.getRaw(key);
		expect(storely.stats.misses).toBe(1);
	});

	test("should show a hit in stats for existing key", async () => {
		const storely = new Storely({ stats: true });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await storely.set(key, value);
		await storely.getRaw(key);
		expect(storely.stats.hits).toBe(1);
	});

	test("should be able to get raw data with compression", async () => {
		const storely = new Storely({ compression: createMockCompression() });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await storely.set(key, value);
		const result = await storely.getRaw<string>(key);
		expect(result).toEqual({ value });
	});
});

describe("Storely Get Many Raw", async () => {
	test("should return many raw data", async () => {
		const storely = new Storely();
		const keys = Array.from({ length: 5 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		await Promise.all(keys.map(async (key, index) => storely.set(key, values[index])));
		const results = await storely.getManyRaw(keys);
		expect(results).toEqual(keys.map((_key, index) => ({ value: values[index] })));
	});

	test("should return undefined for non-existing keys", async () => {
		const storely = new Storely();
		const keys = Array.from({ length: 5 }, () => faker.string.alphanumeric(10));
		const results = await storely.getManyRaw(keys);
		expect(results).toEqual(Array.from({ length: keys.length }).fill(undefined));
	});

	test("should return mixed results for existing and non-existing keys", async () => {
		const storely = new Storely();
		const existingKeys = Array.from({ length: 3 }, () => faker.string.alphanumeric(10));
		const nonExistingKeys = Array.from({ length: 2 }, () => faker.string.alphanumeric(10));
		const values = existingKeys.map(() => faker.string.alphanumeric(10));
		await Promise.all(existingKeys.map(async (key, index) => storely.set(key, values[index])));
		const results = await storely.getManyRaw([...existingKeys, ...nonExistingKeys]);
		expect(results).toEqual([
			{ value: values[0] },
			{ value: values[1] },
			{ value: values[2] },
			undefined,
			undefined,
		]);
	});

	test("should return raw data with expiration for many keys", async () => {
		const storely = new Storely();
		const keys = Array.from({ length: 3 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		await Promise.all(keys.map(async (key, index) => storely.set(key, values[index], 1000))); // Set with 1 second expiration
		const results = await storely.getManyRaw(keys);
		expect(results).toEqual(
			keys.map((_key, index) => ({
				value: values[index],
				expires: expect.any(Number),
			})),
		);
	});

	test("should return undefined for expired keys in many raw data", async () => {
		const storely = new Storely();
		const keys = Array.from({ length: 3 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		await Promise.all(keys.map(async (key, index) => storely.set(key, values[index], 50))); // Set with 50ms expiration
		await delay(100); // Wait for expiration
		const results = await storely.getManyRaw(keys);
		expect(results).toEqual(Array.from({ length: keys.length }).fill(undefined));
	});

	test("should get many with storage that supports getMany function", async () => {
		const storely = new Storely({ store: createStore() });
		const keys = Array.from({ length: 5 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		await Promise.all(keys.map(async (key, index) => storely.set(key, values[index])));
		const results = await storely.getManyRaw(keys);
		expect(results).toEqual(keys.map((_key, index) => ({ value: values[index] })));
	});

	test("sending in empty array should return empty array", async () => {
		const storely = new Storely();
		const results = await storely.getManyRaw([]);
		expect(results).toEqual([]);
	});
});
