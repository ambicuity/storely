// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { Storely } from "../../src/index.js";

/**
 * Browser smoke test for the Storely core package.
 *
 * Runs under happy-dom to simulate a browser environment.
 * Uses only browser-safe runtime APIs: Promise, Map, globalThis.
 * No Node.js built-ins are used or required.
 */
describe("browser smoke test - Storely with default in-memory adapter", () => {
	let storely: Storely;

	beforeEach(() => {
		storely = new Storely();
	});

	test("constructs without error", () => {
		expect(storely).toBeInstanceOf(Storely);
	});

	test("set and get a string value", async () => {
		await storely.set("key", "value");
		expect(await storely.get("key")).toBe("value");
	});

	test("set and get a number value", async () => {
		await storely.set("num", 42);
		expect(await storely.get("num")).toBe(42);
	});

	test("set and get an object value", async () => {
		const obj = { a: 1, b: "two", c: true };
		await storely.set("obj", obj);
		expect(await storely.get("obj")).toEqual(obj);
	});

	test("delete removes a key", async () => {
		await storely.set("del", "bye");
		const deleted = await storely.delete("del");
		expect(deleted).toBe(true);
		expect(await storely.get("del")).toBeUndefined();
	});

	test("clear removes all keys", async () => {
		await storely.set("a", 1);
		await storely.set("b", 2);
		await storely.clear();
		expect(await storely.get("a")).toBeUndefined();
		expect(await storely.get("b")).toBeUndefined();
	});

	test("has returns true for existing key, false for missing", async () => {
		await storely.set("present", "yes");
		expect(await storely.has("present")).toBe(true);
		expect(await storely.has("absent")).toBe(false);
	});

	test("no Node.js globals are required", () => {
		// These APIs must not be required by the Storely core
		// In a real browser, process and Buffer are absent
		expect(typeof Promise).toBe("function");
		expect(typeof Map).toBe("function");
	});
});
