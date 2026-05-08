import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import StorelyRedis, { createStorely, createStorelyNonBlocking } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";

describe("createStorely", () => {
	test("should create Storely instance with default options", async () => {
		const storely = createStorely(redisUri);
		expect(storely).toBeDefined();
		expect(storely.store).toBeInstanceOf(StorelyRedis);
		expect(storely.namespace).toBeUndefined();
		expect(storely.store.namespace).toBeUndefined();
	});

	test("should create Storely instance with custom namespace", async () => {
		const namespace = faker.string.alphanumeric(10);
		const storely = createStorely(redisUri, { namespace });
		expect(storely).toBeDefined();
		expect(storely.store).toBeInstanceOf(StorelyRedis);
		expect(storely.namespace).toBe(namespace);
		expect(storely.store.namespace).toBe(namespace);
	});

	test("should create Storely instance with custom namespace and errors enabled", async () => {
		const namespace = faker.string.alphanumeric(10);
		const storely = createStorely(redisUri, {
			namespace,
			throwOnErrors: true,
			throwOnConnectError: true,
		});
		expect(storely).toBeDefined();
		expect(storely.store).toBeInstanceOf(StorelyRedis);
		expect(storely.namespace).toBe(namespace);
		expect(storely.store.namespace).toBe(namespace);
	});
});

describe("createStorelyNonBlocking", () => {
	test("should create Storely instance with default options", async () => {
		const storely = createStorelyNonBlocking(redisUri);
		expect(storely).toBeDefined();
		expect(storely.throwOnErrors).toBe(false);
		expect(storely.store).toBeInstanceOf(StorelyRedis);
		expect(storely.store.throwOnErrors).toBe(false);
		expect(storely.store.throwOnConnectError).toBe(false);
		expect(storely.namespace).toBeUndefined();
		expect(storely.store.namespace).toBeUndefined();
	});
});
