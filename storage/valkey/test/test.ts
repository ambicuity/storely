import Storely from "@ambicuity/core";
import { storageTestSuite, storelyIteratorTests, storelyTestSuite } from "@ambicuity/test-suite";
import { faker } from "@faker-js/faker";
import Redis, { type Cluster } from "iovalkey";
import { it } from "vitest";
import StorelyValkey, { createStorely } from "../src/index.js";

const REDIS_HOST = "localhost:6370";
const redisURI = `redis://${REDIS_HOST}`;

const store = () => new StorelyValkey(redisURI);

storelyTestSuite(it, Storely, store);
storelyIteratorTests(it, Storely, store);
storageTestSuite(it, store, { batch: false });

it("reuse a redis instance", async (t) => {
	const redis = new Redis(redisURI);
	// @ts-expect-error foo doesn't exist on Redis
	redis.foo = "bar";
	const storely = new StorelyValkey(redis);
	t.expect(storely.client.foo).toBe("bar");

	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value);
	t.expect(await storely.get(key)).toBe(value);
});

it("set an undefined key", async (t) => {
	const redis = new Redis(redisURI);
	const storely = new StorelyValkey(redis);

	const key = faker.string.alphanumeric(10);
	await storely.set(key, undefined);
	const result = await storely.get(key);
	t.expect(result).toBe(undefined);
});

it("Async Iterator 0 element test", async (t) => {
	const redis = new Redis(redisURI);
	const storely = new StorelyValkey(redis);
	await storely.clear();
	const iterator = storely.iterator("storely");
	const key = await iterator.next();
	t.expect(key.value).toBe(undefined);
});

it("close connection successfully", async (t) => {
	const redis = new Redis(redisURI);
	const storely = new StorelyValkey(redis);
	const key = faker.string.alphanumeric(10);
	t.expect(await storely.get(key)).toBe(undefined);
	await storely.disconnect();
	try {
		await storely.get(key);
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

it("clear method with empty keys should not error", async (t) => {
	try {
		const storely = new StorelyValkey(redisURI);
		t.expect(await storely.clear()).toBeUndefined();
	} catch {
		t.expect.fail();
	}
});

it(".clear() cleaned namespace", async (t) => {
	// Setup
	const storelyRedis = new StorelyValkey(redisURI);
	const ns = faker.string.alphanumeric(8);
	const storely = new Storely(storelyRedis, {
		namespace: ns,
	});

	const length = 1;
	const key = [...Array.from({ length }).keys()].join("");

	await storely.set(key, "value", 1);

	await new Promise((r) => {
		setTimeout(r, 250);
	});

	await storely.clear();
	await storely.disconnect();

	// Test
	const redis = new Redis(redisURI);

	// Namespace should also expire after calling clear
	t.expect(await redis.exists(`namespace:${ns}`)).toBe(0);

	// Memory of each key should be null
	t.expect(await redis.memory("USAGE", `namespace:${ns}`)).toBe(null);
});

it("Storely stores ttl without const", async (t) => {
	const storely = new Storely(new StorelyValkey(redisURI));
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value, 100);
	t.expect(await storely.get(key)).toBe(value);
	await new Promise((resolve) => {
		setTimeout(resolve, 200);
	});
	t.expect(await storely.get(key)).toBe(undefined);
});

it("should handle StorelyOptions without uri", (t) => {
	const options = {
		isCluster: true,
	};
	const storely = new StorelyValkey(options as Cluster);
	t.expect(storely.client instanceof Redis).toBeTruthy();
});

it("should handle StorelyOptions with family option", (t) => {
	const options = {
		options: {},
		family: 4,
	};
	const storely = new StorelyValkey(options);
	t.expect(storely.client instanceof Redis).toBeTruthy();
});

it("should handle RedisOptions", (t) => {
	const options = {
		db: 2,
		connectionName: "name",
	};
	const storely = new StorelyValkey(options);
	t.expect(storely.client instanceof Redis).toBeTruthy();
});

it("set method should use sets when useSets is false", async (t) => {
	const options = { useSets: false };
	const storely = new StorelyValkey(options);

	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value);

	const result = await storely.get(key);
	t.expect(result).toBe(value);
});

it("clear method when useSets is false", async (t) => {
	const options = { useSets: false };
	const storely = new StorelyValkey(options);

	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);

	await storely.set(key1, val1);
	await storely.set(key2, val2);

	await storely.clear();

	const value = await storely.get(key1);
	const value2 = await storely.get(key2);
	t.expect(value).toBe(undefined);
	t.expect(value2).toBe(undefined);
});

it("clear method when useSets is false and empty keys should not error", async (t) => {
	const options = { useSets: false };
	const storely = new StorelyValkey(options);
	t.expect(await storely.clear()).toBeUndefined();
});

it("when passing in ioredis set the options.useSets", (t) => {
	const options = { useSets: false };
	const redis = new Redis(redisURI);
	const storely = new StorelyValkey(redis, options);

	t.expect(storely.useSets).toBe(false);
});

it("del should work when not using useSets", async (t) => {
	const options = { useSets: false };
	const redis = new Redis(redisURI);
	const storely = new StorelyValkey(redis, options);

	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value);

	await storely.delete(key);

	const result = await storely.get(key);

	t.expect(result).toBe(undefined);
});

it("del should work when using useSets", async (t) => {
	const redis = new Redis(redisURI);
	const storely = new StorelyValkey(redis, { useSets: true });
	const ns = `del-sets-${faker.string.alphanumeric(8)}`;
	storely.namespace = ns;

	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value);
	t.expect(await storely.get(key)).toBe(value);

	const result = await storely.delete(key);
	t.expect(result).toBe(true);
	t.expect(await storely.get(key)).toBe(undefined);

	const resultFalse = await storely.delete("nonexistent");
	t.expect(resultFalse).toBe(false);
});

it("can create a full storely instance with a uri", async (t) => {
	const storely = createStorely(redisURI);
	t.expect(storely).toBeTruthy();
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value);
	t.expect(await storely.get(key)).toBe(value);
});

it("should have default useSets as false", (t) => {
	const storely = new StorelyValkey(redisURI);
	t.expect(storely.useSets).toBe(false);
});

it("should allow setting useSets via setter", (t) => {
	const storely = new StorelyValkey(redisURI);
	storely.useSets = false;
	t.expect(storely.useSets).toBe(false);
});

it("should allow setting and getting namespace via setter", (t) => {
	const storely = new StorelyValkey(redisURI);
	t.expect(storely.namespace).toBeUndefined();
	storely.namespace = "test-ns";
	t.expect(storely.namespace).toBe("test-ns");
});

it("should allow setting redis instance via setter", (t) => {
	const storely = new StorelyValkey(redisURI);
	const newRedis = new Redis(redisURI);
	storely.client = newRedis;
	t.expect(storely.client).toBe(newRedis);
});

it("useSets getter should reflect current useSets value", (t) => {
	const storely = new StorelyValkey(redisURI);
	t.expect(storely.useSets).toBe(false);
	storely.useSets = true;
	t.expect(storely.useSets).toBe(true);
});

it("deprecated useRedisSets getter/setter should still work", (t) => {
	const storely = new StorelyValkey(redisURI);
	t.expect(storely.useRedisSets).toBe(false);
	storely.useRedisSets = true;
	t.expect(storely.useRedisSets).toBe(true);
	t.expect(storely.useSets).toBe(true);
});

it("setMany should set multiple keys", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const key3 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	const val3 = faker.string.alphanumeric(10);
	await storely.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: val2 },
		{ key: key3, value: val3 },
	]);
	const values = await storely.getMany([key1, key2, key3]);
	t.expect(values).toEqual([val1, val2, val3]);
	await storely.disconnect();
});

it("setMany with TTL should expire keys", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.setMany([{ key, value, ttl: 100 }]);
	t.expect(await storely.get(key)).toBe(value);
	await new Promise((r) => {
		setTimeout(r, 150);
	});
	t.expect(await storely.get(key)).toBe(undefined);
	await storely.disconnect();
});

it("setMany with empty array should not error", async (t) => {
	const storely = new StorelyValkey(redisURI);
	await storely.setMany([]);
	t.expect(true).toBe(true);
	await storely.disconnect();
});

it("setMany should skip undefined values", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	await storely.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: undefined },
	]);
	t.expect(await storely.get(key1)).toBe(val1);
	t.expect(await storely.get(key2)).toBe(undefined);
	await storely.disconnect();
});

it("setMany with all undefined values should not error", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await storely.setMany([
		{ key: key1, value: undefined },
		{ key: key2, value: undefined },
	]);
	t.expect(await storely.get(key1)).toBe(undefined);
	t.expect(await storely.get(key2)).toBe(undefined);
	await storely.disconnect();
});

it("setMany with useSets should track keys in set", async (t) => {
	const storely = new StorelyValkey(redisURI, { useSets: true });
	const ns = `setmany-${faker.string.alphanumeric(8)}`;
	storely.namespace = ns;
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await storely.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: val2 },
	]);
	t.expect(await storely.get(key1)).toBe(val1);
	t.expect(await storely.get(key2)).toBe(val2);
	await storely.clear();
	t.expect(await storely.get(key1)).toBe(undefined);
	await storely.disconnect();
});

it("hasMany should return array of booleans", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const key3 = faker.string.alphanumeric(10);
	await storely.set(key1, faker.string.alphanumeric(10));
	await storely.set(key2, faker.string.alphanumeric(10));
	const results = await storely.hasMany([key1, key2, key3]);
	t.expect(results).toEqual([true, true, false]);
	await storely.disconnect();
});

it("hasMany with empty array should return empty array", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const results = await storely.hasMany([]);
	t.expect(results).toEqual([]);
	await storely.disconnect();
});

it("deleteMany should batch delete keys", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await storely.set(key1, val1);
	await storely.set(key2, val2);
	const result = await storely.deleteMany([key1, key2]);
	t.expect(result).toEqual([true, true]);
	t.expect(await storely.get(key1)).toBe(undefined);
	t.expect(await storely.get(key2)).toBe(undefined);
	await storely.disconnect();
});

it("deleteMany with nonexistent keys should return array of false", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const result = await storely.deleteMany([key1, key2]);
	t.expect(result).toEqual([false, false]);
	await storely.disconnect();
});

it("deleteMany with empty array should return empty array", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const result = await storely.deleteMany([]);
	t.expect(result).toEqual([]);
	await storely.disconnect();
});

it("clear with useSets should clear keys tracked in set", async (t) => {
	const storely = new StorelyValkey(redisURI, { useSets: true });
	const ns = `clear-sets-${faker.string.alphanumeric(8)}`;
	storely.namespace = ns;
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await storely.set(key1, val1);
	await storely.set(key2, val2);
	t.expect(await storely.get(key1)).toBe(val1);
	await storely.clear();
	t.expect(await storely.get(key1)).toBe(undefined);
	t.expect(await storely.get(key2)).toBe(undefined);
	await storely.disconnect();
});

it("iterator without namespace should not error", async (t) => {
	const storely = new StorelyValkey(redisURI);
	const iterator = storely.iterator();
	const result = await iterator.next();
	t.expect(result.done === true || Array.isArray(result.value)).toBe(true);
	await storely.disconnect();
});

it("createStorely without arguments should use default uri", async (t) => {
	const storely = createStorely();
	t.expect(storely).toBeTruthy();
	await storely.disconnect();
});

it("iterator with useSets should iterate keys", async (t) => {
	const storelyRedis = new StorelyValkey(redisURI, { useSets: true });
	const ns = `iter-sets-${faker.string.alphanumeric(8)}`;
	const storely = new Storely(storelyRedis, { namespace: ns });

	await storely.clear();
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await storely.set(key1, val1);
	await storely.set(key2, val2);

	const collected = new Map<string, string>();
	for await (const [key, value] of storelyRedis.iterator(ns)) {
		collected.set(key, value);
	}

	t.expect(collected.size).toBe(2);
	await storely.clear();
	await storely.disconnect();
});

it("useSets should use sets: prefix for SET tracking key", async (t) => {
	const redis = new Redis(redisURI);
	const storely = new StorelyValkey(redis, { useSets: true });
	const ns = `sets-prefix-${faker.string.alphanumeric(8)}`;
	storely.namespace = ns;

	const key = faker.string.alphanumeric(10);
	await storely.set(key, "value");

	// The SET tracking key should use the sets: prefix
	t.expect(await redis.exists(`sets:${ns}`)).toBe(1);
	t.expect(await redis.type(`sets:${ns}`)).toBe("set");

	// The old namespace: format should NOT exist
	t.expect(await redis.exists(`namespace:${ns}`)).toBe(0);

	await storely.clear();
	await storely.disconnect();
});

it("useSets clear should clean up legacy namespace: SET keys", async (t) => {
	const redis = new Redis(redisURI);
	const ns = `legacy-${faker.string.alphanumeric(8)}`;

	// Simulate legacy data: a SET at namespace:<ns> with some tracked keys
	const legacyDataKey = `namespace:${ns}:oldkey`;
	await redis.set(legacyDataKey, "oldvalue");
	await redis.sadd(`namespace:${ns}`, legacyDataKey);

	// Create adapter with useSets and call clear
	const storely = new StorelyValkey(redis, { useSets: true });
	storely.namespace = ns;
	await storely.clear();

	// Legacy SET and data keys should be cleaned up
	t.expect(await redis.exists(`namespace:${ns}`)).toBe(0);
	t.expect(await redis.exists(legacyDataKey)).toBe(0);

	await storely.disconnect();
});

it("useSets should not collide with string keys at namespace path", async (t) => {
	const redis = new Redis(redisURI);
	const ns = `collision-${faker.string.alphanumeric(8)}`;

	// Another client stores a string at namespace:<ns>
	await redis.set(`namespace:${ns}`, "some-string-value");

	// useSets operations should work without WRONGTYPE errors
	const storely = new StorelyValkey(redis, { useSets: true });
	storely.namespace = ns;

	const key = faker.string.alphanumeric(10);
	await storely.set(key, "value");
	t.expect(await storely.get(key)).toBe("value");
	await storely.clear();
	t.expect(await storely.get(key)).toBe(undefined);

	// Clean up the string key (not managed by storely)
	await redis.del(`namespace:${ns}`);
	await storely.disconnect();
});

it("useSets without namespace should use 'sets' as key prefix", async (t) => {
	const redis = new Redis(redisURI);
	const storely = new StorelyValkey(redis, { useSets: true });

	const key = faker.string.alphanumeric(10);
	await storely.set(key, "value");

	// SET tracking key should be "sets" (no namespace suffix)
	t.expect(await redis.exists("sets")).toBe(1);
	t.expect(await redis.type("sets")).toBe("set");

	// Data key should be "sets:<key>"
	t.expect(await redis.exists(`sets:${key}`)).toBe(1);

	t.expect(await storely.get(key)).toBe("value");
	await storely.clear();
	t.expect(await storely.get(key)).toBe(undefined);
	await storely.disconnect();
});

it("deleteMany with useSets should remove from set", async (t) => {
	const storely = new StorelyValkey(redisURI, { useSets: true });
	const ns = `delmany-${faker.string.alphanumeric(8)}`;
	storely.namespace = ns;
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await storely.set(key1, val1);
	await storely.set(key2, val2);
	await storely.deleteMany([key1, key2]);
	t.expect(await storely.get(key1)).toBe(undefined);
	t.expect(await storely.get(key2)).toBe(undefined);
	await storely.disconnect();
});

it("iterator should iterate over multiple keys in namespace", async (t) => {
	const redis = new Redis(redisURI);
	const storelyRedis = new StorelyValkey(redis);
	const ns = `iterator-${faker.string.alphanumeric(8)}`;
	storelyRedis.namespace = ns;

	// Clear any existing keys in this namespace
	await storelyRedis.clear();

	// Write raw values directly via the adapter (no serializer envelope) so
	// the iterator yields exactly what we wrote.
	const testData: Record<string, string> = {};
	for (let i = 0; i < 4; i++) {
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		testData[key] = value;
		await storelyRedis.set(key, value);
	}

	// Iterate and collect all keys/values
	const collected = new Map<string, string>();
	for await (const [key, value] of storelyRedis.iterator()) {
		collected.set(key, value);
	}

	// Validate all keys exist
	t.expect(collected.size).toBe(Object.keys(testData).length);
	for (const [key, value] of Object.entries(testData)) {
		t.expect(collected.has(key)).toBe(true);
		t.expect(collected.get(key)).toBe(value);
	}

	await storelyRedis.disconnect();
});

it("setMany returns false entries on exec error", async (t) => {
	const store = new StorelyValkey(redisURI);
	let emittedError = false;
	store.on("error", () => {
		emittedError = true;
	});
	// Mock multi to throw
	// biome-ignore lint/complexity/useLiteralKeys: accessing private property for test mock
	const client = store["_client"];
	const originalMulti = client.multi.bind(client);
	client.multi = () => {
		throw new Error("multi failure");
	};

	const result = await store.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
	]);
	t.expect(result).toEqual([false, false]);
	t.expect(emittedError).toBe(true);
	client.multi = originalMulti;
	await store.disconnect();
});

it("has() returns true for an existing key", async (t) => {
	const store = new StorelyValkey(redisURI);
	const key = faker.string.alphanumeric(10);
	await store.set(key, "value");
	t.expect(await store.has(key)).toBe(true);
	await store.delete(key);
	await store.disconnect();
});

it("has() returns false for a non-existing key", async (t) => {
	const store = new StorelyValkey(redisURI);
	t.expect(await store.has("nonexistent-key")).toBe(false);
	await store.disconnect();
});

it("has() returns false after delete", async (t) => {
	const store = new StorelyValkey(redisURI);
	const key = faker.string.alphanumeric(10);
	await store.set(key, "value");
	t.expect(await store.has(key)).toBe(true);
	await store.delete(key);
	t.expect(await store.has(key)).toBe(false);
	await store.disconnect();
});
