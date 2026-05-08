import { EventEmitter } from "node:events";
import { faker } from "@faker-js/faker";
import { storageTestSuite, storelyApiTests, storelyValueTests } from "@storely/test-suite";
import Storely from "storely";
import { beforeEach, expect, it } from "vitest";
import StorelyMemcache, { createStorely } from "../src/index.js";

const snooze = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Handle all the tests with listeners.
EventEmitter.setMaxListeners(200);

let uri = "localhost:11211";

if (process.env.URI) {
	uri = process.env.URI;
}

const storelyMemcache = new StorelyMemcache(uri);

beforeEach(async () => {
	await storelyMemcache.clear();
});

it("storely get / no expired", async () => {
	const storely = new Storely<string>({ store: storelyMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await storely.set(key, val);

	const value = await storely.get(key);

	expect(value).toBe(val);
});

it("testing defaults", () => {
	const m = new StorelyMemcache();
	expect(m.nodes).toEqual(["localhost:11211"]);
});

it("storely clear", async () => {
	const storely = new Storely({ store: storelyMemcache });
	const key = faker.string.uuid();
	await storely.set(key, faker.lorem.word());
	await storely.clear();
	expect(await storely.get(key)).toBeUndefined();
});

it("storely get", async () => {
	const storely = new Storely({ store: storelyMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();
	expect(await storely.get(key)).toBeUndefined();
	await storely.set(key, val);
	expect(await storely.get(key)).toBe(val);
});

it("format key for no namespace", () => {
	const key = faker.string.uuid();
	expect(new StorelyMemcache(uri).formatKey(key)).toBe(key);
});

it("format key for namespace", () => {
	const key = faker.string.uuid();
	const localMemcache = new StorelyMemcache(uri);
	new Storely({ store: localMemcache });
	expect(localMemcache.formatKey(key)).toBe(key);
});

it("storely get with namespace", async () => {
	const storely1 = new Storely({ store: storelyMemcache, namespace: "storely1" });
	const storely2 = new Storely({ store: storelyMemcache, namespace: "2" });

	const key = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();

	await storely1.set(key, val1);
	expect(await storely1.get(key)).toBe(val1);

	await storely2.set(key, val2);
	expect(await storely2.get(key)).toBe(val2);
});

it("storely get / should still exist", async () => {
	const storely = new Storely<string>({ store: storelyMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await storely.set(key, val, 10_000);

	await snooze(2000);

	const value = await storely.get(key);

	expect(value).toBe(val);
});

it("storely get / expired existing", async () => {
	const storely = new Storely<string>({ store: storelyMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await storely.set(key, val, 1000);

	await snooze(3000);

	const value = await storely.get(key);

	expect(value).toBeUndefined();
});

it("storely get / expired existing with bad number", async () => {
	const storely = new Storely<string>({ store: storelyMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await storely.set(key, val, 1);

	await snooze(1000);

	const value = await storely.get(key);

	expect(value).toBeUndefined();
});

it("storely get / expired", async () => {
	const storely = new Storely<string>({ store: storelyMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await storely.set(key, val, 1000);

	await snooze(2000);

	const value = await storely.get(key);

	expect(value).toBeUndefined();
});

it("storely has / expired", async () => {
	const storely = new Storely({ store: storelyMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await storely.set(key, val, 1000);

	await snooze(2000);

	const value = await storely.has(key);

	expect(value).toBeFalsy();
});

it("storelyMemcache getMany", async () => {
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const value = await storelyMemcache.getMany([key1, key2]);
	expect(Array.isArray(value)).toBeTruthy();

	expect(value[0]).toBeUndefined();
});

it("storelyMemcache setMany", async () => {
	const storely = new Storely({ store: storelyMemcache });
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();
	const val3 = faker.lorem.word();

	await storely.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: val2 },
		{ key: key3, value: val3 },
	]);

	expect(await storely.get(key1)).toBe(val1);
	expect(await storely.get(key2)).toBe(val2);
	expect(await storely.get(key3)).toBe(val3);
});

it("storelyMemcache setMany with ttl", async () => {
	const storely = new Storely({ store: storelyMemcache });
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();

	await storely.setMany([
		{ key: key1, value: val1, ttl: 1000 },
		{ key: key2, value: val2, ttl: 1000 },
	]);

	expect(await storely.get(key1)).toBe(val1);

	await snooze(2000);

	expect(await storely.get(key1)).toBeUndefined();
});

it("storelyMemcache setMany should emit error on failure", { timeout: 30_000 }, async () => {
	const badMemcache = new StorelyMemcache("baduri:11211");
	let errorEmitted = false;
	badMemcache.on("error", () => {
		errorEmitted = true;
	});

	await badMemcache.setMany([{ key: faker.string.uuid(), value: faker.lorem.word() }]);
	expect(errorEmitted).toBeTruthy();
});

it("storely has / false", { timeout: 30_000 }, async () => {
	const storely = new Storely({ store: new StorelyMemcache("baduri:11211") });
	storely.on("error", () => {});

	const value = await storely.has(faker.string.uuid());

	expect(value).toBeFalsy();
});

it("clear should emit an error", async () => {
	const badMemcache = new StorelyMemcache("baduri:11211");
	let errorEmitted = false;
	badMemcache.on("error", () => {
		errorEmitted = true;
	});

	await badMemcache.clear();
	expect(errorEmitted).toBeTruthy();
});

it("delete should emit an error", async () => {
	const badMemcache = new StorelyMemcache("baduri:11211");
	let errorEmitted = false;
	badMemcache.on("error", () => {
		errorEmitted = true;
	});

	const result = await badMemcache.delete(faker.string.uuid());
	expect(errorEmitted).toBeTruthy();
	expect(result).toBe(false);
});

it("set should emit an error", async () => {
	const badMemcache = new StorelyMemcache("baduri:11211");
	let errorEmitted = false;
	badMemcache.on("error", () => {
		errorEmitted = true;
	});

	await badMemcache.set(faker.string.uuid(), faker.lorem.word());
	expect(errorEmitted).toBeTruthy();
});

it("get should emit an error", async () => {
	const badMemcache = new StorelyMemcache("baduri:11211");
	let errorEmitted = false;
	badMemcache.on("error", () => {
		errorEmitted = true;
	});

	const result = await badMemcache.get(faker.string.uuid());
	expect(errorEmitted).toBeTruthy();
	expect(result).toBeUndefined();
});

it("disconnect should work", async () => {
	const memcache = new StorelyMemcache(uri);
	const key = faker.string.uuid();
	await memcache.set(key, faker.lorem.word());
	await memcache.disconnect();
	expect(true).toBeTruthy();
});

it("createStorely returns a Storely instance", () => {
	const storely = createStorely(uri);
	expect(storely).toBeInstanceOf(Storely);
});

it("constructor with string URI sets nodes", () => {
	const m = new StorelyMemcache("myserver:11211");
	expect(m.nodes).toEqual(["myserver:11211"]);
});

it("constructor with options object containing nodes", () => {
	const m = new StorelyMemcache({ nodes: ["server1:11211", "server2:11211"] });
	expect(m.nodes).toEqual(["server1:11211", "server2:11211"]);
});

it("constructor with options passes timeout to memcache client", () => {
	const m = new StorelyMemcache({ nodes: [uri], timeout: 3000 });
	expect(m.timeout).toBe(3000);
});

it("constructor with options passes keepAlive to memcache client", () => {
	const m = new StorelyMemcache({ nodes: [uri], keepAlive: false });
	expect(m.keepAlive).toBe(false);
});

it("constructor with options passes retries to memcache client", () => {
	const m = new StorelyMemcache({ nodes: [uri], retries: 3, retryDelay: 200 });
	expect(m.retries).toBe(3);
	expect(m.retryDelay).toBe(200);
});

it("string URI with additional options merges correctly", () => {
	const m = new StorelyMemcache(uri, { timeout: 2000 });
	expect(m.nodes).toEqual([uri]);
	expect(m.timeout).toBe(2000);
});

it("nodes from options takes precedence over string URI", () => {
	const m = new StorelyMemcache("ignored:11211", { nodes: ["server1:11211"] });
	expect(m.nodes).toEqual(["server1:11211"]);
});

it("createStorely with options passes them through", () => {
	const storely = createStorely({ nodes: [uri], timeout: 3000 });
	expect(storely).toBeInstanceOf(Storely);
});

it("clear flushes the entire server", async () => {
	const store1 = new StorelyMemcache(uri);
	const store2 = new StorelyMemcache(uri);
	const storely1 = new Storely({ store: store1, namespace: "ns1" });
	const storely2 = new Storely({ store: store2, namespace: "ns2" });

	const key = faker.string.uuid();
	await storely1.set(key, faker.lorem.word());
	await storely2.set(key, faker.lorem.word());

	// Clear from one instance flushes everything
	await storely1.clear();

	expect(await storely1.get(key)).toBeUndefined();
	expect(await storely2.get(key)).toBeUndefined();
});

it("get returns undefined for expired key", async () => {
	const key = faker.string.uuid();
	await storelyMemcache.set(key, "value", 1);
	await snooze(50);
	expect(await storelyMemcache.get(key)).toBeUndefined();
});

it("has returns false for expired key", async () => {
	const key = faker.string.uuid();
	await storelyMemcache.set(key, "value", 1);
	await snooze(50);
	expect(await storelyMemcache.has(key)).toBe(false);
});

it("handles legacy non-JSON data in get", async () => {
	const key = faker.string.uuid();
	// Write raw string directly bypassing wrapValue
	await storelyMemcache.client.set(storelyMemcache.formatKey(key), "raw-legacy");
	const result = await storelyMemcache.get(key);
	expect(result).toBe("raw-legacy");
});

it("handles legacy JSON without v field in get", async () => {
	const key = faker.string.uuid();
	await storelyMemcache.client.set(storelyMemcache.formatKey(key), JSON.stringify({ foo: "bar" }));
	const result = await storelyMemcache.get(key);
	expect(result).toBe(JSON.stringify({ foo: "bar" }));
});

const store = () => storelyMemcache;

storelyApiTests(it, Storely, store);
storelyValueTests(it, Storely, store);
storageTestSuite(it, store, { iterator: false });
