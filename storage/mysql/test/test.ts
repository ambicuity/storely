import Storely from "@ambicuity/ambicore";
import {
	delay,
	storageTestSuite,
	storelyIteratorTests,
	storelyTestSuite,
} from "@ambicuity/test-suite";
import { faker } from "@faker-js/faker";
import type mysql from "mysql2";
import { it } from "vitest";
import StorelyMysql, { createStorely } from "../src/index.js";
import { parseConnectionString } from "../src/pool.js";

const uri = "mysql://root@localhost:3306/storely_test";

const store = () => new StorelyMysql(uri);
storelyTestSuite(it, Storely, store);
const iteratorStore = () => new StorelyMysql({ uri, iterationLimit: 2 });
storelyIteratorTests(it, Storely, iteratorStore);
storageTestSuite(it, store, {
	ttl: false,
	batch: false,
	iterator: false,
	namespace: false,
	disconnect: false,
});

it("iterator with explicit namespace", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const storely = new StorelyMysql({ uri });
	storely.namespace = ns;
	const key1 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	const key3 = faker.string.alphanumeric(10);
	const val3 = faker.string.alphanumeric(10);
	await storely.set(key1, val1);
	await storely.set(key2, val2);
	await storely.set(key3, val3);
	const collected = new Map<string, string>();
	for await (const [key, value] of storely.iterator(ns)) {
		collected.set(key, value);
	}

	t.expect(collected.size).toBe(3);
	t.expect(collected.get(key1)).toBe(val1);
	t.expect(collected.get(key2)).toBe(val2);
	t.expect(collected.get(key3)).toBe(val3);
});

it("iterator with default namespace", async (t) => {
	const storely = new StorelyMysql({ uri });
	await storely.clear();
	const key1 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await storely.set(key1, val1);
	await storely.set(key2, val2);
	const collected = new Map<string, string>();
	for await (const [key, value] of storely.iterator()) {
		collected.set(key, value);
	}

	t.expect(collected.size).toBeGreaterThanOrEqual(2);
	t.expect(collected.get(key1)).toBe(val1);
	t.expect(collected.get(key2)).toBe(val2);
	await storely.clear();
});

it(".clear() with undefined namespace", async (t) => {
	const storely = store();
	t.expect(await storely.clear()).toBeUndefined();
});

const connectionSamples = [
	{
		username: "root",
		password: "password",
		host: "localhost",
		port: 3306,
		database: "storely_dbname",
	},
	{
		username: "root",
		password: "password",
		host: "127.0.0.1",
		port: 3306,
		database: "storely_dbname",
	},
	{
		username: "test user",
		password: "very strong pass-word",
		host: "test-stg-cluster.cluster-hqpowufs.ap-dqhowd-1.rds.amazonaws.com",
		port: 5006,
		database: "storely_dbname",
	},
	{
		// Special characters
		username: "John Noêl",
		password: "f.[;@4IWS0,vv)X-dDe FLn+Ün",
		host: "[::1]",
		port: 3306,
		database: "storely_dbname",
	},
	{
		// No password
		username: "nopassword",
		host: "[::1]",
		port: 3306,
		database: "storely_dbname",
	},
	{
		// No port
		username: "noport",
		password: "f.[;@4IWS0,vv)X-dDe#Ln+Ün",
		host: "[::1]",
		database: "storely_dbname",
	},
	{
		// No password & no port
		username: "nopasswordnoport",
		host: "[::1]",
		database: "tablau-èdd",
	},
];

it("validate connection strings", (t) => {
	for (const connection of connectionSamples) {
		const newConnectionString = `mysql://${connection.username}:${connection.password ?? ""}@${connection.host}:${connection.port ?? ""}/${connection.database}`;
		const parsedConnection = parseConnectionString(newConnectionString);

		t.expect(parsedConnection.user).toBe(connection.username);
		t.expect(parsedConnection.password).toBe(connection.password);
		t.expect(parsedConnection.host).toBe(connection.host);
		t.expect(parsedConnection.port).toBe(connection.port);
		t.expect(parsedConnection.database).toBe(connection.database);
	}
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

it("set intervalExpiration to 1 second", async (t) => {
	const storelyMySql = new StorelyMysql({ uri, intervalExpiration: 1 });
	const storely = new Storely({ store: storelyMySql });
	const key1 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	// Ttl: 2s
	await storely.set(key1, val1, 2000);
	// No ttl -> undefined -> (expires:null) -> infinite
	await storely.set(key2, val2);
	const value1 = await storely.get(key1);
	t.expect(value1).toBe(val1);
	await delay(2500);
	const value2 = await storely.get(key1);
	t.expect(value2).toBeUndefined();
	const value3 = await storely.get(key2);
	t.expect(value3).toBe(val2);
});

it(".has() prevents SQL injection with DROP TABLE", async (t) => {
	const storely = new StorelyMysql(uri);
	const safeKey = faker.string.alphanumeric(10);
	await storely.set(safeKey, "value");
	const result = await storely.has("'; DROP TABLE storely; --");
	t.expect(result).toBe(false);
	const safeKeyExists = await storely.has(safeKey);
	t.expect(safeKeyExists).toBe(true);
});

it(".has() handles keys with single quotes", async (t) => {
	const storely = new StorelyMysql(uri);
	const keyWithQuote = "key'with'quotes";
	await storely.set(keyWithQuote, "value");
	t.expect(await storely.has(keyWithQuote)).toBe(true);
});

it(".has() prevents SQL injection with OR condition", async (t) => {
	const storely = new StorelyMysql(uri);
	const realKey = faker.string.alphanumeric(10);
	await storely.set(realKey, "value");
	const result = await storely.has("nonexistent' OR '1'='1");
	t.expect(result).toBe(false);
});

it(".has() handles keys with special SQL characters", async (t) => {
	const storely = new StorelyMysql(uri);
	const specialKeys = [
		"key;with;semicolon",
		"key--with--dashes",
		"key/*comment*/",
		"key\\with\\backslash",
	];
	for (const key of specialKeys) {
		await storely.set(key, "value");
		t.expect(await storely.has(key)).toBe(true);
	}
	t.expect(await storely.has("nonexistent;key")).toBe(false);
});

it(".has() prevents UNION-based SQL injection", async (t) => {
	const storely = new StorelyMysql(uri);
	const result = await storely.has("' UNION SELECT 1 --");
	t.expect(result).toBe(false);
});

it(".setMany() updates existing keys", async (t) => {
	const storely = new StorelyMysql(uri);
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "original");
	await storely.setMany([{ key, value: "updated" }]);
	t.expect(await storely.get(key)).toBe("updated");
});

// Expires column tests
it("set() extracts and stores expires in the expires column", async (t) => {
	const storely = new StorelyMysql(uri);
	const key = faker.string.alphanumeric(10);
	const valueWithExpires = JSON.stringify({
		value: "bar",
		expires: 9999999999999,
	});
	await storely.set(key, valueWithExpires);
	const rows = await storely.query<mysql.RowDataPacket[]>(
		`SELECT expires FROM \`storely\` WHERE id = '${key}' AND namespace = ''`,
	);
	t.expect(Number(rows[0].expires)).toBe(9999999999999);
});

it("set() stores null expires when value has no expires field", async (t) => {
	const storely = new StorelyMysql(uri);
	const key = faker.string.alphanumeric(10);
	await storely.set(key, "plain string value");
	const rows = await storely.query<mysql.RowDataPacket[]>(
		`SELECT expires FROM \`storely\` WHERE id = '${key}' AND namespace = ''`,
	);
	t.expect(rows[0].expires).toBeNull();
});

it("set() updates expires column on upsert", async (t) => {
	const storely = new StorelyMysql(uri);
	const key = faker.string.alphanumeric(10);
	const value1 = JSON.stringify({ value: "bar", expires: 1000 });
	const value2 = JSON.stringify({ value: "bar", expires: 2000 });
	await storely.set(key, value1);
	const rows1 = await storely.query<mysql.RowDataPacket[]>(
		`SELECT expires FROM \`storely\` WHERE id = '${key}' AND namespace = ''`,
	);
	t.expect(Number(rows1[0].expires)).toBe(1000);
	await storely.set(key, value2);
	const rows2 = await storely.query<mysql.RowDataPacket[]>(
		`SELECT expires FROM \`storely\` WHERE id = '${key}' AND namespace = ''`,
	);
	t.expect(Number(rows2[0].expires)).toBe(2000);
});

it("setMany() extracts and stores expires for each entry", async (t) => {
	const storely = new StorelyMysql(uri);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await storely.setMany([
		{ key: key1, value: JSON.stringify({ value: "a", expires: 5000 }) },
		{ key: key2, value: JSON.stringify({ value: "b" }) },
	]);
	const rows = await storely.query<mysql.RowDataPacket[]>(
		`SELECT id, expires FROM \`storely\` WHERE id IN ('${key1}', '${key2}') AND namespace = ''`,
	);
	const row1 = rows.find((r) => r.id === key1);
	const row2 = rows.find((r) => r.id === key2);
	t.expect(Number(row1?.expires)).toBe(5000);
	t.expect(row2?.expires).toBeNull();
});

it("clearExpired() removes expired entries and keeps valid ones", async (t) => {
	const storely = new StorelyMysql(uri);
	const expiredKey = faker.string.alphanumeric(10);
	const validKey = faker.string.alphanumeric(10);
	const noExpiryKey = faker.string.alphanumeric(10);
	// Expired entry (timestamp in the past)
	const expired = JSON.stringify({ value: "old", expires: 1 });
	// Valid entry (far future)
	const valid = JSON.stringify({ value: "new", expires: 9999999999999 });
	// No expiry
	const noExpiry = JSON.stringify({ value: "forever" });
	await storely.set(expiredKey, expired);
	await storely.set(validKey, valid);
	await storely.set(noExpiryKey, noExpiry);
	await storely.clearExpired();
	t.expect(await storely.get(expiredKey)).toBeUndefined();
	t.expect(await storely.get(validKey)).toBe(valid);
	t.expect(await storely.get(noExpiryKey)).toBe(noExpiry);
});

it("clearExpired() is a no-op when no entries are expired", async (t) => {
	const storely = new StorelyMysql(uri);
	const key = faker.string.alphanumeric(10);
	const valid = JSON.stringify({ value: "bar", expires: 9999999999999 });
	await storely.set(key, valid);
	await storely.clearExpired();
	t.expect(await storely.get(key)).toBe(valid);
});

it("expires column is populated when using Storely core with TTL", async (t) => {
	const storelyMysql = new StorelyMysql(uri);
	const storely = new Storely({ store: storelyMysql });
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value, 60_000);
	const rows = await storelyMysql.query<mysql.RowDataPacket[]>(
		`SELECT expires FROM \`storely\` WHERE id = '${key}' AND namespace = ''`,
	);
	t.expect(rows[0].expires).not.toBeNull();
	// expires should be roughly Date.now() + 60000
	const expires = Number(rows[0].expires);
	const now = Date.now();
	t.expect(expires).toBeGreaterThan(now);
	t.expect(expires).toBeLessThanOrEqual(now + 60_000 + 1000);
});

// Native namespace tests
it("native namespace: same key in different namespaces stored independently", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new StorelyMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new StorelyMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	t.expect(await mysql1.get(`${ns1}:${key}`)).toBe(val1);
	t.expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
});

it("native namespace: null namespace stores and retrieves correctly", async (t) => {
	const storely = new StorelyMysql({ uri });
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value);
	t.expect(await storely.get(key)).toBe(value);
});

it("native namespace: clear only clears the specified namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new StorelyMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new StorelyMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	await mysql1.clear();

	t.expect(await mysql1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
});

it("native namespace: delete scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new StorelyMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new StorelyMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	const deleted = await mysql1.delete(`${ns1}:${key}`);
	t.expect(deleted).toBe(true);
	t.expect(await mysql1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
});

it("native namespace: deleteMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new StorelyMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new StorelyMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	const deleted = await mysql1.deleteMany([`${ns1}:${key}`]);
	t.expect(deleted).toEqual([true]);
	t.expect(await mysql1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
});

it("native namespace: has scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new StorelyMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new StorelyMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val);

	t.expect(await mysql1.has(`${ns1}:${key}`)).toBe(true);
	// ns2 should not see ns1's key
	t.expect(await mysql2.has(`${ns2}:${key}`)).toBe(false);
});

it("native namespace: hasMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new StorelyMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new StorelyMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	const result1 = await mysql1.hasMany([`${ns1}:${key}`]);
	t.expect(result1).toEqual([true]);

	const result2 = await mysql1.hasMany([`${ns2}:${key}`]);
	t.expect(result2).toEqual([false]);
});

it("native namespace: iterator only returns keys from correct namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new StorelyMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new StorelyMysql({ uri });
	mysql2.namespace = ns2;

	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const key3 = faker.string.alphanumeric(10);
	await mysql1.set(key1, "val1");
	await mysql1.set(key2, "val2");
	await mysql2.set(key3, "val3");

	const keys: string[] = [];
	for await (const [key] of mysql1.iterator(ns1)) {
		keys.push(key);
	}

	t.expect(keys.length).toBe(2);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

it("native namespace: two Storely instances with different namespaces do not conflict", async (t) => {
	const nsA = faker.string.alphanumeric(8);
	const nsB = faker.string.alphanumeric(8);
	const mysqlA = new StorelyMysql({ uri });
	const mysqlB = new StorelyMysql({ uri });
	const storelyA = new Storely({ store: mysqlA, namespace: nsA });
	const storelyB = new Storely({ store: mysqlB, namespace: nsB });

	const key = faker.string.alphanumeric(10);
	const valA = faker.string.alphanumeric(10);
	const valB = faker.string.alphanumeric(10);
	t.expect(await storelyA.set(key, valA)).toBe(true);
	t.expect(await storelyA.get(key)).toBe(valA);
	t.expect(await storelyB.set(key, valB)).toBe(true);
	t.expect(await storelyB.get(key)).toBe(valB);
	// Ensure they didn't overwrite each other
	t.expect(await storelyA.get(key)).toBe(valA);
});

it("native namespace: getMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new StorelyMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new StorelyMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	const results = await mysql1.getMany([`${ns1}:${key}`]);
	t.expect(results).toEqual([val1]);

	const results2 = await mysql1.getMany([`${ns2}:${key}`]);
	t.expect(results2).toEqual([undefined]);
});

it("native namespace: setMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new StorelyMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new StorelyMysql({ uri });
	mysql2.namespace = ns2;

	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.setMany([
		{ key: `${ns1}:${key1}`, value: val1 },
		{ key: `${ns1}:${key2}`, value: val2 },
	]);

	t.expect(await mysql1.get(`${ns1}:${key1}`)).toBe(val1);
	t.expect(await mysql1.get(`${ns1}:${key2}`)).toBe(val2);
	// ns2 should not see ns1's keys
	t.expect(await mysql2.get(`${ns2}:${key1}`)).toBeUndefined();
});

// Property getter/setter tests
it("properties have correct defaults", (t) => {
	const storely = new StorelyMysql(uri);
	t.expect(storely.uri).toBe(uri);
	t.expect(storely.table).toBe("storely");
	t.expect(storely.keyLength).toBe(255);
	t.expect(storely.namespaceLength).toBe(255);
	t.expect(storely.iterationLimit).toBe(10);
	t.expect(storely.intervalExpiration).toBeUndefined();
	t.expect(storely.namespace).toBeUndefined();
});

it("properties are set correctly via constructor options", (t) => {
	const storely = new StorelyMysql({
		uri,
		table: "custom_table",
		keyLength: 512,
		namespaceLength: 128,
		iterationLimit: 50,
	});
	t.expect(storely.table).toBe("custom_table");
	t.expect(storely.keyLength).toBe(512);
	t.expect(storely.namespaceLength).toBe(128);
	t.expect(storely.iterationLimit).toBe(50);
});

it("property getters return configured values", (t) => {
	const storely = new StorelyMysql({ uri, table: "custom", keyLength: 512 });
	t.expect(storely.table).toBe("custom");
	t.expect(storely.keyLength).toBe(512);
	t.expect(storely.uri).toBe(uri);
	t.expect(storely.namespaceLength).toBe(255);
	t.expect(storely.iterationLimit).toBe(10);
});

it("individual property setters work", (t) => {
	const storely = new StorelyMysql(uri);
	storely.uri = "mysql://otherhost";
	t.expect(storely.uri).toBe("mysql://otherhost");
	storely.table = "updated_table";
	t.expect(storely.table).toBe("updated_table");
	storely.keyLength = 1024;
	t.expect(storely.keyLength).toBe(1024);
	storely.namespaceLength = 128;
	t.expect(storely.namespaceLength).toBe(128);
	storely.iterationLimit = 100;
	t.expect(storely.iterationLimit).toBe(100);
	storely.intervalExpiration = 30;
	t.expect(storely.intervalExpiration).toBe(30);
	storely.namespace = "test-ns";
	t.expect(storely.namespace).toBe("test-ns");
});

// Non-string value tests (covers getExpiresFromValue else branch)
it("set() stores null expires when value is a number (non-string)", async (t) => {
	const storely = new StorelyMysql(uri);
	const key = faker.string.alphanumeric(10);
	await storely.set(key, 42);
	const rows = await storely.query<mysql.RowDataPacket[]>(
		`SELECT expires FROM \`storely\` WHERE id = '${key}' AND namespace = ''`,
	);
	t.expect(rows[0].expires).toBeNull();
});

it("set() stores null expires when value is null (non-string)", async (t) => {
	const storely = new StorelyMysql(uri);
	const key = faker.string.alphanumeric(10);
	await storely.set(key, null);
	const rows = await storely.query<mysql.RowDataPacket[]>(
		`SELECT expires FROM \`storely\` WHERE id = '${key}' AND namespace = ''`,
	);
	t.expect(rows[0].expires).toBeNull();
});

// createStorely helper tests

it("createStorely with URI string returns a Storely instance", async (t) => {
	const storely = createStorely(uri);
	t.expect(storely).toBeInstanceOf(Storely);
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value);
	t.expect(await storely.get(key)).toBe(value);
});

it("setMany returns false entries on query error", async (t) => {
	const store = new StorelyMysql(uri);
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

it("has returns false and deletes expired key", async (t) => {
	const storely = new StorelyMysql(uri);
	const key = faker.string.alphanumeric(10);
	const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
	await storely.set(key, expiredValue);
	t.expect(await storely.has(key)).toBe(false);
	// Verify the key was deleted
	t.expect(await storely.get(key)).toBeUndefined();
});

it("hasMany returns false for expired keys and deletes them", async (t) => {
	const storely = new StorelyMysql(uri);
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

it("setMany with empty array returns empty array", async (t) => {
	const storely = new StorelyMysql(uri);
	const result = await storely.setMany([]);
	t.expect(result).toEqual([]);
});

it("hasMany with empty array returns empty array", async (t) => {
	const storely = new StorelyMysql(uri);
	const result = await storely.hasMany([]);
	t.expect(result).toEqual([]);
});

it("iterator on empty namespace yields nothing", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const storely = new StorelyMysql({ uri });
	storely.namespace = ns;
	const collected: Array<[string, string]> = [];
	for await (const entry of storely.iterator()) {
		collected.push(entry as [string, string]);
	}

	t.expect(collected.length).toBe(0);
});

it("createStorely with options object returns a Storely instance", async (t) => {
	const storely = createStorely({ uri, table: "storely" });
	t.expect(storely).toBeInstanceOf(Storely);
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await storely.set(key, value);
	t.expect(await storely.get(key)).toBe(value);
});
