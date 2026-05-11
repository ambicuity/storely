// biome-ignore-all lint/suspicious/noExplicitAny: test file

import Storely from "@ambicuity/core";
import { storageTestSuite, storelyIteratorTests, storelyTestSuite } from "@ambicuity/test-suite";
import { faker } from "@faker-js/faker";
import { afterAll, it } from "vitest";
import StorelyMongo, { createStorely } from "../src/index.js";

const options = { serverSelectionTimeoutMS: 5000, db: "storelydb" };
const mongoURL = "mongodb://127.0.0.1:27017";
const store = () => new StorelyMongo(mongoURL, options);

storelyTestSuite(it, Storely, store);
storelyIteratorTests(it, Storely, store);
storageTestSuite(it, store);

afterAll(async () => {
	let storely = new StorelyMongo({ ...options });
	await storely.clear();
	storely = new StorelyMongo({ collection: "foo", useGridFS: true, ...options });
	await storely.clear();
	await storely.disconnect();
});

it("Collection option merges into default options if URL is passed", (t) => {
	const store = new StorelyMongo(mongoURL, { collection: "foo" });
	t.expect(store.url).toBe(mongoURL);
	t.expect(store.collection).toBe("foo");
});

it("URI is passed it is correct", (t) => {
	const options_ = { uri: "mongodb://127.0.0.1:27017" };
	const store = new StorelyMongo(options_);
	t.expect(store.url).toBe(options_.uri);
});

it("default properties are set correctly", (t) => {
	const store = new StorelyMongo();
	t.expect(store.url).toBe("mongodb://127.0.0.1:27017");
	t.expect(store.collection).toBe("storely");
	t.expect(store.useGridFS).toBe(false);
	t.expect(store.db).toBeUndefined();
	t.expect(store.namespace).toBeUndefined();
	t.expect(store.readPreference).toBeUndefined();
});

it("properties can be set via constructor options", (t) => {
	const store = new StorelyMongo({
		url: mongoURL,
		collection: "custom",
		useGridFS: true,
		db: "testdb",
	});
	t.expect(store.url).toBe(mongoURL);
	t.expect(store.collection).toBe("custom");
	t.expect(store.useGridFS).toBe(true);
	t.expect(store.db).toBe("testdb");
});

it("properties can be modified via setters", (t) => {
	const store = new StorelyMongo();
	store.url = "mongodb://localhost:27018";
	t.expect(store.url).toBe("mongodb://localhost:27018");
	store.namespace = "test-ns";
	t.expect(store.namespace).toBe("test-ns");
	store.collection = "custom-collection";
	t.expect(store.collection).toBe("custom-collection");
	store.db = "mydb";
	t.expect(store.db).toBe("mydb");
	store.readPreference = undefined;
	t.expect(store.readPreference).toBeUndefined();
});

it("constructor with undefined url and options sets properties", (t) => {
	const store = new StorelyMongo(undefined, {
		collection: "from-options",
		db: "optionsdb",
		readPreference: "primary" as any,
	});
	t.expect(store.collection).toBe("from-options");
	t.expect(store.db).toBe("optionsdb");
	t.expect(store.readPreference).toBe("primary");
});

it("properties are set correctly with url and options", (t) => {
	const store = new StorelyMongo(mongoURL, { collection: "cache", ...options });
	t.expect(store.url).toBe(mongoURL);
	t.expect(store.collection).toBe("cache");
});

it("Stores value in GridFS", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	const result = await store.set(key, "storely1", 0);
	const get = await store.get(key);
	t.expect(result).toBe(true);
	t.expect(get).toBe("storely1");
});

it("Gets value from GridFS", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "storely1");
	const result = await store.get(key);
	t.expect(result).toBe("storely1");
});

it("Deletes value from GridFS", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "storely1");
	const result = await store.delete(key);
	t.expect(result).toBeTruthy();
});

it("Deletes non existent value from GridFS", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const result = await store.delete(faker.string.alphanumeric(10));
	t.expect(result).toBeFalsy();
});

it("Stores value with TTL in GridFS", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	const result = await store.set(key, "storely1", 0);
	t.expect(result).toBe(true);
});

it("Clears expired value from GridFS", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "expired-value", 0);
	const cleared = await store.clearExpired();
	t.expect(cleared).toBeTruthy();
});

it("Clears unused files from GridFS", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "unused-value");
	const cleared = await store.clearUnusedFor(0);
	t.expect(cleared).toBeTruthy();
});

it("Clears expired value only when GridFS options is true", async (t) => {
	const store = new StorelyMongo(Object.assign(options));
	const cleared = await store.clearExpired();
	t.expect(cleared).toBeFalsy();
});

it("Clears unused files only when GridFS options is true", async (t) => {
	const store = new StorelyMongo(Object.assign(options));
	const cleared = await store.clearUnusedFor(5);
	t.expect(cleared).toBeFalsy();
});

it("Gets non-existent file and return should be undefined", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const result = await store.get(faker.string.alphanumeric(10));
	t.expect(typeof result).toBe("undefined");
});

it("Non-string keys are not permitted in delete", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	// @ts-expect-error - test invalid input
	const result = await store.delete({
		ok: true,
	});
	t.expect(result).toBeFalsy();
});

it(".deleteMany([keys]) should delete multiple gridfs key", async (t) => {
	const storely = new StorelyMongo({ useGridFS: true, ...options });
	const keys = [
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
	];
	await storely.set(keys[0], "bar");
	await storely.set(keys[1], "bar1");
	await storely.set(keys[2], "bar2");
	t.expect(await storely.deleteMany(keys)).toBeTruthy();
	t.expect(await storely.get(keys[0])).toBeUndefined();
	t.expect(await storely.get(keys[1])).toBeUndefined();
	t.expect(await storely.get(keys[2])).toBeUndefined();
});

it(".deleteMany([keys]) with nonexistent gridfs keys resolves to false", async (t) => {
	const storely = new StorelyMongo({ useGridFS: true, ...options });
	t.expect(
		await storely.deleteMany([faker.string.alphanumeric(10), faker.string.alphanumeric(10)]),
	).toEqual([false, false]);
});

it(".getMany([keys]) using GridFS should return array values", async (t) => {
	const storely = new StorelyMongo({ useGridFS: true, ...options });
	const keys = [
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
	];
	await storely.set(keys[0], "bar");
	await storely.set(keys[1], "bar1");
	await storely.set(keys[2], "bar2");
	const values = await storely.getMany<string>(keys);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe("bar");
	t.expect(values[1]).toBe("bar1");
	t.expect(values[2]).toBe("bar2");
});

it(".getMany([keys]) using GridFS should return array values with undefined", async (t) => {
	const storely = new StorelyMongo({ useGridFS: true, ...options });
	const keys = [
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
	];
	await storely.set(keys[0], "bar");
	await storely.set(keys[2], "bar2");
	const values = await storely.getMany<string>(keys);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe("bar");
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBe("bar2");
});

it(".getMany([keys]) using GridFS should return empty array for all no existent keys", async (t) => {
	const storely = new StorelyMongo({ useGridFS: true, ...options });
	const values = await storely.getMany<string>([
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
	]);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values).toStrictEqual([undefined, undefined, undefined]);
});

it("Clears entire cache store", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const result = await store.clear();
	t.expect(typeof result).toBe("undefined");
});

it("Clears entire cache store with default namespace", async (t) => {
	const store = new StorelyMongo({ ...options });
	const result = await store.clear();
	t.expect(typeof result).toBe("undefined");
});

it("Clears an empty store should not fail", async (_t) => {
	const store = new StorelyMongo({ ...options });
	await store.clear();
	await store.clear();
});

it("Clears an empty store GridFS should not fail", async (_t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	await store.clear();
	await store.clear();
});

it("iterator with default namespace", async (t) => {
	const store = new StorelyMongo({ ...options });
	await store.clear();
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await store.set(key1, "bar");
	await store.set(key2, "bar2");
	const results: Array<[string, string]> = [];
	for await (const entry of store.iterator()) {
		results.push(entry as [string, string]);
	}

	t.expect(results.length).toBeGreaterThanOrEqual(2);
	const keys = results.map(([k]) => k);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

it("iterator with namespace", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const store = new StorelyMongo({ namespace: ns, ...options });
	await store.clear();
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await store.set(key1, "bar");
	await store.set(key2, "bar2");
	const results: Array<[string, string]> = [];
	for await (const entry of store.iterator()) {
		results.push(entry as [string, string]);
	}

	t.expect(results.length).toBe(2);
	const keys = results.map(([k]) => k);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

it("iterator with default namespace using GridFS", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	await store.clear();
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await store.set(key1, "bar");
	await store.set(key2, "bar2");
	const results: Array<[string, string]> = [];
	for await (const entry of store.iterator()) {
		results.push(entry as [string, string]);
	}

	t.expect(results.length).toBeGreaterThanOrEqual(2);
	const keys = results.map(([k]) => k);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

it("iterator with namespace using GridFS", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const store = new StorelyMongo({
		namespace: ns,
		useGridFS: true,
		...options,
	});
	await store.clear();
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await store.set(key1, "bar");
	await store.set(key2, "bar2");
	const results: Array<[string, string]> = [];
	for await (const entry of store.iterator()) {
		results.push(entry as [string, string]);
	}

	t.expect(results.length).toBe(2);
	const keys = results.map(([k]) => k);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

it("Close connection successfully on GridFS", async (t) => {
	const storely = new StorelyMongo({ useGridFS: true, ...options });
	t.expect(await storely.get(faker.string.alphanumeric(10))).toBeUndefined();
	await storely.disconnect();
	try {
		await storely.get(faker.string.alphanumeric(10));
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

it("Close connection successfully", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const storely = new StorelyMongo({ namespace: ns, ...options });
	t.expect(await storely.get(faker.string.alphanumeric(10))).toBeUndefined();
	await storely.disconnect();
	try {
		await storely.get(faker.string.alphanumeric(10));
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

it("Close connection should fail", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const storely = new StorelyMongo({ namespace: ns, ...options });
	try {
		await storely.disconnect();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

it("createStorely with URI string returns a Storely instance", async (t) => {
	const storely = createStorely(mongoURL);
	t.expect(storely).toBeInstanceOf(Storely);
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "value");
	t.expect(await storely.get(key)).toBe("value");
});

it("createStorely with options object returns a Storely instance", async (t) => {
	const storely = createStorely({ url: mongoURL, collection: "storely", ...options });
	t.expect(storely).toBeInstanceOf(Storely);
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "value");
	t.expect(await storely.get(key)).toBe("value");
});

it("createStorely with namespace option", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const storely = createStorely({ namespace: ns, url: mongoURL, ...options });
	t.expect(storely.namespace).toBe(ns);
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "bar");
	t.expect(await storely.get(key)).toBe("bar");
	const storeInstance = storely.store as StorelyMongo;
	const rawValue = await storeInstance.get(`${ns}:${key}`);
	t.expect(rawValue).toBeDefined();
});

it("createStorely with different namespaces do not conflict", async (t) => {
	const nsA = faker.string.alphanumeric(8);
	const nsB = faker.string.alphanumeric(8);
	const storelyA = createStorely({ namespace: nsA, url: mongoURL, ...options });
	const storelyB = createStorely({ namespace: nsB, url: mongoURL, ...options });

	const key = faker.string.alphanumeric(10);
	await storelyA.set(key, "valueA");
	await storelyB.set(key, "valueB");

	t.expect(await storelyA.get(key)).toBe("valueA");
	t.expect(await storelyB.get(key)).toBe("valueB");

	// clear only affects its own namespace
	await storelyA.clear();
	t.expect(await storelyA.get(key)).toBeUndefined();
	t.expect(await storelyB.get(key)).toBe("valueB");
});

// Native namespace tests - Standard mode
it("native namespace: same key in different namespaces stored independently", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "value1");
	await mongo2.set(`${ns2}:${key}`, "value2");

	t.expect(await mongo1.get(`${ns1}:${key}`)).toBe("value1");
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("value2");
});

it("native namespace: null namespace stores and retrieves correctly", async (t) => {
	const storely = new StorelyMongo({ ...options });
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "testvalue");
	t.expect(await storely.get(key)).toBe("testvalue");
});

it("native namespace: clear only clears the specified namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "value1");
	await mongo2.set(`${ns2}:${key}`, "value2");

	await mongo1.clear();

	t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("value2");
});

it("native namespace: delete scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");
	await mongo2.set(`${ns2}:${key}`, "val2");

	const deleted = await mongo1.delete(`${ns1}:${key}`);
	t.expect(deleted).toBe(true);
	t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("val2");
});

it("native namespace: deleteMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");
	await mongo2.set(`${ns2}:${key}`, "val2");

	const deleted = await mongo1.deleteMany([`${ns1}:${key}`]);
	t.expect(deleted).toEqual([true]);
	t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("val2");
});

it("native namespace: has scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");

	t.expect(await mongo1.has(`${ns1}:${key}`)).toBe(true);
	t.expect(await mongo2.has(`${ns2}:${key}`)).toBe(false);
});

it("native namespace: iterator only returns keys from correct namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ ...options });
	mongo2.namespace = ns2;

	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await mongo1.set(key1, "val1");
	await mongo1.set(key2, "val2");
	await mongo2.set(faker.string.alphanumeric(10), "val3");

	const keys: string[] = [];
	for await (const [key] of mongo1.iterator()) {
		keys.push(key);
	}

	t.expect(keys.length).toBe(2);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

it("native namespace: two Storely instances with different namespaces do not conflict", async (t) => {
	const nsA = faker.string.alphanumeric(8);
	const nsB = faker.string.alphanumeric(8);
	const mongoA = new StorelyMongo({ ...options });
	const mongoB = new StorelyMongo({ ...options });
	const storelyA = new Storely({ store: mongoA, namespace: nsA });
	const storelyB = new Storely({ store: mongoB, namespace: nsB });

	const key = faker.string.alphanumeric(10);
	t.expect(await storelyA.set(key, "valueA")).toBe(true);
	t.expect(await storelyA.get(key)).toBe("valueA");
	t.expect(await storelyB.set(key, "valueB")).toBe(true);
	t.expect(await storelyB.get(key)).toBe("valueB");
	// Ensure they didn't overwrite each other
	t.expect(await storelyA.get(key)).toBe("valueA");
});

it("native namespace: getMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");
	await mongo2.set(`${ns2}:${key}`, "val2");

	const results = await mongo1.getMany([`${ns1}:${key}`]);
	t.expect(results).toEqual(["val1"]);

	const results2 = await mongo1.getMany([`${ns2}:${key}`]);
	t.expect(results2).toEqual([undefined]);
});

// Native namespace tests - GridFS mode
it("native namespace GridFS: same key in different namespaces stored independently", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ useGridFS: true, ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ useGridFS: true, ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "value1");
	await mongo2.set(`${ns2}:${key}`, "value2");

	t.expect(await mongo1.get(`${ns1}:${key}`)).toBe("value1");
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("value2");
});

it("native namespace GridFS: clear only clears the specified namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ useGridFS: true, ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ useGridFS: true, ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "value1");
	await mongo2.set(`${ns2}:${key}`, "value2");

	await mongo1.clear();

	t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("value2");
});

it("native namespace GridFS: delete scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ useGridFS: true, ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ useGridFS: true, ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");
	await mongo2.set(`${ns2}:${key}`, "val2");

	const deleted = await mongo1.delete(`${ns1}:${key}`);
	t.expect(deleted).toBe(true);
	t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("val2");
});

it("native namespace GridFS: has scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new StorelyMongo({ useGridFS: true, ...options });
	mongo1.namespace = ns1;
	const mongo2 = new StorelyMongo({ useGridFS: true, ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");

	t.expect(await mongo1.has(`${ns1}:${key}`)).toBe(true);
	t.expect(await mongo2.has(`${ns2}:${key}`)).toBe(false);
});

it("native namespace GridFS: two Storely instances with different namespaces do not conflict", async (t) => {
	const nsA = faker.string.alphanumeric(8);
	const nsB = faker.string.alphanumeric(8);
	const mongoA = new StorelyMongo({ useGridFS: true, ...options });
	const mongoB = new StorelyMongo({ useGridFS: true, ...options });
	const storelyA = new Storely({ store: mongoA, namespace: nsA });
	const storelyB = new Storely({ store: mongoB, namespace: nsB });

	const key = faker.string.alphanumeric(10);
	t.expect(await storelyA.set(key, "valueA")).toBe(true);
	t.expect(await storelyA.get(key)).toBe("valueA");
	t.expect(await storelyB.set(key, "valueB")).toBe(true);
	t.expect(await storelyB.get(key)).toBe("valueB");
	// Ensure they didn't overwrite each other
	t.expect(await storelyA.get(key)).toBe("valueA");
});

it("setMany with TTL in standard mode", async (t) => {
	const store = new StorelyMongo({ ...options });
	const keys = [faker.string.alphanumeric(10), faker.string.alphanumeric(10)];
	await store.setMany([
		{ key: keys[0], value: "val1", ttl: 60000 },
		{ key: keys[1], value: "val2" },
	]);
	t.expect(await store.get(keys[0])).toBe("val1");
	t.expect(await store.get(keys[1])).toBe("val2");
});

it("setMany upserts existing keys in standard mode", async (t) => {
	const store = new StorelyMongo({ ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "original");
	await store.setMany([{ key, value: "updated" }]);
	t.expect(await store.get(key)).toBe("updated");
});

it("setMany with namespace in standard mode", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const store = new StorelyMongo({ ...options });
	store.namespace = ns;
	const keys = [`${ns}:${faker.string.alphanumeric(10)}`, `${ns}:${faker.string.alphanumeric(10)}`];
	await store.setMany([
		{ key: keys[0], value: "val1" },
		{ key: keys[1], value: "val2" },
	]);
	t.expect(await store.get(keys[0])).toBe("val1");
	t.expect(await store.get(keys[1])).toBe("val2");
});

// setMany tests - GridFS mode
it("setMany sets multiple keys in GridFS mode", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const keys = [faker.string.alphanumeric(10), faker.string.alphanumeric(10)];
	await store.setMany([
		{ key: keys[0], value: "val1" },
		{ key: keys[1], value: "val2" },
	]);
	t.expect(await store.get(keys[0])).toBe("val1");
	t.expect(await store.get(keys[1])).toBe("val2");
});

it("hasMany with namespace in standard mode", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const store1 = new StorelyMongo({ ...options });
	store1.namespace = ns1;
	const store2 = new StorelyMongo({ ...options });
	store2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await store1.set(`${ns1}:${key}`, "val1");
	await store2.set(`${ns2}:${key}`, "val2");

	const results = await store1.hasMany([
		`${ns1}:${key}`,
		`${ns1}:${faker.string.alphanumeric(10)}`,
	]);
	t.expect(results).toEqual([true, false]);
});

// hasMany tests - GridFS mode
it("hasMany checks multiple keys in GridFS mode", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const keys = [
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
	];
	await store.set(keys[0], "val1");
	await store.set(keys[1], "val2");
	const results = await store.hasMany(keys);
	t.expect(results).toEqual([true, true, false]);
});

it("hasMany with namespace in GridFS mode", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const store1 = new StorelyMongo({ useGridFS: true, ...options });
	store1.namespace = ns1;
	const store2 = new StorelyMongo({ useGridFS: true, ...options });
	store2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await store1.set(`${ns1}:${key}`, "val1");
	await store2.set(`${ns2}:${key}`, "val2");

	const results = await store1.hasMany([
		`${ns1}:${key}`,
		`${ns1}:${faker.string.alphanumeric(10)}`,
	]);
	t.expect(results).toEqual([true, false]);
});

it("setMany returns false entries on bulkWrite error in standard mode", async (t) => {
	const store = new StorelyMongo({ ...options });
	const client = await store.connect;
	// Close the connection to make bulkWrite throw
	await client.mongoClient.close();
	let emittedError = false;
	store.on("error", () => {
		emittedError = true;
	});
	const result = await store.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
	]);
	t.expect(result).toEqual([false, false]);
	t.expect(emittedError).toBe(true);
});

it("setMany handles MongoBulkWriteError with per-entry tracking", async (t) => {
	const { MongoBulkWriteError } = await import("mongodb");
	const store = new StorelyMongo({ ...options });
	const client = await store.connect;
	const originalBulkWrite = client.store.bulkWrite.bind(client.store);
	// Mock bulkWrite to throw a MongoBulkWriteError with a write error at index 1
	client.store.bulkWrite = async () => {
		const bulkError = new MongoBulkWriteError(
			{
				message: "write error",
				code: 11000,
				writeErrors: [{ index: 1, code: 11000, errmsg: "dup key" }] as any,
			},
			{
				insertedCount: 1,
				matchedCount: 0,
				modifiedCount: 0,
				deletedCount: 0,
				upsertedCount: 0,
				insertedIds: {},
				upsertedIds: {},
			} as any,
		);
		throw bulkError;
	};

	let emittedError = false;
	store.on("error", () => {
		emittedError = true;
	});
	const result = await store.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
		{ key: "key3", value: "val3" },
	]);
	t.expect(result).toEqual([true, false, true]);
	t.expect(emittedError).toBe(true);
	client.store.bulkWrite = originalBulkWrite;
});

it("setMany returns per-entry results on GridFS error", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	// Mock the set method to throw for the second call
	let callCount = 0;
	const originalSet = store.set.bind(store);
	store.set = async (key: string, value: any, ttl?: number) => {
		callCount++;
		if (callCount === 2) {
			throw new Error("GridFS set failure");
		}

		return originalSet(key, value, ttl);
	};

	const result = await store.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
	]);
	t.expect(result).toEqual([true, false]);
	store.set = originalSet;
});

it("GridFS delete returns false when bucket.delete throws", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "some-data");
	const client = await store.connect;
	// Close the connection to make bucket.delete throw
	await client.mongoClient.close();
	const result = await store.delete(key);
	t.expect(result).toBe(false);
});

const delay = async (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

it("GridFS get returns undefined for expired entry and deletes it", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "expiring-value", 1);
	await delay(50);
	const result = await store.get(key);
	t.expect(result).toBeUndefined();
});

it("GridFS iterator skips and deletes expired entries", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	await store.clear();
	const expiredKey = faker.string.alphanumeric(10);
	const freshKey = faker.string.alphanumeric(10);
	await store.set(expiredKey, "expired-value", 1);
	await store.set(freshKey, "fresh-value");
	await delay(50);
	const entries: Array<[string, unknown]> = [];
	for await (const entry of store.iterator()) {
		entries.push(entry as [string, unknown]);
	}

	t.expect(entries.length).toBe(1);
	t.expect(entries[0][0]).toBe(freshKey);
});

it("GridFS clearExpired deletes expired files", async (t) => {
	const store = new StorelyMongo({ useGridFS: true, ...options });
	await store.clear();
	const key = faker.string.alphanumeric(10);
	await store.set(key, "expiring-value", 1);
	await delay(50);
	await store.clearExpired();
	const result = await store.get(key);
	t.expect(result).toBeUndefined();
});
