import process from "node:process";
import { delay } from "@ambicuity/test-suite";
import { faker } from "@faker-js/faker";
import { describe, expect, test, vi } from "vitest";
import StorelyKeyDB, { KeyDBErrorMessages } from "../src/index.js";

const keydbUri = process.env.KEYDB_URI ?? "keydb://localhost:6378";
const keydbBadUri = process.env.KEYDB_BAD_URI ?? "keydb://localhost:6377";

describe("has", () => {
	test("should return true for existing keys", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await storelyKeyDB.set(data.key, data.value);

		const result = await storelyKeyDB.has(data.key);

		expect(result).toBe(true);
	});

	test("should return false for non-existing keys", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const data = {
			key: faker.string.alphanumeric(10),
		};

		const result = await storelyKeyDB.has(data.key);

		expect(result).toBe(false);
	});

	test("should throw on connection error", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbBadUri, {
			throwOnConnectError: true,
			connectionTimeout: 500,
		});
		storelyKeyDB.on("error", () => {});

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyKeyDB.client, "exists").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(KeyDBErrorMessages.KeyDBClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyKeyDB.client, "exists").mockRestore();
	});

	test("should not throw on connection error when throwOnConnectError is false", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbBadUri, {
			throwOnConnectError: false,
			connectionTimeout: 500,
		});
		storelyKeyDB.on("error", () => {});

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyKeyDB.client, "exists").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("KeyDB client error");
		}

		expect(didError).toBe(false);
		vi.spyOn(storelyKeyDB.client, "exists").mockRestore();
	});

	test("should throw an error when throwErrors is true and an error occurs", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyKeyDB.client, "exists").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("KeyDB client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyKeyDB.client, "exists").mockRestore();
	});

	test("should not throw an error on hasMany when throwErrors is false", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: false });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(storelyKeyDB.client, "multi").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.hasMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("KeyDB client error");
		}

		expect(didError).toBe(false);
		vi.spyOn(storelyKeyDB.client, "multi").mockRestore();
	});

	test("should throw an error on hasMany when throwErrors is true", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(storelyKeyDB.client, "multi").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.hasMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("KeyDB client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyKeyDB.client, "multi").mockRestore();
	});

	test("should be able to has many keys", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		await storelyKeyDB.setMany([
			{ key: key1, value: value1 },
			{ key: key2, value: value2 },
			{ key: key3, value: value3, ttl: 5 },
		]);
		await delay(10);
		const exists = await storelyKeyDB.hasMany([key1, key2, key3]);
		expect(exists).toEqual([true, true, false]);
		await storelyKeyDB.disconnect();
	});

	test("should return true on has if key exists", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await storelyKeyDB.set(key, value);
		const exists = await storelyKeyDB.has(key);
		expect(exists).toBe(true);
		await storelyKeyDB.disconnect();
	});

	test("should return false on has if key does not exist", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const key = faker.string.uuid();
		const exists = await storelyKeyDB.has(key);
		expect(exists).toBe(false);
		await storelyKeyDB.disconnect();
	});
});
