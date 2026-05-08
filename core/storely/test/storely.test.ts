import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Storely, { StorelyHooks, StorelyMemoryAdapter, StorelySanitize } from "../src/index.js";
import { StorelyStats } from "../src/stats.js";
import { createMockCompression, createStore, delay } from "./test-utils.js";

describe("constructor", () => {
	test("Storely is a class that can be instantiated with or without a store", () => {
		expect(typeof Storely).toBe("function");
		// @ts-expect-error
		expect(() => Storely()).toThrow(); // eslint-disable-line new-cap
		expect(() => new Storely()).not.toThrow();
		expect(new Storely()).toBeDefined();
		expect(new Storely(new Map())).toBeDefined();
	});

	test("when setting store property with undefined it should default to StorelyMemoryAdapter", () => {
		const store = undefined;
		const storely = new Storely({ store });
		expect(storely.store).toBeInstanceOf(StorelyMemoryAdapter);
	});

	test("accepts storage adapters via options, as first arg, or with additional options", async () => {
		const store1 = new Map();
		const storely1 = new Storely<string>({ store: store1 });
		await storely1.set("foo", "bar");
		expect(await storely1.get("foo")).toBe("bar");
		expect(store1.size).toBe(1);

		const store2 = new Map();
		const storely2 = new Storely<string>(store2);
		await storely2.set("foo", "bar");
		expect(await storely2.get("foo")).toBe("bar");

		const store3 = new Map();
		const storely3 = new Storely(store3, { namespace: "test" });
		await storely3.set("foo", "bar");
		expect(storely3.namespace).toBe("test");
	});

	test("allows get and set the store via property", async () => {
		const store = new Map();
		const storely = new Storely<string>();
		storely.store = store;
		await storely.set("foo", "bar");
		expect(await storely.get("foo")).toBe("bar");
		expect(storely.store).toBeInstanceOf(StorelyMemoryAdapter);
	});

	test("should throw if invalid storage on store property or constructor", async () => {
		const storely = new Storely<string>();
		storely.store = new Map();
		await storely.set("foo", "bar");
		expect(() => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			storely.store = { get() {}, set() {}, delete() {} };
		}).toThrow();

		expect(
			() =>
				new Storely({
					store: {
						async get(key: string) {
							new Map().get(key);
						},
					},
				}),
		).toThrow();
	});

	test("should treat non-positive ttl as undefined", () => {
		const storely1 = new Storely();
		storely1.setTtl(-100);
		expect(storely1.ttl).toBeUndefined();

		expect(new Storely({ ttl: -500 }).ttl).toBeUndefined();

		const storely2 = new Storely();
		storely2.setTtl(0);
		expect(storely2.ttl).toBeUndefined();

		expect(new Storely({ ttl: 0 }).ttl).toBeUndefined();
	});
});

describe("store", () => {
	test("should be able to set the store and namespace via property", () => {
		const store = createStore();
		const storely = new Storely({ store });
		expect(storely.store).toBeDefined();
		expect(storely.namespace).toBeUndefined();
		storely.namespace = "test";
		expect(storely.namespace).toBe("test");
		expect(storely.store.namespace).toBe("test");
	});
});

describe("namespace", () => {
	test("will not prefix if there is no namespace", async () => {
		const storely = new Storely();
		expect(storely.namespace).toBeUndefined();
		await storely.set("foo", "bar");
		await storely.set("foo1", "bar1");
		await storely.set("foo2", "bar2");
		expect(await storely.get("foo")).toBe("bar");
		const values = (await storely.get<string>(["foo", "foo1", "foo2"])) as string[];
		expect(values).toStrictEqual(["bar", "bar1", "bar2"]);
	});
});

describe("serialization", () => {
	test("uses custom serializer when provided instead of default", async () => {
		expect.assertions(3);
		const store = new Map();
		const serialization = {
			stringify(data: unknown) {
				expect(true).toBeTruthy();
				return JSON.stringify(data);
			},
			parse<T>(data: string) {
				expect(true).toBeTruthy();
				return JSON.parse(data) as T;
			},
		};

		const storely = new Storely({ store, serialization });
		await storely.set("foo", "bar");
		expect(await storely.get("foo")).toBe("bar");
	});

	test("supports async serializer/deserializer", async () => {
		expect.assertions(3);
		const serialization = {
			async stringify(data: unknown) {
				expect(true).toBeTruthy();
				return JSON.stringify(data);
			},
			async parse<T>(data: string) {
				expect(true).toBeTruthy();
				return JSON.parse(data) as T;
			},
		};

		const storely = new Storely({ serialization });
		await storely.set("foo", "bar");
		expect(await storely.get("foo")).toBe("bar");
	});

	test("serialization property getter/setter and disable behavior", async () => {
		// Get/set serialization property
		const serialization = {
			stringify: (data: unknown) => JSON.stringify(data),
			parse: <T>(data: string) => JSON.parse(data) as T,
		};
		const storely = new Storely({ store: new Map(), serialization });
		await storely.set("foo", "bar");
		expect(await storely.get("foo")).toBe("bar");
		const newSerialization = {
			stringify: (data: unknown) => JSON.stringify(data),
			parse: <T>(data: string) => JSON.parse(data) as T,
		};
		storely.serialization = newSerialization;
		expect(storely.serialization).toBe(newSerialization);

		// Setting to false clears the adapter
		storely.serialization = false;
		expect(storely.serialization).toBeUndefined();

		// Will not serialize/compress if serialization is undefined
		const storely2 = new Storely({ compression: createMockCompression() });
		storely2.serialization = undefined;
		const complexObject = { foo: "bar", fizz: "buzz" };
		await storely2.set("foo-complex", complexObject);
		await storely2.set("foo", "bar");
		expect(await storely2.get("foo")).toBe("bar");
		expect(await storely2.get("foo-complex")).toStrictEqual(complexObject);
	});

	test("encode returns data as-is when serialization is disabled", async () => {
		const storely = new Storely({ serialization: false, compression: createMockCompression() });
		const data = { value: "hello", expires: undefined };
		const result = await storely.encode(data);
		expect(result).toStrictEqual(data);
	});

	test("decode edge cases", async () => {
		const storely = new Storely();
		// Returns object if not string
		const complexObject = { foo: "bar", fizz: "buzz" };
		expect(await storely.decode({ value: complexObject })).toStrictEqual({ value: complexObject });

		// Returns undefined for null/undefined
		// biome-ignore lint/suspicious/noExplicitAny: test
		expect(await storely.decode(undefined as any)).toBeUndefined();
		// biome-ignore lint/suspicious/noExplicitAny: test
		expect(await storely.decode(null as any)).toBeUndefined();

		// No serialization, no compression returns raw object
		const storely2 = new Storely({ serialization: false });
		expect(await storely2.decode({ value: "hello", expires: undefined })).toStrictEqual({
			value: "hello",
			expires: undefined,
		});

		// No serialization, no compression returns undefined for string
		expect(await storely2.decode("some-string")).toBeUndefined();

		// Returns undefined when decompressed string is invalid JSON
		const storely3 = new Storely({
			serialization: false,
			compression: {
				async compress(value: unknown) {
					return value;
				},
				async decompress(_value: unknown) {
					return "not-valid-json{{{";
				},
			},
		});
		expect(await storely3.decode("anything")).toBeUndefined();
	});
});

describe("compression", () => {
	test("pass compress options and get/set property", async () => {
		const storely = new Storely({ store: new Map(), compression: createMockCompression() });
		await storely.set("foo", "bar");
		expect(await storely.get("foo")).toBe("bar");

		const storely2 = new Storely();
		const compression = createMockCompression();
		expect(storely2.compression).not.toBeDefined();
		storely2.compression = compression;
		expect(storely2.compression).toBe(compression);
	});
});

describe("encryption", () => {
	test("can get and set the encryption property", () => {
		const storely = new Storely();
		expect(storely.encryption).toBeUndefined();
		const adapter = {
			async encrypt(data: string) {
				return `enc:${data}`;
			},
			async decrypt(data: string) {
				return data.replace("enc:", "");
			},
		};
		storely.encryption = adapter;
		expect(storely.encryption).toBe(adapter);
		storely.encryption = undefined;
		expect(storely.encryption).toBeUndefined();
	});

	test("encode and decode with encryption", async () => {
		const storely = new Storely({
			encryption: {
				async encrypt(data: string) {
					return Buffer.from(data).toString("base64");
				},
				async decrypt(data: string) {
					return Buffer.from(data, "base64").toString("utf8");
				},
			},
		});
		await storely.set("foo", "bar");
		expect(await storely.get("foo")).toBe("bar");
	});

	test("encode throws on failure, decode emits error and returns undefined", async () => {
		const storelyEnc = new Storely({
			encryption: {
				encrypt() {
					throw new Error("encrypt failed");
				},
				async decrypt(data: string) {
					return data;
				},
			},
		});
		await expect(storelyEnc.encode({ value: "hello", expires: undefined })).rejects.toThrow(
			"encrypt failed",
		);

		const storelyDec = new Storely({
			encryption: {
				async encrypt(data: string) {
					return data;
				},
				decrypt() {
					throw new Error("decrypt failed");
				},
			},
		});
		const errorHandler = vi.fn();
		storelyDec.on("error", errorHandler);
		expect(await storelyDec.decode("some-data")).toBeUndefined();
		expect(errorHandler).toHaveBeenCalled();
	});
});

describe("delete", () => {
	test("should delete multiple keys and handle nonexistent keys", async () => {
		const storely = new Storely({ store: new Map() });
		await storely.set("foo", "bar");
		await storely.set("foo1", "bar1");
		await storely.set("foo2", "bar2");
		expect(await storely.delete(["foo", "foo1", "foo2"])).toBeTruthy();
		expect(await storely.get("foo")).toBeUndefined();

		// Nonexistent keys
		expect(await storely.delete(["foo", "foo1", "foo2"])).toEqual([false, false, false]);
	});

	test("should handle error on store delete", async () => {
		const store = new Map();
		store.delete = vi.fn().mockRejectedValue(new Error("store delete error"));
		const storely = new Storely(store);
		const errorHandler = vi.fn();
		storely.on("error", errorHandler);
		expect(await storely.delete("foo55")).toBe(false);
		expect(errorHandler).toHaveBeenCalledWith(new Error("store delete error"));
	});
});

describe("has", () => {
	test("should return true/false for existing/missing keys", async () => {
		const storely = new Storely();
		await storely.set("foo", "bar");
		expect(await storely.has("foo")).toBe(true);
		expect(await storely.has("fizz")).toBe(false);
	});

	test("should return false for expired keys", async () => {
		const storely = new Storely({ store: new Map() });
		await storely.set("foo", "bar", 1000);
		expect(await storely.has("foo")).toBe(true);
		await delay(1100);
		expect(await storely.has("foo")).toBe(false);
		expect(await storely.get("foo")).toBeUndefined();
	});

	test("should delegate to store.has when store is not StorelyMemoryAdapter", async () => {
		const store = createStore();
		const storely = new Storely({ store });
		await storely.set("foo", "bar");
		expect(await storely.has("foo")).toBe(true);
		expect(await storely.has("nonexistent")).toBe(false);
	});

	test("should handle error on store has and hasMany", async () => {
		const storely = new Storely({ store: new Map() });
		storely.store.has = vi.fn().mockRejectedValue(new Error("store has error"));
		const errorHandler = vi.fn();
		storely.on("error", errorHandler);
		expect(await storely.has("foo")).toBe(false);

		const storely2 = new Storely({ store: new Map() });
		storely2.store.hasMany = vi.fn().mockRejectedValue(new Error("store hasMany error"));
		const errorHandler2 = vi.fn();
		storely2.on("error", errorHandler2);
		expect(await storely2.hasMany(["foo", "bar"])).toEqual([false, false]);
		expect(errorHandler2).toHaveBeenCalledWith(new Error("store hasMany error"));
	});
});

describe("clear", () => {
	test("should handle error on store clear and emit clear event", async () => {
		const adapter = new StorelyMemoryAdapter(new Map());
		const storely = new Storely({ store: adapter });
		storely.store.clear = vi.fn().mockRejectedValue(new Error("store clear error"));
		const errorHandler = vi.fn();
		storely.on("error", errorHandler);
		await storely.clear();
		expect(errorHandler).toHaveBeenCalledWith(new Error("store clear error"));

		const storely2 = new Storely();
		storely2.on("clear", () => {
			expect(true).toBeTruthy();
		});
		await storely2.clear();
	});
});

describe("disconnect", () => {
	test("close connection successfully with various store types", async () => {
		const storely1 = new Storely({ store: createStore() });
		await storely1.set("foo", "bar");
		expect(await storely1.disconnect()).toBeUndefined();

		const storely2 = new Storely({ store: new Map() });
		expect(await storely2.disconnect()).toBeUndefined();
	});

	test("emit disconnect event and handle error", async () => {
		const storely = new Storely();
		storely.on("disconnect", () => {
			expect(true).toBeTruthy();
		});
		await storely.disconnect();

		const storely2 = new Storely({ store: new Map() });
		storely2.store.disconnect = vi.fn().mockRejectedValue(new Error("disconnect error"));
		const errorHandler = vi.fn();
		storely2.on("error", errorHandler);
		await storely2.disconnect();
		expect(errorHandler).toHaveBeenCalledWith(new Error("disconnect error"));
	});
});

describe("stats", () => {
	test("opts.stats and stats setter", () => {
		const storely = new Storely({ stats: true });
		expect(storely.stats.enabled).toBe(true);
		const newStats = new StorelyStats({ enabled: true });
		storely.stats = newStats;
		expect(storely.stats).toBe(newStats);
	});
});

describe("iterator", () => {
	test("should exist with store adapter", () => {
		const storely = new Storely({ store: createStore() });
		expect(typeof storely.iterator).toBe("function");
	});

	test("doesn't yield values from other namespaces with various configurations", async () => {
		const configs = [
			{}, // plain
			{ compression: createMockCompression() },
			{
				serialization: {
					stringify: (d: unknown) => JSON.stringify(d),
					parse: <T>(d: string) => JSON.parse(d) as T,
				},
			},
		];

		for (const extraOpts of configs) {
			const storelyStore = new Map();
			const storely1 = new Storely({ store: storelyStore, namespace: "storely1", ...extraOpts });
			const map1 = new Map(
				Array.from({ length: 5 })
					.fill(0)
					.map((_x, i) => [String(i), String(i + 10)]),
			);
			const toResolve = [];
			for (const [key, value] of map1) {
				toResolve.push(storely1.set(key, value));
			}

			await Promise.all(toResolve);

			const storely2 = new Storely({ store: storelyStore, namespace: "storely2", ...extraOpts });
			const map2 = new Map(
				Array.from({ length: 5 })
					.fill(0)
					.map((_x, i) => [String(i), i + 11]),
			);
			toResolve.length = 0;
			for (const [key, value] of map2) {
				toResolve.push(storely2.set(key, value));
			}

			await Promise.all(toResolve);

			for await (const [key, value] of storely2.iterator()) {
				const doesKeyExist = map2.has(key);
				const isValueSame = map2.get(key) === value;
				expect(doesKeyExist && isValueSame).toBeTruthy();
			}
		}
	});

	test("should detect iterable adapter when store has iterator method", () => {
		const map = new Map<string, unknown>();
		const store = {
			opts: { url: "redis://localhost:6379" },
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
			async *iterator(namespace?: string) {
				for (const [key, value] of map) {
					if (!namespace || key.startsWith(namespace)) {
						yield [key, value];
					}
				}
			},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const storely = new Storely(store as any);
		expect(storely.iterator).toBeDefined();
	});

	test("store without iterator support yields no entries (constructor and setter)", async () => {
		const store = {
			namespace: undefined as string | undefined,
			async get(_key: string) {
				return undefined;
			},
			async set(_key: string, _value: unknown) {},
			async delete(_key: string) {
				return true;
			},
			async clear() {},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const storely1 = new Storely(store as any);
		const entries1: unknown[] = [];
		for await (const entry of storely1.iterator()) {
			entries1.push(entry);
		}
		expect(entries1.length).toBe(0);

		// Via setter
		const storely2 = new Storely();
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		storely2.store = store as any;
		const entries2: unknown[] = [];
		for await (const _entry of storely2.iterator()) {
			entries2.push(_entry);
		}
		expect(entries2.length).toBe(0);
	});

	test("works with store that has an iterator method", async () => {
		const map = new Map<string, string>();
		const store = {
			namespace: undefined as string | undefined,
			async get(key: string) {
				return map.get(key);
			},
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			async set(key: string, value: any) {
				map.set(key, value);
				return true;
			},
			async delete(key: string) {
				return map.delete(key);
			},
			async clear() {
				map.clear();
			},
			async *iterator() {
				for (const [key, value] of map) {
					yield [key, value];
				}
			},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const storely = new Storely(store as any);
		await storely.set("key1", "value1");
		await storely.set("key2", "value2");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of storely.iterator()) {
			entries.push(entry as [string, unknown]);
		}
		expect(entries.length).toBe(2);
	});

	test("deletes expired entries from store with iterator method", async () => {
		const map = new Map<string, string>();
		const store = {
			namespace: undefined as string | undefined,
			async get(key: string) {
				return map.get(key);
			},
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			async set(key: string, value: any) {
				map.set(key, value);
				return true;
			},
			async delete(key: string) {
				return map.delete(key);
			},
			async clear() {
				map.clear();
			},
			async *iterator() {
				for (const [key, value] of map) {
					yield [key, value];
				}
			},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const storely = new Storely({ store: store as any, checkExpired: true });
		await storely.set("fresh", "value1");
		await storely.set("expired", "value2", 1);
		await delay(10);

		const entries: Array<[string, unknown]> = [];
		for await (const entry of storely.iterator()) {
			entries.push(entry as [string, unknown]);
		}
		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe("fresh");
		expect(await storely.has("expired")).toBe(false);
	});

	test("should not increment deletes stat indefinitely", async () => {
		vi.useFakeTimers();
		try {
			const storely = new Storely({ stats: true });
			await storely.set("foo", "bar", 100);
			expect(storely.stats.deletes).toBe(0);
			vi.advanceTimersByTime(101);

			let iterationCount = 0;
			for await (const _ of storely.iterator() ?? []) {
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(storely.stats.deletes).toBe(0);

			iterationCount = 0;
			for await (const _ of storely.iterator() ?? []) {
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(storely.stats.deletes).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("checkExpired", () => {
	test("checkExpired getter defaults to false and can be set to true", () => {
		expect(new Storely().checkExpired).toBe(false);
		expect(new Storely({ checkExpired: true }).checkExpired).toBe(true);
	});

	test("get/getMany/getRaw/getManyRaw return undefined for expired keys", async () => {
		const storely = new Storely({ checkExpired: true });
		await storely.set("foo", "bar", 1);
		await storely.set("baz", "qux");
		await delay(10);

		expect(await storely.get("foo")).toBeUndefined();

		const values = await storely.get(["foo", "baz"]);
		expect(values[0]).toBeUndefined();
		expect(values[1]).toBe("qux");

		await storely.set("foo2", "bar2", 1);
		await delay(10);
		expect(await storely.getRaw("foo2")).toBeUndefined();

		await storely.set("foo3", "bar3", 1);
		await storely.set("baz3", "qux3");
		await delay(10);
		const rawValues = await storely.getManyRaw(["foo3", "baz3"]);
		expect(rawValues[0]).toBeUndefined();
		expect(rawValues[1]).toEqual({ value: "qux3" });
	});

	test("has/hasMany work correctly with expired keys", async () => {
		const storely = new Storely({ checkExpired: true });
		await storely.set("foo", "bar");
		expect(await storely.has("foo")).toBe(true);

		await storely.set("exp", "val", 1);
		await delay(10);
		expect(await storely.has("exp")).toBe(false);

		await storely.set("exp2", "val2", 1);
		await storely.set("baz", "qux");
		await delay(10);
		expect(await storely.has(["exp2", "baz"])).toEqual([false, true]);
	});
});

describe("throwErrors", () => {
	const throwingStore = new Map();
	throwingStore.get = () => {
		throw new Error("Test error");
	};
	throwingStore.set = () => {
		throw new Error("Test error");
	};
	throwingStore.delete = () => {
		throw new Error("Test error");
	};
	throwingStore.clear = () => {
		throw new Error("Test error");
	};
	throwingStore.has = () => {
		throw new Error("Test error");
	};

	type TestData = { key: string; value: string };
	let testData: TestData[] = [];
	let testKeys: string[] = [];

	beforeEach(() => {
		testData = Array.from({ length: 5 }, () => ({
			key: faker.string.alphanumeric(10),
			value: faker.string.alphanumeric(10),
		}));
		testKeys = testData.map((data) => data.key);
	});

	test("throwOnErrors getter/setter and constructor option", () => {
		const storely = new Storely(throwingStore);
		expect(storely.throwOnErrors).toBe(false);
		storely.throwOnErrors = true;
		expect(storely.throwOnErrors).toBe(true);

		const storely2 = new Storely({ store: throwingStore, throwOnErrors: true });
		expect(storely2.throwOnErrors).toBe(true);
	});

	test("should throw on set/get/delete/clear/has when throwOnErrors is true", async () => {
		const storely = new Storely(throwingStore);
		storely.throwOnErrors = true;
		await expect(storely.set("key", "value")).rejects.toThrow("Test error");
		await expect(storely.get("key")).rejects.toThrow("Test error");
		await expect(storely.delete("key")).rejects.toThrow("Test error");
		await expect(storely.clear()).rejects.toThrow("Test error");
		await expect(storely.has("key")).rejects.toThrow("Test error");
	});

	test("should not throw when throwOnErrors is false", async () => {
		const storely = new Storely(throwingStore);
		storely.throwOnErrors = false;
		storely.on("error", () => {});
		expect(await storely.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10))).toBe(
			false,
		);
		expect(await storely.get(faker.string.alphanumeric(10))).toBeUndefined();
		expect(await storely.delete(faker.string.alphanumeric(10))).toBe(false);
		expect(await storely.clear()).toBeUndefined();
		expect(await storely.has(faker.string.alphanumeric(10))).toBe(false);
	});

	test("should throw on deleteMany and setMany when throwOnErrors is true", async () => {
		const storely = new Storely(throwingStore);
		storely.throwOnErrors = true;
		await expect(storely.deleteMany(testKeys)).rejects.toThrow("Test error");
		await expect(storely.setMany(testData)).rejects.toThrow("Test error");
	});
});

describe("sanitize", () => {
	test("should not sanitize keys by default", async () => {
		const storely = new Storely();
		await storely.set("test'; DROP TABLE", "value");
		expect(await storely.get("test'; DROP TABLE")).toBe("value");
	});

	test("should sanitize keys when enabled and support granular control", async () => {
		const storely = new Storely({ sanitize: { keys: true, namespace: true } });
		await storely.set("test; DROP TABLE", "value");
		expect(await storely.get("test DROP TABLE")).toBe("value");

		const storely2 = new Storely({ sanitize: { keys: { sql: true, mongo: false } } });
		await storely2.set("$key;test", "value");
		expect(await storely2.get("$keytest")).toBe("value");
	});

	test("should sanitize keys in getMany, has, delete, and setMany", async () => {
		const storely = new Storely({ sanitize: { keys: true, namespace: true } });
		await storely.set("clean-key", "value1");
		const result = await storely.getMany(["clean-key", "miss;key"]);
		expect(result[0]).toBe("value1");
		expect(result[1]).toBeUndefined();

		await storely.set("test-key", "value");
		expect(await storely.has("test-key")).toBe(true);
		expect(await storely.has("test'-key")).toBe(false);

		await storely.set("testkey", "value");
		await storely.delete("test;key");
		expect(await storely.has("testkey")).toBe(false);

		await storely.setMany([
			{ key: "key;1", value: "value1" },
			{ key: "key--2", value: "value2" },
		]);
		expect(await storely.get("key1")).toBe("value1");
		expect(await storely.get("key2")).toBe("value2");
	});

	test("getter/setter and updateOptions", () => {
		const storely = new Storely();
		expect(storely.sanitize).toBeInstanceOf(StorelySanitize);
		expect(storely.sanitize.enabled).toBe(false);

		(storely.sanitize as StorelySanitize).updateOptions({ keys: true, namespace: true });
		expect(storely.sanitize.enabled).toBe(true);

		(storely.sanitize as StorelySanitize).updateOptions({ keys: { sql: true, mongo: false } });
		expect(storely.sanitize.keys.sql).toBe(true);
		expect(storely.sanitize.keys.mongo).toBe(false);

		storely.sanitize = new StorelySanitize();
		expect(storely.sanitize.enabled).toBe(false);
	});

	test("updateOptions enables sanitization categories", async () => {
		const storely = new Storely();
		(storely.sanitize as StorelySanitize).updateOptions({ keys: true, namespace: true });
		await storely.set("test;../key\0val", "value");
		expect(await storely.get("testkeyval")).toBe("value");

		const storely2 = new Storely();
		(storely2.sanitize as StorelySanitize).updateOptions({
			keys: { sql: true, mongo: false, path: false },
		});
		await storely2.set("test;$key/../path", "value");
		expect(await storely2.get("test$key/../path")).toBe("value");
	});

	test("harmless characters pass through when sanitization is enabled", async () => {
		const storely = new Storely({ sanitize: { keys: true, namespace: true } });
		await storely.set("user's-data", "value");
		expect(await storely.get("user's-data")).toBe("value");
	});

	test("namespace sanitization at construction, setter, and independent patterns", () => {
		const storely1 = new Storely({
			namespace: "ns;evil",
			sanitize: { keys: true, namespace: true },
		});
		expect(storely1.namespace).toBe("nsevil");

		const storely2 = new Storely({ sanitize: { keys: true, namespace: true } });
		storely2.namespace = "ns;evil";
		expect(storely2.namespace).toBe("nsevil");

		const storely3 = new Storely({ namespace: "ns;evil", sanitize: { namespace: false } });
		expect(storely3.namespace).toBe("ns;evil");
	});

	test("should support independent patterns for keys and namespace", async () => {
		const storely = new Storely({
			namespace: "ns;../test",
			sanitize: { keys: { sql: true, path: false }, namespace: { sql: false, path: true } },
		});
		expect(storely.namespace).toBe("ns;test");
		await storely.set("key;../value", "data");
		expect(await storely.get("key../value")).toBe("data");
	});

	test("empty key after sanitization is gracefully rejected", async () => {
		const storely = new Storely({ sanitize: { keys: true, namespace: true } });
		expect(await storely.set(";", "value")).toBe(false);
		expect(await storely.get(";")).toBeUndefined();
		expect(await storely.getRaw(";")).toBeUndefined();
		expect(await storely.setRaw(";", { value: "value", expires: undefined })).toBe(false);
		expect(await storely.delete(";")).toBe(false);
		expect(await storely.has(";")).toBe(false);
	});
});

describe("decodeWithExpire", () => {
	test("should return undefined for string data when serialization is disabled", async () => {
		const storely = new Storely({ serialization: false });
		expect(await storely.decodeWithExpire("key", "some-string-value")).toEqual([undefined]);
	});

	test("should handle mixed valid and undeserializable data", async () => {
		const storely = new Storely({ serialization: false });
		const validData = { value: "bar", expires: undefined };
		const result = await storely.decodeWithExpire(
			["key1", "key2"],
			[validData, "undeserializable-string"],
		);
		expect(result[0]?.value).toBe("bar");
		expect(result[1]).toBeUndefined();
	});

	test("should not call decompress for object data when compression is enabled but serialization is disabled", async () => {
		const mockCompression = {
			compress: vi.fn((data: string) => data),
			decompress: vi.fn((data: string) => data),
		};
		const storely = new Storely({ serialization: false, compression: mockCompression });
		const objectData = { value: "test-value", expires: undefined };
		const result = await storely.decodeWithExpire("key", objectData);
		expect(result[0]?.value).toBe("test-value");
		expect(mockCompression.decompress).not.toHaveBeenCalled();
	});
});

describe("hookWithDeprecated", () => {
	test("hookWithDeprecated runs both new and deprecated hooks when both have listeners", async () => {
		const s = new Storely();
		const callOrder: string[] = [];
		s.onHook(StorelyHooks.BEFORE_GET, () => {
			callOrder.push("new");
		});
		s.onHook(StorelyHooks.PRE_GET, () => {
			callOrder.push("deprecated");
		});
		await s.get("missing");
		expect(callOrder).toEqual(["new", "deprecated"]);
	});

	test("hookWithDeprecated skips entirely when no listeners are attached", async () => {
		const s = new Storely();
		// No listeners. Just exercise the path; we're asserting it doesn't throw and returns
		// a value identical to the slow path.
		await s.set("k", "v");
		expect(await s.get("k")).toBe("v");
	});
});
