import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import { Storely, StorelyHooks } from "../src/index.js";
import { createStore } from "./test-utils.js";

describe("Storely Set Raw", async () => {
	test("should set and getRaw round-trip", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		const rawValue = { value };
		await storely.setRaw(key, rawValue);
		const result = await storely.getRaw(key);
		expect(result).toEqual({ value });
	});

	test("should set raw with expires and preserve it exactly", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		const expires = Date.now() + 60_000;
		await storely.setRaw(key, { value, expires });
		const result = await storely.getRaw(key);
		expect(result).toEqual({ value, expires });
	});

	test("should set raw without expires", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await storely.setRaw(key, { value });
		const result = await storely.getRaw(key);
		expect(result).toEqual({ value });
	});

	test("should be retrievable with normal get", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await storely.setRaw(key, { value });
		const result = await storely.get(key);
		expect(result).toBe(value);
	});

	test("should return true on success", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const result = await storely.setRaw(key, { value: "test" });
		expect(result).toBe(true);
	});

	test("should derive store ttl from value.expires", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const expires = Date.now() + 60_000;
		await storely.setRaw(key, { value: "test", expires });
		const result = await storely.getRaw(key);
		expect(result).toBeDefined();
		expect(result?.expires).toBe(expires);
	});

	test("should pass derived ttl to store adapter", async () => {
		let receivedTtl: number | undefined;
		const store = createStore();
		const originalSet = store.set.bind(store);
		store.set = async (key: string, value: unknown, ttl?: number) => {
			receivedTtl = ttl;
			return originalSet(key, value, ttl);
		};
		const storely = new Storely({ store });
		const key = faker.string.alphanumeric(10);
		const expires = Date.now() + 60_000;
		await storely.setRaw(key, { value: "test", expires });
		expect(receivedTtl).toBeDefined();
		expect(receivedTtl).toBeGreaterThan(59_000);
		expect(receivedTtl).toBeLessThanOrEqual(60_000);
	});

	test("should not pass ttl to store when expires is not set", async () => {
		let receivedTtl: number | undefined;
		const store = createStore();
		const originalSet = store.set.bind(store);
		store.set = async (key: string, value: unknown, ttl?: number) => {
			receivedTtl = ttl;
			return originalSet(key, value, ttl);
		};
		const storely = new Storely({ store });
		const key = faker.string.alphanumeric(10);
		await storely.setRaw(key, { value: "test" });
		expect(receivedTtl).toBeUndefined();
	});

	test("should not pass negative ttl to store when expires is in the past", async () => {
		let receivedTtl: number | undefined;
		const store = createStore();
		const originalSet = store.set.bind(store);
		store.set = async (key: string, value: unknown, ttl?: number) => {
			receivedTtl = ttl;
			return originalSet(key, value, ttl);
		};
		const storely = new Storely({ store });
		const key = faker.string.alphanumeric(10);
		await storely.setRaw(key, { value: "test", expires: Date.now() - 1000 });
		expect(receivedTtl).toBeUndefined();
	});

	test("should track stats", async () => {
		const storely = new Storely({ stats: true });
		const key = faker.string.alphanumeric(10);
		await storely.setRaw(key, { value: "test" });
		expect(storely.stats.sets).toBe(1);
	});

	test("should trigger BEFORE_SET_RAW hook", async () => {
		const storely = new Storely();
		let hookTriggered = false;
		storely.addHook(StorelyHooks.BEFORE_SET_RAW, () => {
			hookTriggered = true;
		});
		await storely.setRaw(faker.string.alphanumeric(10), { value: "test" });
		expect(hookTriggered).toBe(true);
	});

	test("should trigger AFTER_SET_RAW hook", async () => {
		const storely = new Storely();
		let hookTriggered = false;
		storely.addHook(StorelyHooks.AFTER_SET_RAW, () => {
			hookTriggered = true;
		});
		await storely.setRaw(faker.string.alphanumeric(10), { value: "test" });
		expect(hookTriggered).toBe(true);
	});

	test("should emit error on store failure", async () => {
		const store = createStore();
		store.set = async () => {
			throw new Error("store error");
		};
		const storely = new Storely({ store });
		let errorEmitted = false;
		storely.on("error", () => {
			errorEmitted = true;
		});
		const result = await storely.setRaw(faker.string.alphanumeric(10), {
			value: "test",
		});
		expect(result).toBe(false);
		expect(errorEmitted).toBe(true);
	});

	test("should throw on store failure when throwOnErrors is true", async () => {
		const store = createStore();
		store.set = async () => {
			throw new Error("store error");
		};
		const storely = new Storely({ store, throwOnErrors: true });
		await expect(storely.setRaw(faker.string.alphanumeric(10), { value: "test" })).rejects.toThrow(
			"store error",
		);
	});

	test("should use store boolean return value", async () => {
		const store = createStore();
		const originalSet = store.set.bind(store);
		store.set = async (...args: unknown[]) => {
			// biome-ignore lint/suspicious/noExplicitAny: test override
			await (originalSet as any)(...args);
			return true;
		};
		const storely = new Storely({ store });
		const result = await storely.setRaw(faker.string.alphanumeric(10), {
			value: "test",
		});
		expect(result).toBe(true);
	});

	test("should be readable by has() after setRaw", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		await storely.setRaw(key, { value: "test" });
		const result = await storely.has(key);
		expect(result).toBe(true);
	});

	test("should be readable by getManyRaw() after setRaw", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await storely.setRaw(key, { value });
		const results = await storely.getManyRaw([key]);
		expect(results).toHaveLength(1);
		expect(results[0]?.value).toBe(value);
	});

	test("getRaw -> modify -> setRaw round-trip", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		await storely.set(key, "original");
		const raw = await storely.getRaw<string>(key);
		expect(raw).toBeDefined();
		// biome-ignore lint/style/noNonNullAssertion: test asserts defined above
		raw!.value = "modified";
		// biome-ignore lint/style/noNonNullAssertion: test asserts defined above
		await storely.setRaw(key, raw!);
		const result = await storely.getRaw(key);
		expect(result).toEqual({ value: "modified" });
	});
});

describe("Storely Set Many Raw", async () => {
	test("should set many and getRaw round-trip", async () => {
		const storely = new Storely();
		const keys = Array.from({ length: 3 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		const entries = keys.map((key, i) => ({
			key,
			value: { value: values[i] },
		}));
		await storely.setManyRaw(entries);
		for (const [i, key] of keys.entries()) {
			const result = await storely.getRaw(key);
			expect(result).toEqual({ value: values[i] });
		}
	});

	test("should set many raw with expires", async () => {
		const storely = new Storely();
		const key = faker.string.alphanumeric(10);
		const expires = Date.now() + 60_000;
		await storely.setManyRaw([{ key, value: { value: "test", expires } }]);
		const result = await storely.getRaw(key);
		expect(result).toEqual({ value: "test", expires });
	});

	test("should fallback to setRaw when store has no setMany", async () => {
		const store = createStore();
		// biome-ignore lint/suspicious/noExplicitAny: need to remove method for test
		delete (store as any).setMany;
		const storely = new Storely({ store });
		const keys = Array.from({ length: 3 }, () => faker.string.alphanumeric(10));
		const entries = keys.map((key) => ({
			key,
			value: { value: faker.string.alphanumeric(10) },
		}));
		const results = await storely.setManyRaw(entries);
		expect(results).toEqual([true, true, true]);

		for (const entry of entries) {
			const result = await storely.getRaw(entry.key);
			expect(result).toEqual(entry.value);
		}
	});

	test("should work with store that has setMany returning void", async () => {
		const store = createStore();
		// biome-ignore lint/suspicious/noExplicitAny: add setMany to test store
		(store as any).setMany = async (
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			entries: Array<{ key: string; value: any }>,
		) => {
			for (const { key, value } of entries) {
				await store.set(key, value);
			}
		};
		const storely = new Storely({ store });
		const keys = Array.from({ length: 2 }, () => faker.string.alphanumeric(10));
		const entries = keys.map((key) => ({
			key,
			value: { value: "test" },
		}));
		const results = await storely.setManyRaw(entries);
		expect(Array.isArray(results)).toBe(true);
		expect(results).toEqual([true, true]);
	});

	test("should work with store that has setMany returning boolean[]", async () => {
		const store = createStore();
		// biome-ignore lint/suspicious/noExplicitAny: add setMany to test store
		(store as any).setMany = async (
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			entries: Array<{ key: string; value: any }>,
		) => {
			for (const { key, value } of entries) {
				await store.set(key, value);
			}

			return entries.map(() => true);
		};
		const storely = new Storely({ store });
		const keys = Array.from({ length: 2 }, () => faker.string.alphanumeric(10));
		const entries = keys.map((key) => ({
			key,
			value: { value: "test" },
		}));
		const results = await storely.setManyRaw(entries);
		expect(results).toEqual([true, true]);
	});

	test("setManyRaw should derive ttl from value.expires per entry", async () => {
		const receivedTtls: Array<number | undefined> = [];
		const store = createStore();
		// biome-ignore lint/suspicious/noExplicitAny: add setMany to test store
		(store as any).setMany = async (
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			entries: Array<{ key: string; value: any; ttl?: number }>,
		) => {
			for (const { key, value, ttl } of entries) {
				receivedTtls.push(ttl);
				await store.set(key, value);
			}
		};
		const storely = new Storely({ store });
		const expires = Date.now() + 60_000;
		await storely.setManyRaw([
			{
				key: faker.string.alphanumeric(10),
				value: { value: "with-ttl", expires },
			},
			{ key: faker.string.alphanumeric(10), value: { value: "no-ttl" } },
		]);
		expect(receivedTtls).toHaveLength(2);
		expect(receivedTtls[0]).toBeGreaterThan(59_000);
		expect(receivedTtls[0]).toBeLessThanOrEqual(60_000);
		expect(receivedTtls[1]).toBeUndefined();
	});

	test("should throw on store failure when throwOnErrors is true", async () => {
		const store = createStore();
		store.setMany = async () => {
			throw new Error("batch error");
		};
		const storely = new Storely({ store, throwOnErrors: true });
		await expect(storely.setManyRaw([{ key: "a", value: { value: "test" } }])).rejects.toThrow(
			"batch error",
		);
	});

	test("should emit error on failure", async () => {
		const store = createStore();
		store.setMany = async () => {
			throw new Error("batch error");
		};
		const storely = new Storely({ store });
		let errorEmitted = false;
		storely.on("error", () => {
			errorEmitted = true;
		});
		const results = await storely.setManyRaw([{ key: "a", value: { value: "test" } }]);
		expect(errorEmitted).toBe(true);
		expect(results).toEqual([false]);
	});

	test("should trigger BEFORE_SET_MANY_RAW and AFTER_SET_MANY_RAW hooks", async () => {
		const storely = new Storely();
		let preHookTriggered = false;
		let postHookTriggered = false;
		storely.addHook(StorelyHooks.BEFORE_SET_MANY_RAW, () => {
			preHookTriggered = true;
		});
		storely.addHook(StorelyHooks.AFTER_SET_MANY_RAW, () => {
			postHookTriggered = true;
		});
		await storely.setManyRaw([{ key: faker.string.alphanumeric(10), value: { value: "test" } }]);
		expect(preHookTriggered).toBe(true);
		expect(postHookTriggered).toBe(true);
	});
});
