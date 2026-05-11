import { afterAll, beforeAll, describe, expect, test } from "vitest";
import StorelyPostgres from "../src/index.js";

const url =
	process.env.POSTGRES_URL ?? "postgresql://postgres:postgres@localhost:5432/storely_test";

describe("postgres deleteMany batched", () => {
	let s: StorelyPostgres;
	beforeAll(async () => {
		s = new StorelyPostgres({ uri: url, table: "storely_dm_test" });
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

	test("handles 2500 keys", { timeout: 30_000 }, async () => {
		await s.clear();
		const entries = Array.from({ length: 2500 }, (_, i) => ({ key: `k${i}`, value: "v" }));
		await s.setMany(entries);
		const result = await s.deleteMany(entries.map((e) => e.key));
		expect(result.length).toBe(2500);
		expect(result.every((r) => r === true)).toBe(true);
	});

	test("empty input returns empty array", async () => {
		expect(await s.deleteMany([])).toEqual([]);
	});
});
