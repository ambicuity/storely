import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@storely/test-suite";
import { describe, expect, test, vi } from "vitest";
import StorelyKeyDB from "../src/index.js";

const keydbUri = process.env.KEYDB_URI ?? "keydb://localhost:6378";
const keydbBadUri = process.env.KEYDB_BAD_URI ?? "keydb://localhost:6377";

describe("set", () => {
	test("should set a value", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await storelyKeyDB.set(data.key, data.value);

		const result = await storelyKeyDB.get(data.key);

		expect(result).toBe(data.value);
	});

	test("should throw error on bad uri", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbBadUri, { connectionTimeout: 500 });
		storelyKeyDB.on("error", () => {});

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		let didError = false;

		try {
			await storelyKeyDB.set(data.key, data.value);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});

	test("should throw error on bad uri", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbBadUri, {
			throwOnConnectError: false,
			throwOnErrors: true,
			connectionTimeout: 500,
		});
		storelyKeyDB.on("error", () => {});

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		vi.spyOn(storelyKeyDB.client, "set").mockImplementation(() => {
			throw new Error("KeyDB client error");
		});

		let didError = false;
		try {
			await storelyKeyDB.set(data.key, data.value);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});

	test("should set a value with ttl", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
			ttl: 40,
		};

		await storelyKeyDB.set(data.key, data.value, data.ttl);

		const result = await storelyKeyDB.get(data.key);

		expect(result).toBe(data.value);

		await delay(80);

		const expiredResult = await storelyKeyDB.get(data.key);
		expect(expiredResult).toBeUndefined();
	});

	test("should set a value with ttl", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
			ttl: 40,
		};

		await storelyKeyDB.set(data.key, data.value, data.ttl);

		const result = await storelyKeyDB.get(data.key);

		expect(result).toBe(data.value);

		await delay(80);

		const expiredResult = await storelyKeyDB.get(data.key);
		expect(expiredResult).toBeUndefined();
	});

	test("show throw on keydb client set and get error", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		vi.spyOn(storelyKeyDB.client, "set").mockImplementation(() => {
			throw new Error("KeyDB set error");
		});

		let didError = false;
		try {
			await storelyKeyDB.set(data.key, data.value);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyKeyDB.client, "set").mockRestore();
	});

	test("show throw on keydb client setMany and get error", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		vi.spyOn(storelyKeyDB.client, "multi").mockImplementation(() => {
			throw new Error("KeyDB setMany error");
		});

		let didError = false;
		try {
			await storelyKeyDB.setMany([data, data, data]);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
		vi.spyOn(storelyKeyDB.client, "multi").mockRestore();
	});

	test("setMany should return false entries on error when throwOnErrors is false", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		storelyKeyDB.on("error", () => {});

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		vi.spyOn(storelyKeyDB.client, "multi").mockImplementation(() => {
			throw new Error("KeyDB setMany error");
		});

		const result = await storelyKeyDB.setMany([data, data, data]);
		expect(result).toEqual([false, false, false]);
		vi.spyOn(storelyKeyDB.client, "multi").mockRestore();
	});

	test("should be able to set a ttl", async () => {
		const storelyKeyDB = new StorelyKeyDB();
		const key = faker.string.uuid();
		await storelyKeyDB.set(key, faker.lorem.word(), 10);
		await delay(15);
		const value = await storelyKeyDB.get(key);
		expect(value).toBeUndefined();
		await storelyKeyDB.disconnect();
	});

	test("should be able to set many keys", async () => {
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
		const value = await storelyKeyDB.get(key1);
		expect(value).toBe(val1);
		const value2 = await storelyKeyDB.get(key2);
		expect(value2).toBe(val2);
		await delay(10);
		const value3 = await storelyKeyDB.get(key3);
		expect(value3).toBeUndefined();
		await storelyKeyDB.disconnect();
	});
});
