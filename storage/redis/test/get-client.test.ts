import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import StorelyRedis, { createStorely, RedisErrorMessages } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

describe("getClient", () => {
	test("should get client that is connected", async () => {
		const storelyRedis = new StorelyRedis(redisUri);
		const client = await storelyRedis.getClient();
		expect(client).toBeDefined();
	});

	test("should get client that is connected with default timeout", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { connectionTimeout: 2000 });
		expect(storelyRedis.connectionTimeout).toBe(2000);
		storelyRedis.connectionTimeout = undefined; // Reset to default
		expect(storelyRedis.connectionTimeout).toBe(undefined);
		const client = await storelyRedis.getClient();
		expect(client).toBeDefined();
	});

	test("should get client that is connected with timeout", async () => {
		const storelyRedis = new StorelyRedis(redisUri, { connectionTimeout: 2000 });
		expect(storelyRedis.connectionTimeout).toBe(2000);
		const client = await storelyRedis.getClient();
		expect(client).toBeDefined();
	});

	test("should throw an error if not connected", async () => {
		const storelyRedis = new StorelyRedis(redisBadUri, { connectionTimeout: 500 });
		storelyRedis.on("error", () => {}); // Silence expected connection errors
		let didError = false;
		try {
			await storelyRedis.getClient();
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(RedisErrorMessages.RedisClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
	});

	test("should throw an error if not connected with Storely", async () => {
		const storely = createStorely(redisBadUri, {
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
		const storely = createStorely(redisBadUri, {
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
