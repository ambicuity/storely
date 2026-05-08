import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test, vi } from "vitest";
import StorelyKeyDB, { KeyDBErrorMessages } from "../src/index.js";

const keydbUri = process.env.KEYDB_URI ?? "keydb://localhost:6378";
const keydbBadUri = process.env.KEYDB_BAD_URI ?? "keydb://localhost:6377";

describe("delete", () => {
	test("should delete a value", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await storelyKeyDB.set(data.key, data.value);
		await storelyKeyDB.delete(data.key);

		const result = await storelyKeyDB.get(data.key);

		expect(result).toBeUndefined();
	});

	test("should return false for non-existing keys", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const data = {
			key: faker.string.alphanumeric(10),
		};

		const result = await storelyKeyDB.delete(data.key);

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
			value: faker.lorem.sentence(),
		};

		let didError = false;
		try {
			await storelyKeyDB.delete(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(KeyDBErrorMessages.KeyDBClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
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

		let didError = false;
		try {
			await storelyKeyDB.delete(data.key);
		} catch {
			didError = true;
		}

		expect(didError).toBe(false);
	});

	test("should throw an error on client error", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyKeyDB.client, "unlink").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.delete(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("KeyDB client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyKeyDB.client, "unlink").mockRestore();
	});

	test("should throw on deleteMany client error", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbBadUri, {
			throwOnConnectError: true,
			connectionTimeout: 500,
		});
		storelyKeyDB.on("error", () => {});

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		let didError = false;
		try {
			await storelyKeyDB.deleteMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(KeyDBErrorMessages.KeyDBClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
	});

	test("should not throw on deleteMany client error when throwOnConnectError is false", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbBadUri, {
			throwOnConnectError: false,
			connectionTimeout: 500,
		});
		storelyKeyDB.on("error", () => {});

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		let didError = false;
		try {
			await storelyKeyDB.deleteMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("KeyDB client error");
		}

		expect(didError).toBe(false);
	});

	test("should throw on getMany an error when throwOnErrors is true and an error occurs", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(storelyKeyDB.client, "multi").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.deleteMany([data.key]);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("KeyDB client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyKeyDB.client, "multi").mockRestore();
	});

	test("should return false on delete if key does not exist", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const deleted = await storelyKeyDB.delete(faker.string.uuid());
		expect(deleted).toBe(false);
		await storelyKeyDB.disconnect();
	});

	test("should be able to delete many with namespace", async () => {
		const storelyKeyDB = new StorelyKeyDB();
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
		const value = await storelyKeyDB.get(key1);
		expect(value).toBe(val1);
		const value2 = await storelyKeyDB.get(key2);
		expect(value2).toBeUndefined();
		const value3 = await storelyKeyDB.get(key3);
		expect(value3).toBeUndefined();
		await storelyKeyDB.disconnect();
	});

	test("should be able to delete many with namespace with useUnlink false", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		storelyKeyDB.useUnlink = false;
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
		const value = await storelyKeyDB.get(key1);
		expect(value).toBe(val1);
		const value2 = await storelyKeyDB.get(key2);
		expect(value2).toBeUndefined();
		const value3 = await storelyKeyDB.get(key3);
		expect(value3).toBeUndefined();
		await storelyKeyDB.disconnect();
	});
});
