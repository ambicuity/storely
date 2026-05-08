import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { afterEach, beforeEach, describe, it } from "vitest";
import StorelyRocksDB from "../src/index.js";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "storely-rocksdb-test-"));
	dbPath = join(tempDir, "testdb");
});

afterEach(async () => {
	try {
		rmSync(tempDir, { recursive: true, force: true });
	} catch {}
});

describe("constructor options", () => {
	it("accepts a string URI", (t) => {
		const store = new StorelyRocksDB(`rocksdb://${dbPath}`);
		t.expect(store.uri).toBe(`rocksdb://${dbPath}`);
		t.expect(store.db).toBe(dbPath);
	});

	it("accepts an options object with URI", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		t.expect(store.uri).toBe(`rocksdb://${dbPath}`);
		t.expect(store.db).toBe(dbPath);
	});

	it("defaults to :memory: URI", (t) => {
		const store = new StorelyRocksDB();
		t.expect(store.uri).toBe("rocksdb://:memory:");
	});

	it("accepts readOnly option", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}`, readOnly: true });
		t.expect(store.readOnly).toBe(true);
	});

	it("accepts createIfMissing option", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}`, createIfMissing: false });
		t.expect(store.createIfMissing).toBe(false);
	});

	it("accepts errorIfExists option", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}`, errorIfExists: true });
		t.expect(store.errorIfExists).toBe(true);
	});

	it("accepts compression option", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}`, compression: "zstd" });
		t.expect(store.compression).toBe("zstd");
	});

	it("accepts infoLogLevel option", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}`, infoLogLevel: "debug" });
		t.expect(store.infoLogLevel).toBe("debug");
	});

	it("accepts clearExpiredInterval option", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}`, clearExpiredInterval: 500 });
		t.expect(store.clearExpiredInterval).toBe(500);
	});

	it("accepts iterationLimit option", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}`, iterationLimit: 50 });
		t.expect(store.iterationLimit).toBe(50);
	});
});

describe("property defaults", () => {
	it("returns default property values", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		t.expect(store.uri).toBe(`rocksdb://${dbPath}`);
		t.expect(store.readOnly).toBe(false);
		t.expect(store.createIfMissing).toBe(true);
		t.expect(store.errorIfExists).toBe(false);
		t.expect(store.compression).toBe("snappy");
		t.expect(store.infoLogLevel).toBe("warn");
		t.expect(store.clearExpiredInterval).toBe(0);
		t.expect(store.iterationLimit).toBe(100);
		t.expect(store.throwOnErrors).toBe(false);
		t.expect(store.namespace).toBeUndefined();
	});
});

describe("property setters", () => {
	it("iterationLimit can be updated after construction", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		store.iterationLimit = 50;
		t.expect(store.iterationLimit).toBe(50);
	});

	it("iterationLimit throws on invalid values", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		t.expect(() => {
			store.iterationLimit = 0;
		}).toThrow(RangeError);
		t.expect(() => {
			store.iterationLimit = -1;
		}).toThrow(RangeError);
		t.expect(() => {
			// @ts-expect-error testing invalid value
			store.iterationLimit = 1.5;
		}).toThrow(RangeError);
	});

	it("clearExpiredInterval setter restarts timer", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		t.expect(store.clearExpiredInterval).toBe(0);
		store.clearExpiredInterval = 500;
		t.expect(store.clearExpiredInterval).toBe(500);
		store.clearExpiredInterval = 0;
		t.expect(store.clearExpiredInterval).toBe(0);
	});

	it("throwOnErrors can be toggled", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		t.expect(store.throwOnErrors).toBe(false);
		store.throwOnErrors = true;
		t.expect(store.throwOnErrors).toBe(true);
		store.throwOnErrors = false;
		t.expect(store.throwOnErrors).toBe(false);
	});

	it("namespace can be set and retrieved", (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		t.expect(store.namespace).toBeUndefined();
		store.namespace = "myns";
		t.expect(store.namespace).toBe("myns");
		store.namespace = undefined;
		t.expect(store.namespace).toBeUndefined();
	});
});

describe("disconnect", () => {
	it("disconnect closes the database", async (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await store.set(key, val);
		t.expect(await store.get(key)).toBe(val);
		await store.disconnect();
		await t.expect(async () => store.get(key)).rejects.toThrow();
	});

	it("disconnect removes temp directory for :memory: mode", async (t) => {
		const store = new StorelyRocksDB();
		const dbDir = store.db;
		t.expect(dbDir).toBeTruthy();
		await store.disconnect();
		const { existsSync } = await import("node:fs");
		t.expect(existsSync(dbDir)).toBe(false);
	});

	it("disconnect does not remove directory for file-based mode", async (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		t.expect(store.db).toBe(dbPath);
		await store.disconnect();
		const { existsSync } = await import("node:fs");
		t.expect(existsSync(dbPath)).toBe(true);
	});
});

describe("ready promise", () => {
	it("ready promise resolves", async (t) => {
		const store = new StorelyRocksDB({ uri: `rocksdb://${dbPath}` });
		await t.expect(store.ready).resolves.toBeUndefined();
		await store.disconnect();
	});
});
