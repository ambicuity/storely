import { describe, expectTypeOf, test } from "vitest";
import StorelyRedis from "../src/index.js";

describe("StorelyRedis Types", () => {
	test("should be able to set adapter-level generic value type", async () => {
		type Value = { foo: string };

		const storelyRedis = new StorelyRedis<Value>();

		expectTypeOf(storelyRedis.get("foo")).toEqualTypeOf<Promise<Value | undefined>>();

		expectTypeOf(storelyRedis.getMany(["foo", "bar"])).toEqualTypeOf<
			Promise<Array<Value | undefined>>
		>();

		expectTypeOf(storelyRedis.iterator()).toEqualTypeOf<
			AsyncGenerator<[string, Value | undefined], void, unknown>
		>();
	});

	test("should be able to set method-level generic value type", async () => {
		type ValueFoo = { foo: string };

		type ValueBar = { bar: string };

		const storelyRedis = new StorelyRedis<ValueFoo>();

		expectTypeOf(storelyRedis.get<ValueBar>("foo")).toEqualTypeOf<Promise<ValueBar | undefined>>();

		expectTypeOf(storelyRedis.getMany<ValueBar>(["foo", "bar"])).toEqualTypeOf<
			Promise<Array<ValueBar | undefined>>
		>();

		expectTypeOf(storelyRedis.iterator<ValueBar>()).toEqualTypeOf<
			AsyncGenerator<[string, ValueBar | undefined], void, unknown>
		>();
	});
});
