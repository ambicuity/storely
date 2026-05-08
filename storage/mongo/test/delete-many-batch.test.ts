import { afterAll, beforeAll, describe, expect, test } from "vitest";
import StorelyMongo from "../src/index.js";

const url = process.env.MONGO_URL || "mongodb://localhost:27017";

describe("mongo deleteMany batched", () => {
	let s: StorelyMongo;
	beforeAll(async () => {
		s = new StorelyMongo({ uri: url, db: "storely_test", collection: "dm_test" });
		await s.connect;
	});
	afterAll(async () => {
		await s.clear();
		await s.disconnect();
	});

	test("returns true for existing keys, false for missing keys, in input order", async () => {
		await s.clear();
		await s.set("a", "1");
		await s.set("c", "3");
		const result = await s.deleteMany(["a", "b", "c", "d"]);
		expect(result).toEqual([true, false, true, false]);
		expect(await s.get("a")).toBeUndefined();
	});

	test("handles 2500 keys", async () => {
		await s.clear();
		const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
		for (const k of keys) await s.set(k, "v");
		const result = await s.deleteMany(keys);
		expect(result.length).toBe(2500);
		expect(result.every((r) => r === true)).toBe(true);
	});

	test("empty input returns empty array", async () => {
		expect(await s.deleteMany([])).toEqual([]);
	});
});
