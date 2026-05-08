import { describe, expectTypeOf, test } from "vitest";
import StorelyKeyDB from "../src/index.js";

describe("StorelyKeyDB Types", () => {
	test("should be able to set adapter-level generic value type", async () => {
		type Value = { foo: string };

		const storelyKeyDB = new StorelyKeyDB<Value>();

		expectTypeOf(storelyKeyDB.get("foo")).toEqualTypeOf<Promise<Value | undefined>>();

		expectTypeOf(storelyKeyDB.getMany(["foo", "bar"])).toEqualTypeOf<
			Promise<Array<Value | undefined>>
		>();

		expectTypeOf(storelyKeyDB.iterator()).toEqualTypeOf<
			AsyncGenerator<[string, Value | undefined], void, unknown>
		>();
	});

	test("should be able to set method-level generic value type", async () => {
		type ValueFoo = { foo: string };

		type ValueBar = { bar: string };

		const storelyKeyDB = new StorelyKeyDB<ValueFoo>();

		expectTypeOf(storelyKeyDB.get<ValueBar>("foo")).toEqualTypeOf<Promise<ValueBar | undefined>>();

		expectTypeOf(storelyKeyDB.getMany<ValueBar>(["foo", "bar"])).toEqualTypeOf<
			Promise<Array<ValueBar | undefined>>
		>();

		expectTypeOf(storelyKeyDB.iterator<ValueBar>()).toEqualTypeOf<
			AsyncGenerator<[string, ValueBar | undefined], void, unknown>
		>();
	});
});
