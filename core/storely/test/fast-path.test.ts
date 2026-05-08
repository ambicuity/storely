import { describe, expect, test, vi } from "vitest";
import { StorelyJsonSerializer } from "../src/json-serializer.js";
import { Storely } from "../src/storely.js";
import { StorelyHooks } from "../src/types/storely.js";

describe("fast path correctness", () => {
	test("memory + no serialization: get/set/has/delete round-trip", async () => {
		const s = new Storely({ store: new Map() });
		expect(await s.set("k", { a: 1 })).toBe(true);
		expect(await s.get("k")).toEqual({ a: 1 });
		expect(await s.has("k")).toBe(true);
		expect(await s.delete("k")).toBe(true);
		expect(await s.get("k")).toBeUndefined();
		expect(await s.has("k")).toBe(false);
	});

	test("hooks attached at runtime are still respected", async () => {
		const s = new Storely({ store: new Map() });
		const calls: string[] = [];
		s.onHook(StorelyHooks.BEFORE_SET, () => {
			calls.push("beforeSet");
		});
		await s.set("k", "v");
		expect(calls).toEqual(["beforeSet"]);
	});

	test("explicit serialization disables the fast path", async () => {
		const s = new Storely({ store: new Map(), serialization: new StorelyJsonSerializer() });
		expect(await s.set("k", "v")).toBe(true);
		expect(await s.get("k")).toBe("v");
	});

	test("ttl still works on the fast path", async () => {
		const s = new Storely({ store: new Map() });
		await s.set("k", "v", 1);
		await new Promise((r) => setTimeout(r, 10));
		expect(await s.get("k")).toBeUndefined();
	});

	test("symbol value is rejected on the fast path", async () => {
		const s = new Storely({ store: new Map() });
		const errorHandler = vi.fn();
		s.on("error", errorHandler);
		expect(await s.set("k", Symbol("x") as unknown as string)).toBe(false);
		expect(errorHandler).toHaveBeenCalledWith("symbol cannot be serialized");
	});

	test("fast path is taken: get does not touch hookWithDeprecated when no listeners", async () => {
		const s = new Storely({ store: new Map() });
		// biome-ignore lint/suspicious/noExplicitAny: spying on private method
		const hookSpy = vi.spyOn(s as any, "hook");
		await s.set("k", "v");
		await s.get("k");
		await s.has("k");
		await s.delete("k");
		expect(hookSpy).not.toHaveBeenCalled();
	});

	test("fast path respects deprecated PRE_HAS / POST_HAS aliases", async () => {
		const s = new Storely({ store: new Map() });
		const calls: string[] = [];
		s.onHook(StorelyHooks.PRE_HAS, () => {
			calls.push("preHas");
		});
		s.onHook(StorelyHooks.POST_HAS, () => {
			calls.push("postHas");
		});
		await s.has("missing");
		expect(calls).toContain("preHas");
		expect(calls).toContain("postHas");
	});
});
