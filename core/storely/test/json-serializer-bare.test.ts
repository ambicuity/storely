import { describe, expect, test } from "vitest";
import { StorelyJsonSerializer } from "../src/json-serializer.js";

describe("JSON serializer bare-value encoding", () => {
	const ser = new StorelyJsonSerializer();

	test("stringifies bare value when expires is undefined", async () => {
		const out = await ser.stringify({ value: "hello", expires: undefined });
		expect(out).toBe('*"hello"');
	});

	test("stringifies wrapped value when expires is set", async () => {
		const out = await ser.stringify({ value: "hello", expires: 1234567890 });
		expect(out).toBe('{"value":"hello","expires":1234567890}');
	});

	test("parses bare-value form", async () => {
		const parsed = await ser.parse<{ value: string; expires?: number }>('*"hello"');
		expect(parsed).toEqual({ value: "hello", expires: undefined });
	});

	test("parses legacy wrapped form (backward compat)", async () => {
		const parsed = await ser.parse<{ value: string; expires?: number }>(
			'{"value":"hello","expires":1234567890}',
		);
		expect(parsed).toEqual({ value: "hello", expires: 1234567890 });
	});

	test("round-trips complex types in bare mode", async () => {
		const obj = { a: 1, b: [1, 2, 3], c: { nested: true } };
		const out = await ser.stringify({ value: obj, expires: undefined });
		const parsed = await ser.parse<{ value: typeof obj; expires?: number }>(out);
		expect(parsed).toEqual({ value: obj, expires: undefined });
	});

	test("round-trips Buffer and BigInt in bare mode", async () => {
		const out = await ser.stringify({
			value: { buf: Buffer.from("hi"), big: 42n },
			expires: undefined,
		});
		const parsed = await ser.parse<{ value: { buf: Buffer; big: bigint }; expires?: number }>(out);
		expect(parsed?.value.buf).toBeInstanceOf(Buffer);
		expect(parsed?.value.buf.toString()).toBe("hi");
		expect(parsed?.value.big).toBe(42n);
	});
});
