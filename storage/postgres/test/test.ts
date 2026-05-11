import Storely from "@ambicuity/ambicore";
import { storageTestSuite, storelyIteratorTests, storelyTestSuite } from "@ambicuity/test-suite";
import { faker } from "@faker-js/faker";
import { beforeEach, it } from "vitest";
import StorelyPostgres, { createStorely } from "../src/index.js";

const postgresUri = "postgresql://postgres:postgres@localhost:5432/storely_test";

const store = () => new StorelyPostgres({ uri: postgresUri, iterationLimit: 2 });
storelyTestSuite(it, Storely, store);
storelyIteratorTests(it, Storely, store);
storageTestSuite(it, store, { ttl: false });

beforeEach(async () => {
	const storely = store();
	await storely.clear();
});

it("should be able to pass in just uri as string", async (t) => {
	const storely = new StorelyPostgres(postgresUri);
	const key = faker.string.alphanumeric(10);
	const value = faker.lorem.sentence();
	await storely.set(key, value);
	t.expect(await storely.get(key)).toBe(value);
});

it("test schema as non public", async (t) => {
	const storely1 = new StorelyPostgres({
		uri: "postgresql://postgres:postgres@localhost:5432/storely_test",
		schema: "storelytest1",
	});
	const storely2 = new StorelyPostgres({
		uri: "postgresql://postgres:postgres@localhost:5432/storely_test",
		schema: "storelytest2",
	});
	const key1 = faker.string.alphanumeric(10);
	const value1 = faker.lorem.sentence();
	const key2 = faker.string.alphanumeric(10);
	const value2 = faker.lorem.sentence();
	await storely1.set(key1, value1);
	await storely2.set(key2, value2);
	t.expect(await storely1.get(key1)).toBe(value1);
	t.expect(await storely2.get(key2)).toBe(value2);
});

it("iterator with default namespace", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const key1 = faker.string.alphanumeric(10);
	const value1 = faker.lorem.sentence();
	const key2 = faker.string.alphanumeric(10);
	const value2 = faker.lorem.sentence();
	const key3 = faker.string.alphanumeric(10);
	const value3 = faker.lorem.sentence();
	await storely.set(key1, value1);
	await storely.set(key2, value2);
	await storely.set(key3, value3);

	const keys: string[] = [];
	const values: string[] = [];
	for await (const [key, value] of storely.iterator()) {
		keys.push(key);
		values.push(value as string);
	}

	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
	t.expect(keys).toContain(key3);
	t.expect(values).toContain(value1);
	t.expect(values).toContain(value2);
	t.expect(values).toContain(value3);
});

it(".clear() with undefined namespace", async (t) => {
	const storely = store();
	t.expect(await storely.clear()).toBeUndefined();
});

it("close connection successfully", async (t) => {
	const storely = store();
	const key = faker.string.alphanumeric(10);
	t.expect(await storely.get(key)).toBeUndefined();
	await storely.disconnect();
	try {
		await storely.get(key);
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

it("create two instances and make sure they do not conflict", async (t) => {
	const postgresUri = "postgresql://postgres:postgres@localhost:5432/storely_test";
	const postgresA = new StorelyPostgres({ uri: postgresUri });
	const postgresB = new StorelyPostgres({ uri: postgresUri });
	const storelyA = new Storely({
		store: postgresA,
		namespace: "namespace-a",
	});
	const storelyB = new Storely({
		store: postgresB,
		namespace: "namespace-b",
	});

	const key = faker.string.alphanumeric(10);
	const valueA = faker.lorem.sentence();
	const valueB = faker.lorem.sentence();

	t.expect(await storelyA.set(key, valueA)).toBe(true);
	t.expect(await storelyA.get(key)).toBe(valueA);
	t.expect(await storelyB.set(key, valueB)).toBe(true);
	t.expect(await storelyB.get(key)).toBe(valueB);
});

it("helper to create Storely instance with postgres", async (t) => {
	const storely = createStorely({ uri: postgresUri });
	const key = faker.string.alphanumeric(10);
	const value = faker.lorem.sentence();
	t.expect(await storely.set(key, value)).toBe(true);
	t.expect(await storely.get(key)).toBe(value);
});

it("test unlogged table", async (t) => {
	const storely = createStorely({ uri: postgresUri, useUnloggedTable: true });
	const key = faker.string.alphanumeric(10);
	const value = faker.lorem.sentence();
	t.expect(await storely.set(key, value)).toBe(true);
	t.expect(await storely.get(key)).toBe(value);
});

it(".setMany support", async (t) => {
	const storely = new StorelyPostgres(postgresUri);
	const key1 = faker.string.alphanumeric(10);
	const value1 = faker.lorem.sentence();
	const key2 = faker.string.alphanumeric(10);
	const value2 = faker.lorem.sentence();
	const key3 = faker.string.alphanumeric(10);
	const value3 = faker.lorem.sentence();
	await storely.set(key1, value1);
	await storely.setMany([
		{ key: key1, value: value1 },
		{ key: key2, value: value2 },
		{ key: key3, value: value3 },
	]);
	t.expect(await storely.getMany([key1, key2, key3])).toStrictEqual([value1, value2, value3]);
});

it(".hasMany() returns correct booleans for existing and non-existing keys", async (t) => {
	const storely = new StorelyPostgres(postgresUri);
	const key1 = faker.string.alphanumeric(10);
	const value1 = faker.lorem.sentence();
	const key2 = faker.string.alphanumeric(10);
	const value2 = faker.lorem.sentence();
	const key3 = faker.string.alphanumeric(10);
	await storely.set(key1, value1);
	await storely.set(key2, value2);
	const result = await storely.hasMany([key1, key2, key3]);
	t.expect(result).toStrictEqual([true, true, false]);
});

it(".hasMany() with all non-existent keys returns all false", async (t) => {
	const storely = new StorelyPostgres(postgresUri);
	const result = await storely.hasMany(["nonexistent1", "nonexistent2", "nonexistent3"]);
	t.expect(result).toStrictEqual([false, false, false]);
});

it("should have correct default property values", (t) => {
	const storely = new StorelyPostgres();
	t.expect(storely.uri).toBe("postgresql://localhost:5432");
	t.expect(storely.table).toBe("storely");
	t.expect(storely.keyLength).toBe(255);
	t.expect(storely.namespaceLength).toBe(255);
	t.expect(storely.schema).toBe("public");
	t.expect(storely.iterationLimit).toBe(500);
	t.expect(storely.useUnloggedTable).toBe(false);
	t.expect(storely.ssl).toBeUndefined();
	t.expect(storely.namespace).toBeUndefined();
});

it("should set properties from constructor options", (t) => {
	const storely = new StorelyPostgres({
		uri: postgresUri,
		table: "custom_table",
		keyLength: 512,
		namespaceLength: 512,
		schema: "custom_schema",
		iterationLimit: 50,
		useUnloggedTable: true,
		ssl: { rejectUnauthorized: false },
	});
	t.expect(storely.uri).toBe(postgresUri);
	t.expect(storely.table).toBe("custom_table");
	t.expect(storely.keyLength).toBe(512);
	t.expect(storely.namespaceLength).toBe(512);
	t.expect(storely.schema).toBe("custom_schema");
	t.expect(storely.iterationLimit).toBe(50);
	t.expect(storely.useUnloggedTable).toBe(true);
	t.expect(storely.ssl).toEqual({ rejectUnauthorized: false });
});

it("should set uri when string is passed to constructor", (t) => {
	const storely = new StorelyPostgres(postgresUri);
	t.expect(storely.uri).toBe(postgresUri);
	t.expect(storely.table).toBe("storely");
	t.expect(storely.schema).toBe("public");
});

it("should be able to get and set individual properties", (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	storely.table = "new_table";
	t.expect(storely.table).toBe("new_table");
	storely.schema = "new_schema";
	t.expect(storely.schema).toBe("new_schema");
	storely.keyLength = 512;
	t.expect(storely.keyLength).toBe(512);
	storely.namespaceLength = 512;
	t.expect(storely.namespaceLength).toBe(512);
	storely.iterationLimit = 25;
	t.expect(storely.iterationLimit).toBe(25);
	storely.useUnloggedTable = true;
	t.expect(storely.useUnloggedTable).toBe(true);
	storely.ssl = { rejectUnauthorized: false };
	t.expect(storely.ssl).toEqual({ rejectUnauthorized: false });
	storely.uri = "postgresql://localhost:5433";
	t.expect(storely.uri).toBe("postgresql://localhost:5433");
	storely.namespace = "test-ns";
	t.expect(storely.namespace).toBe("test-ns");
	storely.namespace = undefined;
	t.expect(storely.namespace).toBeUndefined();
});

it("property getters should return correct values", (t) => {
	const storely = new StorelyPostgres({
		uri: postgresUri,
		table: "opts_table",
		iterationLimit: 99,
	});
	t.expect(storely.table).toBe("opts_table");
	t.expect(storely.iterationLimit).toBe(99);
	t.expect(storely.uri).toBe(postgresUri);
	t.expect(storely.schema).toBe("public");
	t.expect(storely.keyLength).toBe(255);
	t.expect(storely.useUnloggedTable).toBe(false);
});

it("property setters should update individual properties", (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	storely.table = "updated_table";
	storely.schema = "updated_schema";
	storely.keyLength = 1024;
	t.expect(storely.table).toBe("updated_table");
	t.expect(storely.schema).toBe("updated_schema");
	t.expect(storely.keyLength).toBe(1024);
	t.expect(storely.uri).toBe(postgresUri);
});

it("emits error when connection fails", async (t) => {
	const storely = new StorelyPostgres({
		uri: "postgresql://invalid:invalid@localhost:9999/nonexistent",
	});

	const error = await new Promise((resolve) => {
		storely.on("error", (error: unknown) => resolve(error));
	});

	t.expect(error).toBeInstanceOf(Error);
});

it("native namespace: same key in different namespaces stored independently", async (t) => {
	const postgres1 = new StorelyPostgres({ uri: postgresUri });
	postgres1.namespace = "ns1";
	const postgres2 = new StorelyPostgres({ uri: postgresUri });
	postgres2.namespace = "ns2";

	await postgres1.set("ns1:testkey", "value1");
	await postgres2.set("ns2:testkey", "value2");

	t.expect(await postgres1.get("ns1:testkey")).toBe("value1");
	t.expect(await postgres2.get("ns2:testkey")).toBe("value2");
});

it("native namespace: null namespace stores and retrieves correctly", async (t) => {
	const postgres = new StorelyPostgres({ uri: postgresUri });
	await postgres.set("testkey", "testvalue");
	t.expect(await postgres.get("testkey")).toBe("testvalue");
});

it("native namespace: clear only clears the specified namespace", async (t) => {
	const postgres1 = new StorelyPostgres({ uri: postgresUri });
	postgres1.namespace = "ns1";
	const postgres2 = new StorelyPostgres({ uri: postgresUri });
	postgres2.namespace = "ns2";

	await postgres1.set("ns1:key1", "value1");
	await postgres2.set("ns2:key1", "value2");

	await postgres1.clear();

	t.expect(await postgres1.get("ns1:key1")).toBeUndefined();
	t.expect(await postgres2.get("ns2:key1")).toBe("value2");
});

it("native namespace: iterator falls back to default limit when iterationLimit is 0", async (t) => {
	const postgres = new StorelyPostgres({ uri: postgresUri, iterationLimit: 0 });
	postgres.namespace = "nslimit";

	await postgres.set("a", "v1");

	const keys: string[] = [];
	for await (const [key] of postgres.iterator()) {
		keys.push(key);
	}

	t.expect(keys).toContain("a");
});

it("native namespace: iterator with null namespace paginates correctly", async (t) => {
	const postgres = new StorelyPostgres({ uri: postgresUri, iterationLimit: 2 });

	await postgres.set("a", "v1");
	await postgres.set("b", "v2");
	await postgres.set("c", "v3");

	const keys: string[] = [];
	for await (const [key] of postgres.iterator()) {
		keys.push(key);
	}

	t.expect(keys.length).toBe(3);
	t.expect(keys).toContain("a");
	t.expect(keys).toContain("b");
	t.expect(keys).toContain("c");
});

it("native namespace: iterator only returns keys from correct namespace", async (t) => {
	const postgres1 = new StorelyPostgres({ uri: postgresUri });
	postgres1.namespace = "ns1";
	const postgres2 = new StorelyPostgres({ uri: postgresUri });
	postgres2.namespace = "ns2";

	await postgres1.set("key1", "val1");
	await postgres1.set("key2", "val2");
	await postgres2.set("key3", "val3");

	const keys: string[] = [];
	for await (const [key] of postgres1.iterator()) {
		keys.push(key);
	}

	t.expect(keys.length).toBe(2);
	t.expect(keys).toContain("key1");
	t.expect(keys).toContain("key2");
});

it("set() extracts and stores expires in the expires column", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const expiresTimestamp = Date.now() + 60_000;
	const serializedValue = JSON.stringify({
		value: "test-value",
		expires: expiresTimestamp,
	});
	await storely.set("expires-test-key", serializedValue);
	t.expect(await storely.get("expires-test-key")).toBe(serializedValue);
});

it("set() stores null expires when value has no expires field", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const serializedValue = JSON.stringify({ value: "no-ttl-value" });
	await storely.set("no-expires-key", serializedValue);
	t.expect(await storely.get("no-expires-key")).toBe(serializedValue);
});

it("set() gracefully handles non-JSON string values", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	await storely.set("plain-text-key", "not-json-at-all");
	t.expect(await storely.get("plain-text-key")).toBe("not-json-at-all");
});

it("set() updates expires column on upsert", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const expires1 = Date.now() + 60_000;
	const expires2 = Date.now() + 120_000;
	await storely.set("upsert-exp-key", JSON.stringify({ value: "v1", expires: expires1 }));
	await storely.set("upsert-exp-key", JSON.stringify({ value: "v2", expires: expires2 }));
	t.expect(await storely.get("upsert-exp-key")).toBe(
		JSON.stringify({ value: "v2", expires: expires2 }),
	);
});

it("setMany() extracts and stores expires for each entry", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const expires1 = Date.now() + 60_000;
	const expires2 = Date.now() + 120_000;
	await storely.setMany([
		{
			key: "many-exp-1",
			value: JSON.stringify({ value: "v1", expires: expires1 }),
		},
		{
			key: "many-exp-2",
			value: JSON.stringify({ value: "v2", expires: expires2 }),
		},
		{ key: "many-exp-3", value: JSON.stringify({ value: "v3" }) },
	]);
	t.expect(await storely.get("many-exp-1")).toBe(
		JSON.stringify({ value: "v1", expires: expires1 }),
	);
	t.expect(await storely.get("many-exp-2")).toBe(
		JSON.stringify({ value: "v2", expires: expires2 }),
	);
	t.expect(await storely.get("many-exp-3")).toBe(JSON.stringify({ value: "v3" }));
});

it("expires column is populated when using Storely core with TTL", async (t) => {
	const storely = new Storely({
		store: new StorelyPostgres({ uri: postgresUri }),
		ttl: 60_000,
	});
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "ttl-value");
	t.expect(await storely.get(key)).toBe("ttl-value");
});

it("set() handles object value with expires (serialization disabled)", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const expiresTimestamp = Date.now() + 60_000;
	const objectValue = { value: "obj-test", expires: expiresTimestamp };
	// biome-ignore lint/suspicious/noExplicitAny: testing non-string value path
	await storely.set("obj-expires-key", objectValue as any);
	const result = await storely.get("obj-expires-key");
	t.expect(result).toBeDefined();
});

it("set() handles object value without expires", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const objectValue = { value: "no-exp-obj" };
	// biome-ignore lint/suspicious/noExplicitAny: testing non-string value path
	await storely.set("obj-no-expires-key", objectValue as any);
	const result = await storely.get("obj-no-expires-key");
	t.expect(result).toBeDefined();
});

it("set() handles null value for expires extraction", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	// biome-ignore lint/suspicious/noExplicitAny: testing null value path
	await storely.set("null-val-key", null as any);
	const result = await storely.get("null-val-key");
	t.expect(result).toBeNull();
});

it("set() handles numeric value for expires extraction", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	// biome-ignore lint/suspicious/noExplicitAny: testing numeric value path
	await storely.set("num-val-key", 12345 as any);
	const result = await storely.get("num-val-key");
	t.expect(result).toBe("12345");
});

it("clearExpired() removes expired entries and keeps valid ones", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const pastExpires = Date.now() - 60_000;
	const futureExpires = Date.now() + 60_000;
	await storely.set("expired-key", JSON.stringify({ value: "old", expires: pastExpires }));
	await storely.set("valid-key", JSON.stringify({ value: "fresh", expires: futureExpires }));
	await storely.set("no-ttl-key", JSON.stringify({ value: "forever" }));

	await storely.clearExpired();

	t.expect(await storely.get("expired-key")).toBeUndefined();
	t.expect(await storely.get("valid-key")).toBe(
		JSON.stringify({ value: "fresh", expires: futureExpires }),
	);
	t.expect(await storely.get("no-ttl-key")).toBe(JSON.stringify({ value: "forever" }));
});

it("clearExpired() is a no-op when no entries are expired", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const futureExpires = Date.now() + 60_000;
	await storely.set("still-valid", JSON.stringify({ value: "ok", expires: futureExpires }));

	await storely.clearExpired();

	t.expect(await storely.get("still-valid")).toBe(
		JSON.stringify({ value: "ok", expires: futureExpires }),
	);
});

it("clearExpiredInterval defaults to 0 (disabled)", (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	t.expect(storely.clearExpiredInterval).toBe(0);
});

it("clearExpiredInterval can be set via constructor options", (t) => {
	const storely = new StorelyPostgres({
		uri: postgresUri,
		clearExpiredInterval: 5000,
	});
	t.expect(storely.clearExpiredInterval).toBe(5000);
	storely.clearExpiredInterval = 0;
});

it("clearExpiredInterval getter and setter work", (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	t.expect(storely.clearExpiredInterval).toBe(0);
	storely.clearExpiredInterval = 3000;
	t.expect(storely.clearExpiredInterval).toBe(3000);
	storely.clearExpiredInterval = 0;
});

it("clearExpiredInterval is accessible via property getter", (t) => {
	const storely = new StorelyPostgres({
		uri: postgresUri,
		clearExpiredInterval: 10_000,
	});
	t.expect(storely.clearExpiredInterval).toBe(10_000);
	storely.clearExpiredInterval = 0;
});

it("clearExpiredInterval automatically clears expired entries", async (t) => {
	const storely = new StorelyPostgres({
		uri: postgresUri,
		clearExpiredInterval: 100,
	});
	const pastExpires = Date.now() - 60_000;
	const futureExpires = Date.now() + 60_000;
	await storely.set("interval-expired", JSON.stringify({ value: "old", expires: pastExpires }));
	await storely.set("interval-valid", JSON.stringify({ value: "fresh", expires: futureExpires }));

	// Wait for the interval to fire
	await new Promise((resolve) => {
		setTimeout(resolve, 300);
	});

	t.expect(await storely.get("interval-expired")).toBeUndefined();
	t.expect(await storely.get("interval-valid")).toBe(
		JSON.stringify({ value: "fresh", expires: futureExpires }),
	);
	storely.clearExpiredInterval = 0;
});

it("disconnect stops the clearExpiredInterval timer", async (t) => {
	const storely = new StorelyPostgres({
		uri: postgresUri,
		clearExpiredInterval: 100,
	});
	t.expect(storely.clearExpiredInterval).toBe(100);
	await storely.disconnect();
	// After disconnect, the timer should be stopped. We just verify no errors are thrown.
	t.expect(storely.clearExpiredInterval).toBe(100);
});

it("setMany returns false entries on query error", async (t) => {
	const store = new StorelyPostgres({ uri: postgresUri });
	let emittedError = false;
	store.on("error", () => {
		emittedError = true;
	});
	// Close the connection to force an error
	await store.disconnect();
	const result = await store.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
	]);
	t.expect(result).toEqual([false, false]);
	t.expect(emittedError).toBe(true);
});

it("has() returns true for an existing key", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "value");
	t.expect(await storely.has(key)).toBe(true);
});

it("has() returns false for a non-existing key", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	t.expect(await storely.has("nonexistent-key")).toBe(false);
});

it("has() returns correct result with namespace", async (t) => {
	const storely1 = new StorelyPostgres({ uri: postgresUri });
	storely1.namespace = "has-ns1";
	const storely2 = new StorelyPostgres({ uri: postgresUri });
	storely2.namespace = "has-ns2";

	const key = faker.string.alphanumeric(10);
	await storely1.set(key, "value1");

	t.expect(await storely1.has(key)).toBe(true);
	t.expect(await storely2.has(key)).toBe(false);
});

it("has() returns true after set and false after delete", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "value");
	t.expect(await storely.has(key)).toBe(true);
	await storely.delete(key);
	t.expect(await storely.has(key)).toBe(false);
});

it("has() returns false after clear", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "value");
	t.expect(await storely.has(key)).toBe(true);
	await storely.clear();
	t.expect(await storely.has(key)).toBe(false);
});

it("has returns false and deletes expired key", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const key = faker.string.alphanumeric(10);
	const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
	await storely.set(key, expiredValue);
	t.expect(await storely.has(key)).toBe(false);
	// Verify the key was deleted
	t.expect(await storely.get(key)).toBeUndefined();
});

it("hasMany returns false for expired keys and deletes them", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri });
	const expiredKey1 = faker.string.alphanumeric(10);
	const expiredKey2 = faker.string.alphanumeric(10);
	const validKey = faker.string.alphanumeric(10);
	const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
	const validValue = JSON.stringify({ value: "fresh", expires: Date.now() + 60_000 });
	await storely.set(expiredKey1, expiredValue);
	await storely.set(expiredKey2, expiredValue);
	await storely.set(validKey, validValue);
	const result = await storely.hasMany([expiredKey1, expiredKey2, validKey]);
	t.expect(result).toStrictEqual([false, false, true]);
	// Verify expired keys were deleted
	t.expect(await storely.get(expiredKey1)).toBeUndefined();
	t.expect(await storely.get(expiredKey2)).toBeUndefined();
});

it("setting clearExpiredInterval to 0 stops an active timer", (t) => {
	const storely = new StorelyPostgres({
		uri: postgresUri,
		clearExpiredInterval: 1000,
	});
	t.expect(storely.clearExpiredInterval).toBe(1000);
	storely.clearExpiredInterval = 0;
	t.expect(storely.clearExpiredInterval).toBe(0);
});
