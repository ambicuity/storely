import type Storely from "storely";
import { describe, expectTypeOf, test } from "vitest";
import type { StorelyRocksDBOptions } from "../src/index.js";
import StorelyRocksDB, {
	createStorelyRocksDB,
	createStorelyRocksDBNonBlocking,
} from "../src/index.js";

describe("StorelyRocksDB Types", () => {
	test("should accept string URI in constructor", () => {
		const adapter = new StorelyRocksDB("rocksdb://:memory:");
		expectTypeOf(adapter).toBeCallable();
	});

	test("should accept options object in constructor", () => {
		const options: StorelyRocksDBOptions = {
			uri: "rocksdb://:memory:",
			readOnly: false,
			createIfMissing: true,
			errorIfExists: false,
			compression: "snappy",
			clearExpiredInterval: 0,
			iterationLimit: 100,
			infoLogLevel: "warn",
		};
		const adapter = new StorelyRocksDB(options);
		expectTypeOf(adapter).toBeCallable();
	});

	test("createStorelyRocksDB returns a Storely instance", () => {
		const storely = createStorelyRocksDB("rocksdb://:memory:");
		expectTypeOf(storely).toMatchTypeOf<Storely>();
	});

	test("createStorelyRocksDBNonBlocking returns a Storely instance", () => {
		const storely = createStorelyRocksDBNonBlocking("rocksdb://:memory:");
		expectTypeOf(storely).toMatchTypeOf<Storely>();
	});

	test("StorelyRocksDBOptions type has all expected properties", () => {
		expectTypeOf<StorelyRocksDBOptions>().toHaveProperty("uri");
		expectTypeOf<StorelyRocksDBOptions>().toHaveProperty("readOnly");
		expectTypeOf<StorelyRocksDBOptions>().toHaveProperty("createIfMissing");
		expectTypeOf<StorelyRocksDBOptions>().toHaveProperty("errorIfExists");
		expectTypeOf<StorelyRocksDBOptions>().toHaveProperty("compression");
		expectTypeOf<StorelyRocksDBOptions>().toHaveProperty("clearExpiredInterval");
		expectTypeOf<StorelyRocksDBOptions>().toHaveProperty("iterationLimit");
		expectTypeOf<StorelyRocksDBOptions>().toHaveProperty("infoLogLevel");
	});

	test("should be able to set adapter-level generic value type", async () => {
		type Value = { foo: string };

		const storelyRocksDB = new StorelyRocksDB<Value>();

		expectTypeOf(storelyRocksDB.get("foo")).toEqualTypeOf<Promise<Value | undefined>>();

		expectTypeOf(storelyRocksDB.getMany(["foo", "bar"])).toEqualTypeOf<
			Promise<Array<Value | undefined>>
		>();

		expectTypeOf(storelyRocksDB.iterator()).toEqualTypeOf<
			AsyncGenerator<[string, Value | undefined], void, unknown>
		>();
	});

	test("should be able to set method-level generic value type", async () => {
		type ValueFoo = { foo: string };

		type ValueBar = { bar: string };

		const storelyRocksDB = new StorelyRocksDB<ValueFoo>();

		expectTypeOf(storelyRocksDB.get<ValueBar>("foo")).toEqualTypeOf<
			Promise<ValueBar | undefined>
		>();

		expectTypeOf(storelyRocksDB.getMany<ValueBar>(["foo", "bar"])).toEqualTypeOf<
			Promise<Array<ValueBar | undefined>>
		>();

		expectTypeOf(storelyRocksDB.iterator<ValueBar>()).toEqualTypeOf<
			AsyncGenerator<[string, ValueBar | undefined], void, unknown>
		>();
	});
});
