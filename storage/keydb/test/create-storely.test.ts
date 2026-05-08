import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import StorelyKeyDB, { createStorelyKeyDB, createStorelyKeyDBNonBlocking } from "../src/index.js";

const keydbUri = process.env.KEYDB_URI ?? "keydb://localhost:6378";

describe("createStorelyKeyDB", () => {
	test("should create Storely instance with default options", async () => {
		const storely = createStorelyKeyDB(keydbUri);
		expect(storely).toBeDefined();
		expect(storely.store).toBeInstanceOf(StorelyKeyDB);
		expect(storely.namespace).toBeUndefined();
		expect(storely.store.namespace).toBeUndefined();
	});

	test("should create Storely instance with custom namespace", async () => {
		const namespace = faker.string.alphanumeric(10);
		const storely = createStorelyKeyDB(keydbUri, { namespace });
		expect(storely).toBeDefined();
		expect(storely.store).toBeInstanceOf(StorelyKeyDB);
		expect(storely.namespace).toBe(namespace);
		expect(storely.store.namespace).toBe(namespace);
	});

	test("should create Storely instance with custom namespace and errors enabled", async () => {
		const namespace = faker.string.alphanumeric(10);
		const storely = createStorelyKeyDB(keydbUri, {
			namespace,
			throwOnErrors: true,
			throwOnConnectError: true,
		});
		expect(storely).toBeDefined();
		expect(storely.store).toBeInstanceOf(StorelyKeyDB);
		expect(storely.namespace).toBe(namespace);
		expect(storely.store.namespace).toBe(namespace);
	});
});

describe("createStorelyKeyDBNonBlocking", () => {
	test("should create Storely instance with default options", async () => {
		const storely = createStorelyKeyDBNonBlocking(keydbUri);
		expect(storely).toBeDefined();
		expect(storely.throwOnErrors).toBe(false);
		expect(storely.store).toBeInstanceOf(StorelyKeyDB);
		expect(storely.store.throwOnErrors).toBe(false);
		expect(storely.store.throwOnConnectError).toBe(false);
		expect(storely.namespace).toBeUndefined();
		expect(storely.store.namespace).toBeUndefined();
	});
});
