import Storely from "@ambicuity/storely-core";
import { serializationTestSuite } from "@ambicuity/test-suite";
import { describe, expect, it } from "vitest";
import { StorelySuperJsonSerializer, superJsonSerializer } from "../src/index.js";

// Standard serialization compliance tests
serializationTestSuite(it, superJsonSerializer);

describe("StorelySuperJsonSerializer", () => {
	it("should be instantiable", () => {
		const serializer = new StorelySuperJsonSerializer();
		expect(serializer).toBeInstanceOf(StorelySuperJsonSerializer);
	});

	it("superJsonSerializer is a default instance", () => {
		expect(superJsonSerializer).toBeInstanceOf(StorelySuperJsonSerializer);
	});
});

describe("SuperJSON extended type support", () => {
	it("stringify and parse of Date", () => {
		const date = new Date("2024-01-15T12:00:00.000Z");
		const serialized = superJsonSerializer.stringify({ value: date });
		const deserialized = superJsonSerializer.parse<{ value: Date }>(serialized);
		expect(deserialized.value).toBeInstanceOf(Date);
		expect(deserialized.value.toISOString()).toBe("2024-01-15T12:00:00.000Z");
	});

	it("stringify and parse of RegExp", () => {
		const regex = /hello\s+world/gi;
		const serialized = superJsonSerializer.stringify({ value: regex });
		const deserialized = superJsonSerializer.parse<{ value: RegExp }>(serialized);
		expect(deserialized.value).toBeInstanceOf(RegExp);
		expect(deserialized.value.source).toBe(regex.source);
		expect(deserialized.value.flags).toBe(regex.flags);
	});

	it("stringify and parse of Map", () => {
		const map = new Map<string, number>([
			["a", 1],
			["b", 2],
		]);
		const serialized = superJsonSerializer.stringify({ value: map });
		const deserialized = superJsonSerializer.parse<{
			value: Map<string, number>;
		}>(serialized);
		expect(deserialized.value).toBeInstanceOf(Map);
		expect(deserialized.value.get("a")).toBe(1);
		expect(deserialized.value.get("b")).toBe(2);
		expect(deserialized.value.size).toBe(2);
	});

	it("stringify and parse of Set", () => {
		const set = new Set([1, 2, 3]);
		const serialized = superJsonSerializer.stringify({ value: set });
		const deserialized = superJsonSerializer.parse<{ value: Set<number> }>(serialized);
		expect(deserialized.value).toBeInstanceOf(Set);
		expect(deserialized.value.has(1)).toBe(true);
		expect(deserialized.value.has(2)).toBe(true);
		expect(deserialized.value.has(3)).toBe(true);
		expect(deserialized.value.size).toBe(3);
	});

	it("stringify and parse of BigInt", () => {
		const serialized = superJsonSerializer.stringify({
			value: BigInt("9223372036854775807"),
		});
		const deserialized = superJsonSerializer.parse<{ value: bigint }>(serialized);
		expect(deserialized.value).toBe(BigInt("9223372036854775807"));
	});

	it("stringify and parse of negative BigInt", () => {
		const serialized = superJsonSerializer.stringify({
			value: BigInt("-123456789"),
		});
		const deserialized = superJsonSerializer.parse<{ value: bigint }>(serialized);
		expect(deserialized.value).toBe(BigInt("-123456789"));
	});

	it("stringify and parse of Error", () => {
		const error = new Error("something went wrong");
		const serialized = superJsonSerializer.stringify({ value: error });
		const deserialized = superJsonSerializer.parse<{ value: Error }>(serialized);
		expect(deserialized.value).toBeInstanceOf(Error);
		expect(deserialized.value.message).toBe("something went wrong");
	});

	it("stringify and parse of nested mixed types", () => {
		const original = {
			date: new Date("2024-06-01"),
			numbers: new Set([1, 2, 3]),
			mapping: new Map([["key", "value"]]),
			big: BigInt(42),
			pattern: /test/i,
			nested: {
				innerDate: new Date("2025-01-01"),
			},
		};
		const serialized = superJsonSerializer.stringify(original);
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const deserialized = superJsonSerializer.parse<any>(serialized);
		expect(deserialized.date).toBeInstanceOf(Date);
		expect(deserialized.numbers).toBeInstanceOf(Set);
		expect(deserialized.mapping).toBeInstanceOf(Map);
		expect(deserialized.big).toBe(BigInt(42));
		expect(deserialized.pattern).toBeInstanceOf(RegExp);
		expect(deserialized.nested.innerDate).toBeInstanceOf(Date);
	});
});

describe("Integration with Storely", () => {
	it("should work as a Storely serializer for Date values", async () => {
		const storely = new Storely({ serialization: superJsonSerializer });
		const date = new Date("2024-01-15T12:00:00.000Z");
		await storely.set("key", date);
		const value = await storely.get<Date>("key");
		expect(value).toBeInstanceOf(Date);
		expect(value?.toISOString()).toBe("2024-01-15T12:00:00.000Z");
	});

	it("should work as a Storely serializer for Map values", async () => {
		const storely = new Storely({ serialization: superJsonSerializer });
		const map = new Map([
			["a", 1],
			["b", 2],
		]);
		await storely.set("key", map);
		const value = await storely.get<Map<string, number>>("key");
		expect(value).toBeInstanceOf(Map);
		expect(value?.get("a")).toBe(1);
	});

	it("should work as a Storely serializer for Set values", async () => {
		const storely = new Storely({ serialization: superJsonSerializer });
		const set = new Set([1, 2, 3]);
		await storely.set("key", set);
		const value = await storely.get<Set<number>>("key");
		expect(value).toBeInstanceOf(Set);
		expect(value?.size).toBe(3);
	});

	it("should work with TTL", async () => {
		const storely = new Storely({ serialization: superJsonSerializer });
		await storely.set("key", "value", 10_000);
		const value = await storely.get("key");
		expect(value).toBe("value");
	});
});
