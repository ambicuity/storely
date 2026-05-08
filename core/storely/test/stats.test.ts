import { describe, expect, it } from "vitest";
import { Storely } from "../src/index.js";
import { StorelyStats } from "../src/stats.js";

it("will initialize at zero, increment counters, and handle errors", async () => {
	const stats = new StorelyStats({ enabled: true });
	expect(stats.hits).toBe(0);
	expect(stats.misses).toBe(0);
	expect(stats.sets).toBe(0);
	expect(stats.deletes).toBe(0);
	expect(stats.errors).toBe(0);

	const storely = new Storely({ stats: true });
	await storely.set("key1", "value1");
	expect(storely.stats.sets).toBe(1);
	await storely.get("key1");
	expect(storely.stats.hits).toBe(1);
	await storely.get("missing");
	expect(storely.stats.misses).toBe(1);
	await storely.delete("key1");
	expect(storely.stats.deletes).toBe(1);
});

it("will increment error counter on store error", async () => {
	// biome-ignore lint/suspicious/noExplicitAny: testing with Map as store
	const errorStore = new Map() as any;
	const storely = new Storely({ store: errorStore, stats: true });
	storely.on("error", () => {});
	errorStore.get = () => {
		throw new Error("store error");
	};
	await storely.get("badkey");
	expect(storely.stats.errors).toBe(1);
});

it("will not increment counters when disabled, and reset works", async () => {
	const storely = new Storely({ stats: false });
	await storely.set("key1", "value1");
	await storely.get("key1");
	expect(storely.stats.sets).toBe(0);
	expect(storely.stats.hits).toBe(0);

	// Reset
	const storely2 = new Storely({ stats: true });
	await storely2.set("key1", "value1");
	await storely2.get("key1");
	await storely2.get("missing");
	await storely2.delete("key1");
	storely2.stats.reset();
	expect(storely2.stats.sets).toBe(0);
	expect(storely2.stats.hits).toBe(0);
	expect(storely2.stats.misses).toBe(0);
	expect(storely2.stats.deletes).toBe(0);
});

it("will default enabled to false and maxEntries to 1000", () => {
	const stats = new StorelyStats();
	expect(stats.enabled).toBe(false);
	expect(stats.maxEntries).toBe(1000);
});

it("will unsubscribe when enabled is set to false and re-subscribe on true", async () => {
	const storely = new Storely({ stats: true });
	await storely.set("key1", "value1");
	expect(storely.stats.sets).toBe(1);

	storely.stats.enabled = false;
	await storely.set("key2", "value2");
	expect(storely.stats.sets).toBe(1);

	storely.stats.enabled = true;
	await storely.set("key3", "value3");
	expect(storely.stats.sets).toBe(2);
});

describe("LRU key frequency maps", () => {
	it("should accept options and enforce maxEntries", () => {
		const stats = new StorelyStats({ enabled: true, maxEntries: 500 });
		expect(stats.maxEntries).toBe(500);

		// Default maxEntries eviction
		const stats2 = new StorelyStats({ enabled: true });
		for (let i = 0; i < 1001; i++) {
			stats2.incrementKeys(stats2.hitKeys, `key${i}`);
		}
		expect(stats2.hitKeys.size).toBe(1000);
	});

	it("should track keys, evict LRU, and preserve recently accessed", () => {
		const stats = new StorelyStats();
		stats.incrementKeys(stats.hitKeys, "user:123");
		stats.incrementKeys(stats.hitKeys, "user:123");
		stats.incrementKeys(stats.hitKeys, "user:456");
		expect(stats.hitKeys.get("user:123")).toBe(2);
		expect(stats.hitKeys.get("user:456")).toBe(1);

		// LRU eviction
		const stats2 = new StorelyStats({ maxEntries: 3 });
		stats2.incrementKeys(stats2.hitKeys, "a");
		stats2.incrementKeys(stats2.hitKeys, "b");
		stats2.incrementKeys(stats2.hitKeys, "c");
		stats2.incrementKeys(stats2.hitKeys, "d");
		expect(stats2.hitKeys.has("a")).toBe(false);
		expect(stats2.hitKeys.has("d")).toBe(true);
		expect(stats2.hitKeys.size).toBe(3);

		// Preserve recently accessed
		const stats3 = new StorelyStats({ maxEntries: 3 });
		stats3.incrementKeys(stats3.hitKeys, "a");
		stats3.incrementKeys(stats3.hitKeys, "b");
		stats3.incrementKeys(stats3.hitKeys, "c");
		stats3.incrementKeys(stats3.hitKeys, "a"); // re-access
		stats3.incrementKeys(stats3.hitKeys, "d");
		expect(stats3.hitKeys.has("a")).toBe(true);
		expect(stats3.hitKeys.get("a")).toBe(2);
		expect(stats3.hitKeys.has("b")).toBe(false);
	});

	it("should track each event type independently", () => {
		const stats = new StorelyStats();
		stats.incrementKeys(stats.hitKeys, "key1");
		stats.incrementKeys(stats.missKeys, "key1");
		stats.incrementKeys(stats.missKeys, "key1");
		stats.incrementKeys(stats.setKeys, "key2");
		stats.incrementKeys(stats.deleteKeys, "key3");
		stats.incrementKeys(stats.errorKeys, "key4");
		expect(stats.hitKeys.get("key1")).toBe(1);
		expect(stats.missKeys.get("key1")).toBe(2);
		expect(stats.setKeys.get("key2")).toBe(1);
		expect(stats.deleteKeys.get("key3")).toBe(1);
		expect(stats.errorKeys.get("key4")).toBe(1);
	});

	it("should build composite key with and without namespace", () => {
		const stats = new StorelyStats();
		expect(
			stats.buildKeyEventName({
				event: "hit",
				key: "user:123",
				namespace: "cache",
				timestamp: Date.now(),
			}),
		).toBe("cache:user:123");
		expect(stats.buildKeyEventName({ event: "hit", key: "user:123", timestamp: Date.now() })).toBe(
			"user:123",
		);
		expect(stats.buildKeyEventName({ event: "error", timestamp: Date.now() })).toBe("");
	});

	it("should not track empty keys or when maxEntries is 0", () => {
		const stats = new StorelyStats();
		stats.incrementKeys(stats.errorKeys, "");
		expect(stats.errorKeys.size).toBe(0);

		const stats2 = new StorelyStats({ maxEntries: 0 });
		stats2.incrementKeys(stats2.hitKeys, "key1");
		expect(stats2.hitKeys.size).toBe(0);
	});

	it("should clear all LRU maps on reset", () => {
		const stats = new StorelyStats();
		stats.incrementKeys(stats.hitKeys, "a");
		stats.incrementKeys(stats.missKeys, "b");
		stats.incrementKeys(stats.setKeys, "c");
		stats.incrementKeys(stats.deleteKeys, "d");
		stats.incrementKeys(stats.errorKeys, "e");
		stats.reset();
		expect(stats.hitKeys.size).toBe(0);
		expect(stats.missKeys.size).toBe(0);
	});

	it("should populate LRU maps via subscribe with namespace", async () => {
		const storely = new Storely({ stats: true, namespace: "myns" });
		await storely.set("foo", "bar");
		await storely.get("foo");
		await storely.get("missing");
		await storely.delete("foo");
		expect(storely.stats.setKeys.get("myns:foo")).toBe(1);
		expect(storely.stats.hitKeys.get("myns:foo")).toBe(1);
		expect(storely.stats.missKeys.get("myns:missing")).toBe(1);
		expect(storely.stats.deleteKeys.get("myns:foo")).toBe(1);
	});

	it("should track error keys via subscribe", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing with Map as store
		const errorStore = new Map() as any;
		const storely = new Storely({ store: errorStore, stats: true });
		storely.on("error", () => {});
		errorStore.get = () => {
			throw new Error("store error");
		};
		await storely.get("badkey");
		expect(storely.stats.errorKeys.get("badkey")).toBe(1);
	});
});

describe("unsubscribe", () => {
	it("should stop tracking and be safe to call multiple times", async () => {
		const storely = new Storely({ stats: true });
		await storely.set("key1", "value1");
		storely.stats.unsubscribe();
		await storely.set("key2", "value2");
		expect(storely.stats.sets).toBe(1);
		expect(storely.stats.setKeys.has("key2")).toBe(false);

		// Safe without subscribe and multiple times
		expect(() => new StorelyStats().unsubscribe()).not.toThrow();
		storely.stats.unsubscribe();
		expect(storely.stats.sets).toBe(1);
	});
});
