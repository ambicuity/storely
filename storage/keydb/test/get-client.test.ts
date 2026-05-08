import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import StorelyKeyDB, { createStorelyKeyDB, KeyDBErrorMessages } from "../src/index.js";

const keydbUri = process.env.KEYDB_URI ?? "keydb://localhost:6378";
const keydbBadUri = process.env.KEYDB_BAD_URI ?? "keydb://localhost:6377";

describe("getClient", () => {
	test("should get client that is connected", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri);
		const client = await storelyKeyDB.getClient();
		expect(client).toBeDefined();
	});

	test("should get client that is connected with default timeout", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { connectionTimeout: 2000 });
		expect(storelyKeyDB.connectionTimeout).toBe(2000);
		storelyKeyDB.connectionTimeout = undefined;
		expect(storelyKeyDB.connectionTimeout).toBe(undefined);
		const client = await storelyKeyDB.getClient();
		expect(client).toBeDefined();
	});

	test("should get client that is connected with timeout", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbUri, { connectionTimeout: 2000 });
		expect(storelyKeyDB.connectionTimeout).toBe(2000);
		const client = await storelyKeyDB.getClient();
		expect(client).toBeDefined();
	});

	test("should throw an error if not connected", async () => {
		const storelyKeyDB = new StorelyKeyDB(keydbBadUri, { connectionTimeout: 500 });
		storelyKeyDB.on("error", () => {});
		let didError = false;
		try {
			await storelyKeyDB.getClient();
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(KeyDBErrorMessages.KeyDBClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
	});

	test("should throw an error if not connected with Storely", async () => {
		const storely = createStorelyKeyDB(keydbBadUri, {
			throwOnErrors: true,
			connectionTimeout: 500,
		});
		let didError = false;
		try {
			await storely.get(faker.string.alphanumeric(10));
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});

	test("should throw an error if not connected with Storely", async () => {
		const storely = createStorelyKeyDB(keydbBadUri, {
			throwOnConnectError: true,
			connectionTimeout: 500,
		});
		let didError = false;
		try {
			await storely.get(faker.string.alphanumeric(10));
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});
});
