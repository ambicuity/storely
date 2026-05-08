import { faker } from "@faker-js/faker";
import tk from "timekeeper";
import * as testRunner from "vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Storely, { StorelyMemoryAdapter, type StorelyStorageAdapter } from "../src/index.js";
import { createStore } from "./test-utils.js";

describe("Storely", async () => {
	type TestData = {
		key: string;
		value: string;
	};

	let testData: TestData[] = [];

	beforeEach(() => {
		testData = [];
		for (let i = 0; i < 5; i++) {
			testData.push({
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
			});
		}

		vi.useFakeTimers();

		return () => {
			vi.useRealTimers();
		};
	});

	describe("setMany", async () => {
		test("the function exists", async () => {
			const storely = new Storely();
			expect(storely.setMany).toBeDefined();
		});

		test("returns a promise that is empty if nothing is sent in", async () => {
			const storely = new Storely();
			const result = await storely.setMany([]);
			expect(result.length).toEqual(0);
		});

		test("returns multiple responses on in memory storage", async () => {
			const storely = new Storely();
			const result = await storely.setMany(testData);
			expect(result.length).toEqual(testData.length);
			const resultValue = await storely.get(testData[0].key);
			expect(resultValue).toEqual(testData[0].value);
		});

		test("does not call set when setMany is available", async () => {
			const setManyMock = vi.fn((data: TestData[]) => data.map(() => true));
			const adapter = new StorelyMemoryAdapter(new Map());
			adapter.setMany = setManyMock;
			const setSpy = vi.spyOn(adapter, "set");
			const storely = new Storely({ store: adapter });

			await storely.setMany(testData);
			expect(setManyMock).toHaveBeenCalled();
			expect(setSpy).not.toHaveBeenCalled();
		});
	});
});

testRunner.it("Storely passes ttl info to stores", async (t) => {
	t.expect.assertions(1);
	const store = new Map();
	const storeSet = store.set;
	// @ts-expect-error
	store.set = (key, value, ttl) => {
		t.expect(ttl).toBe(100);
		// @ts-expect-error
		storeSet.call(store, key, value, ttl);
	};

	const storely = new Storely({ store });
	await storely.set("foo", "bar", 100);
});

testRunner.it("Storely respects default ttl option", async (t) => {
	const store = new Map();
	const storely = new Storely({ store, ttl: 100 });
	await storely.set("foo", "bar");
	t.expect(await storely.get("foo")).toBe("bar");
	tk.freeze(Date.now() + 150);
	t.expect(await storely.get("foo")).toBeUndefined();
	t.expect(store.size).toBe(0);
	tk.reset();
});

testRunner.it(".set(key, val, ttl) overwrites default ttl option", async (t) => {
	const startTime = Date.now();
	tk.freeze(startTime);
	const storely = new Storely({ ttl: 200 });
	await storely.set("foo", "bar");
	await storely.set("fizz", "buzz", 100);
	await storely.set("ping", "pong", 300);
	t.expect(await storely.get("foo")).toBe("bar");
	t.expect(await storely.get("fizz")).toBe("buzz");
	t.expect(await storely.get("ping")).toBe("pong");
	tk.freeze(startTime + 150);
	t.expect(await storely.get("foo")).toBe("bar");
	t.expect(await storely.get("fizz")).toBeUndefined();
	t.expect(await storely.get("ping")).toBe("pong");
	tk.freeze(startTime + 250);
	t.expect(await storely.get("foo")).toBeUndefined();
	t.expect(await storely.get("ping")).toBe("pong");
	tk.freeze(startTime + 350);
	t.expect(await storely.get("ping")).toBeUndefined();
	tk.reset();
});

testRunner.it(
	'.set(key, val, ttl) where ttl is "0" overwrites default ttl option and sets key to never expire',
	async (t) => {
		const startTime = Date.now();
		tk.freeze(startTime);
		const store = new Map();
		const storely = new Storely({ store, ttl: 200 });
		await storely.set("foo", "bar", 0);
		t.expect(await storely.get("foo")).toBe("bar");
		tk.freeze(startTime + 250);
		t.expect(await storely.get("foo")).toBe("bar");
		tk.reset();
	},
);

testRunner.it("should be able to set the ttl as default option and then property", async (t) => {
	const storely = new Storely({ store: new Map(), ttl: 100 });
	t.expect(storely.ttl).toBe(100);
	storely.ttl = 200;
	t.expect(storely.ttl).toBe(200);
	t.expect(storely.ttl).toBe(200);
});

testRunner.it(
	"should be able to set the ttl as default option and then property with undefined",
	async (t) => {
		const storely = new Storely({ store: new Map() });
		t.expect(storely.ttl).not.toBeDefined();
		storely.ttl = 200;
		t.expect(storely.ttl).toBe(200);
		t.expect(storely.ttl).toBe(200);
		storely.ttl = undefined;
		t.expect(storely.ttl).not.toBeDefined();
		t.expect(storely.ttl).not.toBeDefined();
	},
);

testRunner.it("should emit error if set fails", async (t) => {
	const adapter = new StorelyMemoryAdapter(new Map());
	adapter.set = testRunner.vi.fn().mockRejectedValue(new Error("store set error"));
	const storely = new Storely({ store: adapter });
	const errorHandler = testRunner.vi.fn();
	storely.on("error", errorHandler);
	const result = await storely.set("foo", "bar");
	t.expect(result).toBe(false);
	t.expect(errorHandler).toHaveBeenCalledWith(new Error("store set error"));
});

testRunner.it("should return when value equals non boolean", async (t) => {
	const store = new Map();
	// @ts-expect-error
	store.set = () => "foo";
	const storely = new Storely(store);
	const result = await storely.set("foo111", "bar111");
	t.expect(result).toBe(true);
});

testRunner.it("should return store set value equals non boolean", async (t) => {
	const store = new Map();
	// @ts-expect-error
	store.set = () => true;
	const storely = new Storely(store);
	const result = await storely.set("foo1112", "bar1112");
	t.expect(result).toBe(true);
});

testRunner.it("should emit error and return false when setting a Symbol value", async (t) => {
	const storely = new Storely({ store: new Map() });
	const errorHandler = testRunner.vi.fn();
	storely.on("error", errorHandler);
	const result = await storely.set("key", Symbol("test"));
	t.expect(result).toBe(false);
	t.expect(errorHandler).toHaveBeenCalledWith("symbol cannot be serialized");
});

testRunner.it(
	"setMany returns array of true when store.setMany returns void (backward compat)",
	async (t) => {
		const map = new Map<string, unknown>();
		const store: StorelyStorageAdapter = {
			namespace: undefined as string | undefined,
			async get(key: string) {
				return map.get(key);
			},
			async set(key: string, value: unknown) {
				map.set(key, value);
			},
			async delete(key: string) {
				return map.delete(key);
			},
			async clear() {
				map.clear();
			},
			async setMany(_entries: Array<{ key: string; value: unknown; ttl?: number }>) {
				// Intentionally returns void/undefined to simulate old adapter
			},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const storely = new Storely({ store: store as any });
		const result = await storely.setMany([
			{ key: "a", value: "1" },
			{ key: "b", value: "2" },
		]);
		t.expect(result).toEqual([true, true]);
	},
);

testRunner.it("setMany returns false entries when store.setMany throws", async (t) => {
	const store = {
		async get(_key: string) {},
		async set(_key: string, _value: unknown) {},
		async delete(_key: string) {
			return true;
		},
		async clear() {},
		async setMany(_entries: Array<{ key: string; value: unknown; ttl?: number }>) {
			throw new Error("store setMany failure");
		},
		on() {
			return store;
		},
	};
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	const storely = new Storely({ store: store as any });
	storely.on("error", () => {});
	const result = await storely.setMany([
		{ key: "a", value: "1" },
		{ key: "b", value: "2" },
	]);
	t.expect(result).toEqual([false, false]);
});

testRunner.it("setMany should fallback to individual set when store has no setMany", async (t) => {
	const store = createStore();
	const storely = new Storely({ store });
	const result = await storely.setMany([
		{ key: "k1", value: "v1" },
		{ key: "k2", value: "v2" },
	]);
	t.expect(result).toEqual([true, true]);
	t.expect(await storely.get("k1")).toBe("v1");
	t.expect(await storely.get("k2")).toBe("v2");
});
