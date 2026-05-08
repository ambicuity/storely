import { describe, expect, test } from "vitest";
import StorelySqlite from "../src/index.js";

describe("sqlite deleteMany batched", () => {
	test("returns true for existing keys, false for missing keys, in input order", async () => {
		const s = new StorelySqlite({ uri: "sqlite://:memory:" });
		await s.set("a", "1");
		await s.set("c", "3");
		const result = await s.deleteMany(["a", "b", "c", "d"]);
		expect(result).toEqual([true, false, true, false]);
		expect(await s.get("a")).toBeUndefined();
		expect(await s.get("c")).toBeUndefined();
		await s.disconnect();
	});

	test("handles batches larger than the 998-param chunk size", async () => {
		const s = new StorelySqlite({ uri: "sqlite://:memory:" });
		const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
		for (const k of keys) await s.set(k, "v");
		const result = await s.deleteMany(keys);
		expect(result.length).toBe(2500);
		expect(result.every((r) => r === true)).toBe(true);
		await s.disconnect();
	});

	test("empty input returns empty array", async () => {
		const s = new StorelySqlite({ uri: "sqlite://:memory:" });
		expect(await s.deleteMany([])).toEqual([]);
		await s.disconnect();
	});
});
