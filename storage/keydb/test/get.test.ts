import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@storely/test-suite";
import { describe, expect, test, vi } from "vitest";
import StorelyKeyDB from "../src/index.js";

const keydbUri = process.env.KEYDB_URI ?? "keydb://localhost:6378";

describe("get", () => {
	test("should get many values", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const data = {
			key1: faker.string.alphanumeric(10),
			value1: faker.lorem.sentence(),
			key2: faker.string.alphanumeric(10),
			value2: faker.lorem.sentence(),
		};

		await storelyKeyDB.set(data.key1, data.value1);
		await storelyKeyDB.set(data.key2, data.value2);

		const results = await storelyKeyDB.getMany([data.key1, data.key2]);

		expect(results).toEqual([data.value1, data.value2]);
	});

	test("should return undefined for keys that do not exist", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const data = {
			key1: faker.string.alphanumeric(10),
			key2: faker.string.alphanumeric(10),
		};

		const results = await storelyKeyDB.getMany([data.key1, data.key2]);

		expect(results).toEqual([undefined, undefined]);
	});

	test("should handle empty array input", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const results = await storelyKeyDB.getMany([]);
		expect(results).toEqual([]);
	});

	test("should throw an error on client error", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyKeyDB.client, "get").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.get(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("KeyDB client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyKeyDB.client, "get").mockRestore();
	});

	test("should not throw an error on client error", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: false });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyKeyDB.client, "get").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		let result: string | undefined = "";
		try {
			result = await storelyKeyDB.get(data.key);
		} catch {
			didError = true;
		}

		expect(didError).toBe(false);
		expect(result).toBeUndefined();
		vi.spyOn(storelyKeyDB.client, "get").mockRestore();
	});

	test("should throw and error on getMany client error", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(storelyKeyDB.client, "mGet").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.getMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("KeyDB client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyKeyDB.client, "mGet").mockRestore();
	});

	test("should not throw and error on getMany client error", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: false });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(storelyKeyDB.client, "mGet").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		let result: Array<string | undefined> = [];
		try {
			result = await storelyKeyDB.getMany(data.keys);
		} catch {
			didError = true;
		}

		expect(didError).toBe(false);
		expect(result).toEqual([undefined, undefined]);
		vi.spyOn(storelyKeyDB.client, "mGet").mockRestore();
	});

	test("should be able to get many keys", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await storelyKeyDB.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: faker.lorem.word(), ttl: 5 },
		]);
		await delay(10);
		const values = await storelyKeyDB.getMany([key1, key2, key3]);
		expect(values).toEqual([val1, val2, undefined]);
		await storelyKeyDB.disconnect();
	});

	test("should be able to call getMany with an empty array", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const values = await storelyKeyDB.getMany([]);
		expect(values).toEqual([]);
		await storelyKeyDB.disconnect();
	});
});
