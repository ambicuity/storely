// @vitest-environment happy-dom
// biome-ignore-all lint/suspicious/noExplicitAny: test file accessing globals dynamically
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type Storely from "../src/index.js";

// Strip Buffer to verify the btoa/atob fallback path in the serializer.
// We keep process because hookified (and vitest internals) reference it;
// in a real browser, bundlers shim or strip process references.
const originalBuffer = globalThis.Buffer;

beforeAll(() => {
	delete (globalThis as any).Buffer;

	return () => {
		(globalThis as any).Buffer = originalBuffer;
	};
});

describe("browser runtime - import", () => {
	test("can import Storely", async () => {
		const { default: Storely } = await import("../src/index.js");
		expect(Storely).toBeDefined();
	});

	test("can import StorelyMemoryAdapter and createStorely", async () => {
		const { StorelyMemoryAdapter, createStorely } = await import("../src/adapters/memory.js");
		expect(StorelyMemoryAdapter).toBeDefined();
		expect(createStorely).toBeDefined();
	});
});

describe("browser runtime - core operations", () => {
	let storely: Storely;

	beforeEach(async () => {
		const { default: Storely } = await import("../src/index.js");
		storely = new Storely();
	});

	test("set and get", async () => {
		await storely.set("foo", "bar");
		expect(await storely.get("foo")).toBe("bar");
	});

	test("delete", async () => {
		await storely.set("foo", "bar");
		expect(await storely.delete("foo")).toBe(true);
		expect(await storely.get("foo")).toBeUndefined();
	});

	test("clear", async () => {
		await storely.set("a", 1);
		await storely.set("b", 2);
		await storely.clear();
		expect(await storely.get("a")).toBeUndefined();
		expect(await storely.get("b")).toBeUndefined();
	});

	test("has", async () => {
		await storely.set("exists", "yes");
		expect(await storely.has("exists")).toBe(true);
		expect(await storely.has("missing")).toBe(false);
	});

	test("getMany", async () => {
		await storely.set("a", 1);
		await storely.set("b", 2);
		const values = await storely.get(["a", "b", "c"]);
		expect(values).toEqual([1, 2, undefined]);
	});

	test("TTL expiration", async () => {
		vi.useFakeTimers();
		await storely.set("temp", "value", 10);
		vi.advanceTimersByTime(20);
		expect(await storely.get("temp")).toBeUndefined();
		vi.useRealTimers();
	});
});

describe("browser runtime - serializer without Buffer", () => {
	test("Buffer is not available", () => {
		expect((globalThis as any).Buffer).toBeUndefined();
	});

	test("serializer handles strings", async () => {
		const { default: Storely } = await import("../src/index.js");
		const storely = new Storely();
		await storely.set("str", "hello world");
		expect(await storely.get("str")).toBe("hello world");
	});

	test("serializer handles objects", async () => {
		const { default: Storely } = await import("../src/index.js");
		const storely = new Storely();
		const obj = { name: "test", nested: { value: 42 } };
		await storely.set("obj", obj);
		expect(await storely.get("obj")).toEqual(obj);
	});

	test("serializer handles Uint8Array via btoa/atob fallback", async () => {
		const { jsonSerializer } = await import("../src/index.js");
		const data = new Uint8Array([72, 101, 108, 108, 111]);
		const serialized = jsonSerializer.stringify(data);
		const deserialized = jsonSerializer.parse<Uint8Array>(serialized);
		expect(deserialized).toBeInstanceOf(Uint8Array);
		expect(Array.from(deserialized)).toEqual([72, 101, 108, 108, 111]);
	});

	test("serializer handles BigInt", async () => {
		const { jsonSerializer } = await import("../src/index.js");
		const big = BigInt("9007199254740993");
		const serialized = jsonSerializer.stringify(big);
		const deserialized = jsonSerializer.parse<bigint>(serialized);
		expect(deserialized).toBe(big);
	});
});
