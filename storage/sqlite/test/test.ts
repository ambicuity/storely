import Storely from "@ambicuity/ambicore";
import { storageTestSuite, storelyTestSuite } from "@ambicuity/test-suite";
import { faker } from "@faker-js/faker";
import { beforeEach, it, vi } from "vitest";
import StorelySqlite, { createStorely } from "../src/index.js";

const store = () => new StorelySqlite({ uri: "sqlite://test/testdb.sqlite", busyTimeout: 3000 });

storelyTestSuite(it, Storely, store);
storageTestSuite(it, store, { ttl: false, concurrency: true });

beforeEach(async () => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
});

it("table name can be numeric, alphabet, special case", (t) => {
	let storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		// @ts-expect-error testing
		table: 3000,
	});
	t.expect(storely.table).toBe("_3000");

	storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		table: "sample",
	});
	t.expect(storely.table).toBe("sample");

	// Special characters are now stripped for SQL injection prevention
	storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		table: "$sample",
	});
	t.expect(storely.table).toBe("sample");

	// Table name with only special characters should throw
	t.expect(
		() =>
			new StorelySqlite({
				uri: "sqlite://test/testdb.sqlite",
				table: "$$$",
			}),
	).toThrow("Invalid table name: must contain alphanumeric characters");
});

it("keySize validation throws on invalid values", (t) => {
	// Test NaN
	t.expect(
		() =>
			new StorelySqlite({
				uri: "sqlite://test/testdb.sqlite",
				// @ts-expect-error - testing invalid keySize
				keySize: "invalid",
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");

	// Test zero
	t.expect(
		() =>
			new StorelySqlite({
				uri: "sqlite://test/testdb.sqlite",
				keySize: 0,
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");

	// Test negative
	t.expect(
		() =>
			new StorelySqlite({
				uri: "sqlite://test/testdb.sqlite",
				keySize: -100,
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");

	// Test too large
	t.expect(
		() =>
			new StorelySqlite({
				uri: "sqlite://test/testdb.sqlite",
				keySize: 70000,
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");

	// Test Infinity
	t.expect(
		() =>
			new StorelySqlite({
				uri: "sqlite://test/testdb.sqlite",
				keySize: Infinity,
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");
});

it("keySize accepts valid values", (t) => {
	const storely1 = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		keySize: 100,
	});
	t.expect(storely1.keySize).toBe(100);

	const storely2 = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		keySize: 65535,
	});
	t.expect(storely2.keySize).toBe(65535);

	const storely3 = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		keySize: 1,
	});
	t.expect(storely3.keySize).toBe(1);
});

it("keyLength alias works for keySize", (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		keyLength: 512,
	});
	t.expect(storely.keySize).toBe(512);
	t.expect(storely.keyLength).toBe(512);
});

it("storely options as a string", (t) => {
	const uri = "sqlite://test/testdb.sqlite";
	const storely = new StorelySqlite(uri);
	t.expect(storely.uri).toBe(uri);
});

it("getMany will return multiple values", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();
	const val3 = faker.lorem.word();
	await storely.set(key1, val1);
	await storely.set(key2, val2);
	await storely.set(key3, val3);
	const values = await storely.getMany([key1, key2, key3]);
	t.expect(values).toStrictEqual([val1, val2, val3]);
});

it("deleteMany will delete multiple records", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();
	const val3 = faker.lorem.word();
	await storely.set(key1, val1);
	await storely.set(key2, val2);
	await storely.set(key3, val3);
	const values = await storely.getMany([key1, key2, key3]);
	t.expect(values).toStrictEqual([val1, val2, val3]);
	await storely.deleteMany([key1, key2, key3]);
	const values1 = await storely.getMany([key1, key2, key3]);
	t.expect(values1).toStrictEqual([undefined, undefined, undefined]);
});

it("Async Iterator single element test", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
	const testKey = faker.string.uuid();
	const testVal = faker.lorem.word();
	await storely.set(testKey, testVal);
	const iterator = storely.iterator();
	for await (const [key, raw] of iterator) {
		t.expect(key).toBe(testKey);
		t.expect(raw).toBe(testVal);
	}
});

it("Async Iterator multiple element test", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		iterationLimit: 3,
	});
	await storely.clear();
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();
	const val3 = faker.lorem.word();
	await storely.set(key1, val1);
	await storely.set(key2, val2);
	await storely.set(key3, val3);
	const expected = new Map([
		[key1, val1],
		[key2, val2],
		[key3, val3],
	]);
	const actual = new Map<string, string>();
	const iterator = storely.iterator();
	for await (const [key, raw] of iterator) {
		actual.set(key, raw);
	}

	t.expect(actual).toStrictEqual(expected);
});

it("Async Iterator multiple elements with limit=1 test", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		iterationLimit: 1,
	});
	await storely.clear();
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();
	const val3 = faker.lorem.word();
	await storely.set(key1, val1);
	await storely.set(key2, val2);
	await storely.set(key3, val3);
	const expected = new Map([
		[key1, val1],
		[key2, val2],
		[key3, val3],
	]);
	const actual = new Map<string, string>();
	const iterator = storely.iterator();
	let entry = await iterator.next();
	while (!entry.done) {
		const [k, v] = entry.value as [string, string];
		actual.set(k, v);
		entry = await iterator.next();
	}

	t.expect(actual).toStrictEqual(expected);
});

it("Async Iterator 0 element test", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		iterationLimit: 1,
	});
	await storely.clear();
	const iterator = storely.iterator("storely");
	const key = await iterator.next();
	t.expect(key.value).toBe(undefined);
});

it("close connection successfully", async (t) => {
	const storely = new StorelySqlite({ uri: "sqlite://test/testdb.sqlite" });
	const testKey = faker.string.uuid();
	const testVal = faker.lorem.word();
	t.expect(await storely.get(testKey)).toBe(undefined);
	await storely.set(testKey, testVal);
	t.expect(await storely.get(testKey)).toBe(testVal);
	await storely.disconnect();
	await t.expect(async () => storely.get(testKey)).rejects.toThrow();
});

it("handling namespaces with multiple storely instances", async (t) => {
	const storeA = new StorelySqlite({ uri: "sqlite://test/testdb.sqlite" });
	const storeB = new StorelySqlite({ uri: "sqlite://test/testdb.sqlite" });
	const storelyA = new Storely({ store: storeA, namespace: "ns1" });
	const storelyB = new Storely({ store: storeB, namespace: "ns2" });

	await storelyA.clear();
	await storelyB.clear();

	const keyA1 = faker.string.uuid();
	const keyA2 = faker.string.uuid();
	const keyA3 = faker.string.uuid();
	const valA1 = faker.lorem.word();
	const valA2 = faker.lorem.word();
	const valA3 = faker.lorem.word();
	const valB1 = faker.lorem.word();
	const valB2 = faker.lorem.word();
	const valB3 = faker.lorem.word();

	await storelyA.set(keyA1, valA1);
	await storelyA.set(keyA2, valA2);
	await storelyA.set(keyA3, valA3);

	await storelyB.set(keyA1, valB1);
	await storelyB.set(keyA2, valB2);
	await storelyB.set(keyA3, valB3);

	const resultA = await storelyA.get([keyA1, keyA2, keyA3]);
	const resultB = await storelyB.get([keyA1, keyA2, keyA3]);

	t.expect(resultA).toStrictEqual([valA1, valA2, valA3]);
	t.expect(resultB).toStrictEqual([valB1, valB2, valB3]);

	const iteratorResultA = new Map<string, string>();

	const iterator1 = storelyA.iterator ? storelyA.iterator("ns1") : undefined;
	if (iterator1) {
		for await (const [key, value] of iterator1) {
			iteratorResultA.set(key, value);
		}
	}

	t.expect(iteratorResultA).toStrictEqual(
		new Map([
			[keyA1, valA1],
			[keyA2, valA2],
			[keyA3, valA3],
		]),
	);
});

it("will create a Storely instance with a store", (t) => {
	const storely = createStorely("sqlite://test/testdb.sqlite");
	t.expect(storely).toBeInstanceOf(Storely);
});

it("WAL mode can be enabled", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb-wal.sqlite",
		wal: true,
	});
	const result = (await storely.query("PRAGMA journal_mode")) as Array<{
		journal_mode: string;
	}>;
	t.expect(result[0].journal_mode).toBe("wal");
	await storely.disconnect();
});

it("WAL mode is not enabled by default", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb-nowal.sqlite",
	});
	const result = (await storely.query("PRAGMA journal_mode")) as Array<{
		journal_mode: string;
	}>;
	t.expect(result[0].journal_mode).not.toBe("wal");
	await storely.disconnect();
});

it("WAL mode does not work with in-memory database (remains as memory mode)", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://:memory:",
		wal: true,
	});
	const result = (await storely.query("PRAGMA journal_mode")) as Array<{
		journal_mode: string;
	}>;
	// In-memory databases cannot use WAL mode, they remain in "memory" journal mode
	t.expect(result[0].journal_mode).toBe("memory");
	// But basic operations should still work
	const testKey = faker.string.uuid();
	const testVal = faker.lorem.word();
	await storely.set(testKey, testVal);
	const value = await storely.get(testKey);
	t.expect(value).toBe(testVal);
	await storely.disconnect();
});

it("WAL mode with in-memory database logs a warning", async (t) => {
	const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

	const storely = new StorelySqlite({
		uri: "sqlite://:memory:",
		wal: true,
	});

	// Wait for the database to initialize (the warn happens during initialization)
	await storely.query("SELECT 1");

	t.expect(warnSpy).toHaveBeenCalledWith(
		"@ambicuity/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
	);

	warnSpy.mockRestore();
	await storely.disconnect();
});

// --- New feature tests ---

it("setMany upserts existing keys", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const oldVal = faker.lorem.word();
	const newVal = faker.lorem.word();
	const val2 = faker.lorem.word();
	await storely.set(key1, oldVal);
	await storely.setMany([
		{ key: key1, value: newVal },
		{ key: key2, value: val2 },
	]);
	t.expect(await storely.get(key1)).toBe(newVal);
	t.expect(await storely.get(key2)).toBe(val2);
});

it("clearExpired removes expired entries", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
	// Set an entry with an already-expired timestamp
	const expiredValue = JSON.stringify({
		value: "old",
		expires: Date.now() - 1000,
	});
	const validValue = JSON.stringify({ value: "current", expires: null });
	const expiredKey = faker.string.uuid();
	const validKey = faker.string.uuid();
	await storely.set(expiredKey, expiredValue);
	await storely.set(validKey, validValue);
	// has() should already filter expired entries
	t.expect(await storely.has(expiredKey)).toBe(false);
	t.expect(await storely.has(validKey)).toBe(true);
	await storely.clearExpired();
	t.expect(await storely.has(expiredKey)).toBe(false);
	t.expect(await storely.has(validKey)).toBe(true);
});

it("clearExpiredInterval auto-cleans expired entries", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		clearExpiredInterval: 100,
	});
	await storely.clear();
	const expiredValue = JSON.stringify({
		value: "old",
		expires: Date.now() - 1000,
	});
	const autoExpiredKey = faker.string.uuid();
	await storely.set(autoExpiredKey, expiredValue);
	// has() should already filter expired entries
	t.expect(await storely.has(autoExpiredKey)).toBe(false);
	// Wait for the cleanup timer to fire (which deletes the row entirely)
	await new Promise((resolve) => {
		setTimeout(resolve, 250);
	});
	t.expect(await storely.has(autoExpiredKey)).toBe(false);
	await storely.disconnect();
});

it("clearExpiredInterval setter restarts timer", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	t.expect(storely.clearExpiredInterval).toBe(0);
	storely.clearExpiredInterval = 500;
	t.expect(storely.clearExpiredInterval).toBe(500);
	// Reset to 0 to disable
	storely.clearExpiredInterval = 0;
	t.expect(storely.clearExpiredInterval).toBe(0);
	await storely.disconnect();
});

it("namespace column stores namespace separately from key", async (t) => {
	const storeA = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	const storeB = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	storeA.namespace = "nsA";
	storeB.namespace = "nsB";

	await storeA.clear();
	await storeB.clear();

	// Same key, different namespaces
	const nsKey = faker.string.uuid();
	const valA = faker.lorem.word();
	const valB = faker.lorem.word();
	await storeA.set(`nsA:${nsKey}`, valA);
	await storeB.set(`nsB:${nsKey}`, valB);

	t.expect(await storeA.get(`nsA:${nsKey}`)).toBe(valA);
	t.expect(await storeB.get(`nsB:${nsKey}`)).toBe(valB);

	// Clear one namespace should not affect the other
	await storeA.clear();
	t.expect(await storeA.get(`nsA:${nsKey}`)).toBe(undefined);
	t.expect(await storeB.get(`nsB:${nsKey}`)).toBe(valB);

	await storeB.clear();
});

it("namespaceLength option is respected", (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		namespaceLength: 128,
	});
	t.expect(storely.namespaceLength).toBe(128);
});

it("property getters return all configured values", (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		keySize: 512,
		namespaceLength: 128,
		busyTimeout: 5000,
		iterationLimit: 50,
		wal: false,
		clearExpiredInterval: 1000,
	});
	t.expect(storely.uri).toBe("sqlite://test/testdb.sqlite");
	t.expect(storely.keySize).toBe(512);
	t.expect(storely.keyLength).toBe(512);
	t.expect(storely.namespaceLength).toBe(128);
	t.expect(storely.busyTimeout).toBe(5000);
	t.expect(storely.iterationLimit).toBe(50);
	t.expect(storely.wal).toBe(false);
	t.expect(storely.clearExpiredInterval).toBe(1000);
});

it("migrates old schema that lacks namespace column", async (t) => {
	const dbPath = "test/testdb-migration.sqlite";
	const fs = await import("node:fs");
	// Remove any leftover db
	try {
		fs.unlinkSync(dbPath);
	} catch {}

	// Create a database with the old schema (no namespace/expires columns)
	const Database = (await import("better-sqlite3")).default;
	const db = new Database(dbPath);
	db.exec("CREATE TABLE storely(key VARCHAR(255) PRIMARY KEY, value TEXT)");
	db.prepare("INSERT INTO storely (key, value) VALUES (?, ?)").run("oldkey", "oldval");
	db.close();

	// Open with the new adapter — should trigger migration
	const storely = new StorelySqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
	// Old data should be preserved
	t.expect(await storely.get("oldkey")).toBe("oldval");
	// New features should work
	await storely.set("newkey", "newval");
	t.expect(await storely.get("newkey")).toBe("newval");
	await storely.disconnect();

	try {
		fs.unlinkSync(dbPath);
	} catch {}
});

it("migrates schema that has namespace but lacks expires column", async (t) => {
	const dbPath = "test/testdb-migration2.sqlite";
	const fs = await import("node:fs");
	try {
		fs.unlinkSync(dbPath);
	} catch {}

	// Create a database with namespace but no expires column
	const Database = (await import("better-sqlite3")).default;
	const db = new Database(dbPath);
	db.exec(
		"CREATE TABLE storely(key VARCHAR(255) NOT NULL, value TEXT, namespace VARCHAR(255) NOT NULL DEFAULT '', UNIQUE(key, namespace))",
	);
	db.prepare("INSERT INTO storely (key, value, namespace) VALUES (?, ?, ?)").run("k1", "v1", "");
	db.close();

	// Open with the new adapter — should add expires column
	const storely = new StorelySqlite({
		uri: `sqlite://${dbPath}`,
		busyTimeout: 3000,
	});
	t.expect(await storely.get("k1")).toBe("v1");
	// Expires-related features should work
	const expiredValue = JSON.stringify({
		value: "temp",
		expires: Date.now() - 1000,
	});
	await storely.set("expiring", expiredValue);
	await storely.clearExpired();
	t.expect(await storely.has("expiring")).toBe(false);
	await storely.disconnect();

	try {
		fs.unlinkSync(dbPath);
	} catch {}
});

it("iterationLimit can be updated after construction", (t) => {
	const storely = new StorelySqlite({ uri: "sqlite://test/testdb.sqlite" });
	storely.iterationLimit = 99;
	t.expect(storely.iterationLimit).toBe(99);
});

it("getExpiresFromValue handles non-string object values", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
	// Pass an object value (not a string) with expires — covers the non-string branch
	const objValue = { value: faker.lorem.word(), expires: Date.now() + 60000 };
	const objKey = faker.string.uuid();
	await storely.set(objKey, objValue);
	t.expect(await storely.has(objKey)).toBe(true);
});

// --- SQL injection prevention tests ---

it("table name with SQL injection characters is sanitized at construction", async (t) => {
	// Attempt to inject via table name — toTableString strips all non-alphanumeric chars
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		table: "storely'; DROP TABLE storely; --",
		busyTimeout: 3000,
	});
	// Sanitized to "storelyDROPTABLEstorely" (only alphanumeric chars kept)
	t.expect(storely.table).toBe("storelyDROPTABLEstorely");
	// Operations should work on the sanitized table name
	const testKey = faker.string.uuid();
	const testVal = faker.lorem.word();
	await storely.set(testKey, testVal);
	t.expect(await storely.get(testKey)).toBe(testVal);
	await storely.clear();
	await storely.disconnect();
});

it("table setter sanitizes table name (prevents post-construction injection)", (t) => {
	const storely = new StorelySqlite({ uri: "sqlite://test/testdb.sqlite" });
	storely.table = "evil'; DROP TABLE storely;--";
	// Should be sanitized, not the raw malicious string
	t.expect(storely.table).toBe("evilDROPTABLEstorely");
});

it("table name that is a SQLite reserved keyword works correctly", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		table: "select",
		busyTimeout: 3000,
	});
	// escapeIdentifier wraps in double quotes, so "select" is safe as a table name
	t.expect(storely.table).toBe("select");
	const testKey = faker.string.uuid();
	const testVal = faker.lorem.word();
	await storely.set(testKey, testVal);
	t.expect(await storely.get(testKey)).toBe(testVal);
	await storely.clear();
	await storely.disconnect();
});

it("table name with double quotes is escaped correctly", async (t) => {
	// Double quotes in the name would break identifier escaping without proper handling
	// toTableString strips them, but escapeIdentifier also handles them as defense-in-depth
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		table: 'my"table',
		busyTimeout: 3000,
	});
	// toTableString strips the double-quote character
	t.expect(storely.table).toBe("mytable");
	const testKey = faker.string.uuid();
	const testVal = faker.lorem.word();
	await storely.set(testKey, testVal);
	t.expect(await storely.get(testKey)).toBe(testVal);
	await storely.clear();
	await storely.disconnect();
});

it("property getters return correct defaults", async (t) => {
	const storely = new StorelySqlite();
	t.expect(storely.uri).toBe("sqlite://:memory:");
	t.expect(storely.table).toBe("storely");
	t.expect(storely.keySize).toBe(255);
	t.expect(storely.namespaceLength).toBe(255);
	t.expect(storely.db).toBe(":memory:");
	t.expect(storely.iterationLimit).toBe(10);
	t.expect(storely.wal).toBe(false);
	t.expect(storely.busyTimeout).toBeUndefined();
	t.expect(storely.driver).toBeUndefined();
	t.expect(storely.namespace).toBeUndefined();
	t.expect(storely.clearExpiredInterval).toBe(0);
	await storely.disconnect();
});

it("property getters return constructor-provided values", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://:memory:",
		table: "custom",
		keySize: 512,
		namespaceLength: 128,
		busyTimeout: 5000,
		iterationLimit: 50,
		wal: false,
		driver: "better-sqlite3",
	});
	t.expect(storely.table).toBe("custom");
	t.expect(storely.keySize).toBe(512);
	t.expect(storely.namespaceLength).toBe(128);
	t.expect(storely.busyTimeout).toBe(5000);
	t.expect(storely.iterationLimit).toBe(50);
	t.expect(storely.driver).toBe("better-sqlite3");
	await storely.disconnect();
});

it("table setter sanitizes input", async (t) => {
	const storely = new StorelySqlite("sqlite://:memory:");
	storely.table = "my_table";
	t.expect(storely.table).toBe("my_table");
	storely.table = '3bad"name';
	t.expect(storely.table).toBe("_3badname");
	await storely.disconnect();
});

it("keySize setter updates value", async (t) => {
	const storely = new StorelySqlite("sqlite://:memory:");
	t.expect(storely.keySize).toBe(255);
	storely.keySize = 512;
	t.expect(storely.keySize).toBe(512);
	await storely.disconnect();
});

it("namespaceLength setter updates value", async (t) => {
	const storely = new StorelySqlite("sqlite://:memory:");
	t.expect(storely.namespaceLength).toBe(255);
	storely.namespaceLength = 128;
	t.expect(storely.namespaceLength).toBe(128);
	await storely.disconnect();
});

it("setMany returns false entries on query error", async (t) => {
	const storely = new StorelySqlite("sqlite://:memory:");
	let emittedError = false;
	storely.on("error", () => {
		emittedError = true;
	});
	// Close the connection to force an error
	await storely.disconnect();
	const result = await storely.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
	]);
	t.expect(result).toEqual([false, false]);
	t.expect(emittedError).toBe(true);
});

it("has returns false and deletes expired key", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
	const key = faker.string.uuid();
	const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
	await storely.set(key, expiredValue);
	t.expect(await storely.has(key)).toBe(false);
	// Verify the key was deleted
	t.expect(await storely.get(key)).toBeUndefined();
});

it("getMany returns undefined for expired keys and deletes them", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
	const expiredKey1 = faker.string.uuid();
	const expiredKey2 = faker.string.uuid();
	const validKey = faker.string.uuid();
	const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
	const validValue = JSON.stringify({ value: "fresh", expires: Date.now() + 60_000 });
	await storely.set(expiredKey1, expiredValue);
	await storely.set(expiredKey2, expiredValue);
	await storely.set(validKey, validValue);
	const result = await storely.getMany([expiredKey1, expiredKey2, validKey]);
	t.expect(result[0]).toBeUndefined();
	t.expect(result[1]).toBeUndefined();
	t.expect(result[2]).toBe(validValue);
	// Verify expired keys were deleted
	t.expect(await storely.get(expiredKey1)).toBeUndefined();
	t.expect(await storely.get(expiredKey2)).toBeUndefined();
});

it("hasMany returns false for expired keys and deletes them", async (t) => {
	const storely = new StorelySqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await storely.clear();
	const expiredKey1 = faker.string.uuid();
	const expiredKey2 = faker.string.uuid();
	const validKey = faker.string.uuid();
	const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
	const validValue = JSON.stringify({ value: "fresh", expires: Date.now() + 60_000 });
	await storely.set(expiredKey1, expiredValue);
	await storely.set(expiredKey2, expiredValue);
	await storely.set(validKey, validValue);
	const result = await storely.hasMany([expiredKey1, expiredKey2, validKey]);
	t.expect(result[0]).toBe(false);
	t.expect(result[1]).toBe(false);
	t.expect(result[2]).toBe(true);
	// Verify expired keys were deleted
	t.expect(await storely.has(expiredKey1)).toBe(false);
	t.expect(await storely.has(expiredKey2)).toBe(false);
});

it("iterationLimit setter updates value", async (t) => {
	const storely = new StorelySqlite("sqlite://:memory:");
	t.expect(storely.iterationLimit).toBe(10);
	storely.iterationLimit = 99;
	t.expect(storely.iterationLimit).toBe(99);
	await storely.disconnect();
});
