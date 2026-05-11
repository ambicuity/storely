import { Buffer } from "node:buffer";
import type StorelyModule from "@ambicuity/storely";
import { faker } from "@faker-js/faker";
import BigNumber from "bignumber.js";
import JSONbig from "json-bigint";
import type { StorelyStoreFn, TestFunction } from "./types.js";

/**
 * Registers Storely value type tests: verifies storage of false, null, undefined, numbers,
 * objects, buffers, strings, symbols, BigInt, and special characters.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param Storely - The Storely constructor
 * @param store - Factory that returns a fresh store instance per test
 */
const storelyValueTests = (
	test: TestFunction,
	Storely: typeof StorelyModule,
	store: StorelyStoreFn,
) => {
	test("value can be false", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		await storely.set(key, false);
		t.expect(await storely.get(key)).toBeFalsy();
	});

	test("value can be null", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		await storely.set(key, null);
		t.expect(await storely.get(key)).toBeNull();
	});

	test("value can be undefined", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		await storely.set(key, undefined);
		t.expect(await storely.get(key)).toBeUndefined();
	});

	test("value can be a number", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		await storely.set(key, 0);
		t.expect(await storely.get(key)).toBe(0);
	});

	test("value can be an object", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = { fizz: "buzz" };
		await storely.set(key, value);
		t.expect(await storely.get(key)).toEqual(value);
	});

	test("value can be a buffer", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const buf = Buffer.from("bar");
		await storely.set(key, buf);
		const result = await storely.get(key);
		/* v8 ignore next -- @preserve */
		if (result !== undefined) {
			t.expect(buf.equals(result)).toBeTruthy();
		} else {
			/* v8 ignore next -- @preserve */
			t.expect(result).toBeDefined();
		}
	});

	test("value can be an object containing a buffer", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = { buff: Buffer.from("buzz") };
		await storely.set(key, value);
		t.expect(await storely.get(key)).toEqual(value);
	});

	test("value can contain quotes", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = '"';
		await storely.set(key, value);
		t.expect(await storely.get(key)).toEqual(value);
	});

	test("value can be a string", async (t) => {
		const storely = new Storely({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await storely.set(key, value);
		t.expect(await storely.get(key)).toBe(value);
	});

	test("value can not be symbol", async (t) => {
		const storely = new Storely({ store: store() });
		storely.on("error", () => {});
		const key = faker.string.alphanumeric(10);
		const value = Symbol("value");

		const result = await storely.set(key, value);
		t.expect(result).toBe(false);
	});

	test("value can be BigInt using other serializer/deserializer", async (t) => {
		const storely = new Storely({
			store: store(),
			serialization: {
				stringify: (data: unknown) => JSONbig.stringify(data),
				parse: <T>(data: string) => JSONbig.parse(data) as T,
			},
		});
		const key = faker.string.alphanumeric(10);
		const value = BigInt("9223372036854775807") as unknown as BigNumber.Value;
		await storely.set(key, value);
		const storedValue = await storely.get(key);
		t.expect(JSONbig.stringify(storedValue)).toBe(BigNumber(value).toString());
	});

	test("single quotes value should be saved", async (t) => {
		const storely = new Storely({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);

		let value = "'";
		await storely.set(key1, value);
		t.expect(await storely.get(key1)).toBe(value);

		value = "''";
		await storely.set(key2, value);
		t.expect(await storely.get(key2)).toBe(value);
		value = '"';
		await storely.set(key3, value);
		t.expect(await storely.get(key3)).toBe(value);
	});

	test("single quotes key should be saved", async (t) => {
		const storely = new Storely({ store: store() });

		const value = "'";

		const key = "'";
		const result = await storely.set(key, value);
		t.expect(result).toBe(true);
		t.expect(await storely.get(key)).toBe(value);
	});
};

export { storelyValueTests };
