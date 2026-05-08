import { faker } from "@faker-js/faker";
import * as testRunner from "vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Storely, { StorelyMemoryAdapter, type StorelyStorageAdapter } from "../src/index.js";
import { createStore, delay } from "./test-utils.js";

const snooze = delay;

describe("Storely", async () => {
	type TestData = {
		key: string;
		value: string;
	};

	let testData: TestData[] = [];

	let testKeys: string[] = [];

	beforeEach(() => {
		testData = [];
		for (let i = 0; i < 5; i++) {
			testData.push({
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
			});
		}

		testKeys = testData.map((data) => data.key);

		vi.useFakeTimers();

		return () => {
			vi.useRealTimers();
		};
	});

	describe("getMany", () => {
		test("the function exists", async () => {
			const storely = new Storely();
			expect(storely.getMany).toBeDefined();
		});

		test("returns a promise that is empty if nothing is sent in", async () => {
			const storely = new Storely();
			const result = await storely.getMany([]);
			expect(result.length).toEqual(0);
		});

		test("returns multiple values on in memory storage", async () => {
			const storely = new Storely();
			await storely.setMany(testData);
			const result = await storely.getMany(testKeys);
			expect(result.length).toEqual(testData.length);
			expect(result[0]).toEqual(testData[0].value);
		});

		test("does not call get when getMany is available", async () => {
			const adapter = new StorelyMemoryAdapter(new Map());
			const getManyMock = vi.fn((keys: string[]) => keys.map((key) => adapter.store.get(key)));
			adapter.getMany = getManyMock;
			const getSpy = vi.spyOn(adapter, "get");
			const storely = new Storely({ store: adapter });

			await storely.getMany(testKeys);
			expect(getManyMock).toHaveBeenCalled();
			expect(getSpy).not.toHaveBeenCalled();
		});

		test("handles expired values correctly", async () => {
			const adapter = new StorelyMemoryAdapter(new Map());
			const storely = new Storely({ store: adapter });
			await storely.setMany(
				testData.map((data) => ({
					key: data.key,
					value: data.value,
					ttl: 1000,
				})),
			);
			vi.advanceTimersByTime(1001);
			const result = await storely.getMany(testKeys);
			expect(result.length).toEqual(testData.length);
			// It should return undefined for expired keys (adapter handles expiry)
			expect(result[0]).toBeUndefined();
		});
	});
});

testRunner.it(".getRaw(key) returns the raw object instead of the value", async (t) => {
	const storely = new Storely();
	await storely.set("foo", "bar");
	const value = await storely.get("foo");
	const rawObject = await storely.getRaw("foo");
	t.expect(value).toBe("bar");
	t.expect(rawObject?.value).toBe("bar");
});

testRunner.it("Storely should wait for the expired get", async (t) => {
	t.expect.assertions(4);
	const _store = new Map();
	const store = {
		get: async (key: string) => _store.get(key),
		// biome-ignore lint/suspicious/noExplicitAny: type format
		set(key: string, value: any) {
			_store.set(key, value);
		},
		clear() {
			_store.clear();
		},
		async delete(key: string) {
			await new Promise<void>((resolve) => {
				setTimeout(() => {
					// Simulate database latency
					resolve();
				}, 20);
			});
			return _store.delete(key);
		},
	} as StorelyStorageAdapter;

	const storely = new Storely({ store, checkExpired: true });

	// Round 1
	const v1 = await storely.get("foo");
	t.expect(v1).toBeUndefined();

	await storely.set("foo", "bar", 1000);
	const v2 = await storely.get("foo");
	t.expect(v2).toBe("bar");

	await new Promise<void>((resolve) => {
		setTimeout(() => {
			// Wait for expired
			resolve();
		}, 1100);
	});

	// Round 2
	const v3 = await storely.get("foo");
	t.expect(v3).toBeUndefined();

	await storely.set("foo", "bar", 1000);
	await new Promise<void>((resolve) => {
		setTimeout(() => {
			// Simulate database latency
			resolve();
		}, 30);
	});
	const v4 = await storely.get("foo");
	t.expect(v4).toBe("bar");
});

testRunner.it("storely.get([keys]) should return array values", async (t) => {
	const storely = new Storely({ store: new Map() });
	await storely.set("foo", "bar");
	await storely.set("foo1", "bar1");
	await storely.set("foo2", "bar2");
	const values = (await storely.get<string>(["foo", "foo1", "foo2"])) as string[];
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe("bar");
	t.expect(values[1]).toBe("bar1");
	t.expect(values[2]).toBe("bar2");

	const rawValues = await storely.getManyRaw<string>(["foo", "foo1", "foo2"]);
	t.expect(Array.isArray(rawValues)).toBeTruthy();
	t.expect(rawValues[0]).toEqual({ value: "bar" });
	t.expect(rawValues[1]).toEqual({ value: "bar1" });
	t.expect(rawValues[2]).toEqual({ value: "bar2" });
});

testRunner.it("storely.get([keys]) should return array value undefined when expires", async (t) => {
	const storely = new Storely({ store: new Map() });
	await storely.set("foo", "bar");
	await storely.set("foo1", "bar1", 1);
	await storely.set("foo2", "bar2");
	await new Promise<void>((resolve) => {
		setTimeout(() => {
			// Simulate database latency
			resolve();
		}, 30);
	});
	const values = await storely.get<string>(["foo", "foo1", "foo2"]);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe("bar");
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBe("bar2");
});

testRunner.it(
	"storely.get([keys]) should return array value undefined when expires sqlite",
	async (t) => {
		const storely = new Storely({ store: new Map() });

		const dataSet = [
			{
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
			},
			{
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
				ttl: 10,
			},
			{
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
			},
		];

		for (const { key, value, ttl } of dataSet) {
			// eslint-disable-next-line no-await-in-loop
			await storely.set(key, value, ttl);
		}

		await delay(30);
		const values = await storely.get<string>(dataSet.map((item) => item.key));
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values).toEqual([dataSet[0].value, undefined, dataSet[2].value]);
	},
);

testRunner.it(
	"storely.get([keys]) should return empty array when expires with storage adapter",
	async (t) => {
		const storely = new Storely({ store: createStore() });
		await storely.clear();
		await storely.set("foo", "bar", 1);
		await storely.set("foo1", "bar1", 1);
		await storely.set("foo2", "bar2", 1);
		await new Promise<void>((resolve) => {
			setTimeout(() => {
				resolve();
			}, 30);
		});
		const values = await storely.get(["foo", "foo1", "foo2"]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values.length).toBe(3);
	},
);

testRunner.it(
	"storely.getManyRaw([keys]) should return array raw values undefined with storage adapter",
	async (t) => {
		const storely = new Storely({ store: createStore() });
		await storely.clear();
		const values = await storely.getManyRaw<string>(["foo", "foo1"]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBeUndefined();
		t.expect(values[1]).toBeUndefined();
	},
);

testRunner.it("storely.get([keys]) should return array values with undefined", async (t) => {
	const storely = new Storely({ store: new Map() });
	await storely.set("foo", "bar");
	await storely.set("foo2", "bar2");
	const values = await storely.get<string>(["foo", "foo1", "foo2"]);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe("bar");
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBe("bar2");
});

testRunner.it(
	"storely.get([keys]) should return array values with all undefined using storage adapter",
	async (t) => {
		const storely = new Storely({ store: createStore() });
		const values = await storely.get<string>(["foo", "foo1", "foo2"]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBeUndefined();
		t.expect(values[1]).toBeUndefined();
		t.expect(values[2]).toBeUndefined();
	},
);

testRunner.it(
	"storely.get([keys]) should return undefined array for all no existent keys",
	async (t) => {
		const storely = new Storely({ store: new Map() });
		const values = await storely.get(["foo", "foo1", "foo2"]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values).toEqual([undefined, undefined, undefined]);
	},
);

testRunner.it("get keys, one key expired", async (t) => {
	const storely = new Storely({ store: new Map() });
	await storely.set("foo", "bar", 10_000);
	await storely.set("fizz", "buzz", 100);
	await storely.set("ping", "pong", 10_000);
	await snooze(150);
	await storely.get(["foo", "fizz", "ping"]);
	t.expect(await storely.get("fizz")).toBeUndefined();
	t.expect(await storely.get("foo")).toBe("bar");
	t.expect(await storely.get("ping")).toBe("pong");
});

// --- Coverage tests for fallback paths ---

testRunner.it("getMany should fallback to individual get when store has no getMany", async (t) => {
	const store = createStore();
	store.getMany = undefined as unknown as typeof store.getMany;
	const storely = new Storely({ store });
	await storely.set("key1", "val1");
	await storely.set("key2", "val2");
	const result = await storely.getMany(["key1", "key2", "nonexistent"]);
	t.expect(result).toEqual(["val1", "val2", undefined]);
});

testRunner.it("getMany fallback should handle expired keys", async (t) => {
	const store = createStore();
	store.getMany = undefined as unknown as typeof store.getMany;
	const storely = new Storely({ store, checkExpired: true });
	await storely.set("key1", "val1", 1);
	await snooze(100);
	const result = await storely.getMany(["key1"]);
	t.expect(result).toEqual([undefined]);
});

testRunner.it(
	"getManyRaw should fallback to individual get when store has no getMany",
	async (t) => {
		const store = createStore();
		store.getMany = undefined as unknown as typeof store.getMany;
		const storely = new Storely({ store });
		await storely.set("key1", "val1");
		const result = await storely.getManyRaw(["key1", "nonexistent"]);
		t.expect(result[0]).toBeDefined();
		t.expect(result[0]?.value).toBe("val1");
		t.expect(result[1]).toBeUndefined();
	},
);
