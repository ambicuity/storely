import { describe, expect, it, vi } from "vitest";
import type { StorelyTelemetryEvent } from "../src/index.js";
import { Storely, StorelyEvents, StorelyMemoryAdapter } from "../src/index.js";

describe("Storely Telemetry Events", () => {
	it("should emit stat:set on set()", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_SET, listener);

		await storely.set("key1", "value1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(payload.event).toBe("set");
		expect(payload.key).toBe("key1");
		expect(payload.timestamp).toBeTypeOf("number");
	});

	it("should emit stat:hit on get() cache hit", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_HIT, listener);

		await storely.set("key1", "value1");
		await storely.get("key1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(payload.event).toBe("hit");
		expect(payload.key).toBe("key1");
	});

	it("should emit stat:miss on get() cache miss", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_MISS, listener);

		await storely.get("nonexistent");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(payload.event).toBe("miss");
		expect(payload.key).toBe("nonexistent");
	});

	it("should emit stat:miss on get() when data is expired", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_MISS, listener);

		await storely.set("key1", "value1", 1);
		await new Promise((resolve) => {
			setTimeout(resolve, 50);
		});
		await storely.get("key1");

		expect(listener).toHaveBeenCalled();
		const calls = listener.mock.calls.filter(
			(call: StorelyTelemetryEvent[]) => call[0].key === "key1",
		);
		expect(calls.length).toBeGreaterThanOrEqual(1);
	});

	it("should emit stat:delete on delete()", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_DELETE, listener);

		await storely.set("key1", "value1");
		await storely.delete("key1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(payload.event).toBe("delete");
		expect(payload.key).toBe("key1");
	});

	it("should emit per-key hit/miss on getMany()", async () => {
		const storely = new Storely({ stats: true });
		const hitListener = vi.fn();
		const missListener = vi.fn();
		storely.on(StorelyEvents.STAT_HIT, hitListener);
		storely.on(StorelyEvents.STAT_MISS, missListener);

		await storely.set("key1", "value1");
		await storely.set("key2", "value2");
		// key3 does not exist
		await storely.get(["key1", "key2", "key3"]);

		expect(hitListener).toHaveBeenCalledTimes(2);
		expect(missListener).toHaveBeenCalledTimes(1);

		const hitKeys = hitListener.mock.calls.map((call: StorelyTelemetryEvent[]) => call[0].key);
		expect(hitKeys).toContain("key1");
		expect(hitKeys).toContain("key2");

		const missPayload = missListener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(missPayload.key).toBe("key3");
	});

	it("should emit stat:hit on getRaw() cache hit", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_HIT, listener);

		await storely.set("key1", "value1");
		await storely.getRaw("key1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(payload.event).toBe("hit");
		expect(payload.key).toBe("key1");
	});

	it("should emit stat:miss on getRaw() cache miss", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_MISS, listener);

		await storely.getRaw("nonexistent");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(payload.event).toBe("miss");
		expect(payload.key).toBe("nonexistent");
	});

	it("should emit per-key hit/miss on getManyRaw()", async () => {
		const storely = new Storely({ stats: true });
		const hitListener = vi.fn();
		const missListener = vi.fn();
		storely.on(StorelyEvents.STAT_HIT, hitListener);
		storely.on(StorelyEvents.STAT_MISS, missListener);

		await storely.set("key1", "value1");
		await storely.getManyRaw(["key1", "missing"]);

		expect(hitListener).toHaveBeenCalledOnce();
		expect(missListener).toHaveBeenCalledOnce();
		expect((hitListener.mock.calls[0][0] as StorelyTelemetryEvent).key).toBe("key1");
		expect((missListener.mock.calls[0][0] as StorelyTelemetryEvent).key).toBe("missing");
	});

	it("should emit stat:set on setRaw()", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_SET, listener);

		await storely.setRaw("key1", { value: "value1" });

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(payload.event).toBe("set");
		expect(payload.key).toBe("key1");
	});

	it("should emit stat:error on store error", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing with Map as store
		const errorStore = new Map() as any;
		const storely = new Storely({ store: errorStore, stats: true });
		storely.on("error", () => {}); // suppress unhandled error

		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_ERROR, listener);

		// Force an error by making store.get throw
		errorStore.get = () => {
			throw new Error("store error");
		};

		await storely.get("key1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(payload.event).toBe("error");
		expect(payload.key).toBe("key1");
	});

	it("should include namespace in telemetry payload", async () => {
		const storely = new Storely({ namespace: "test-ns", stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_SET, listener);

		await storely.set("key1", "value1");

		const payload = listener.mock.calls[0][0] as StorelyTelemetryEvent;
		expect(payload.namespace).toBe("test-ns");
	});

	it("should have correct payload shape for all events", async () => {
		const storely = new Storely({ namespace: "shape-test", stats: true });
		const events: StorelyTelemetryEvent[] = [];

		storely.on(StorelyEvents.STAT_SET, (e: StorelyTelemetryEvent) => events.push(e));
		storely.on(StorelyEvents.STAT_HIT, (e: StorelyTelemetryEvent) => events.push(e));
		storely.on(StorelyEvents.STAT_MISS, (e: StorelyTelemetryEvent) => events.push(e));
		storely.on(StorelyEvents.STAT_DELETE, (e: StorelyTelemetryEvent) => events.push(e));

		await storely.set("key1", "value1");
		await storely.get("key1");
		await storely.get("nonexistent");
		await storely.delete("key1");

		expect(events.length).toBe(4);
		for (const event of events) {
			expect(event.event).toBeTypeOf("string");
			expect(event.key).toBeTypeOf("string");
			expect(event.namespace).toBe("shape-test");
			expect(event.timestamp).toBeTypeOf("number");
			expect(event.timestamp).toBeGreaterThan(0);
		}
	});

	it("should emit telemetry events even when stats are disabled", async () => {
		const storely = new Storely({ stats: false });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_SET, listener);

		await storely.set("key1", "value1");

		expect(listener).toHaveBeenCalledOnce();
	});

	it("should track correct per-key stats with getMany (bug fix validation)", async () => {
		const storely = new Storely({ stats: true });

		await storely.set("a", 1);
		await storely.set("b", 2);
		await storely.set("c", 3);

		storely.stats.reset();
		await storely.get(["a", "b", "c"]);

		expect(storely.stats.hits).toBe(3);
		expect(storely.stats.misses).toBe(0);
	});

	it("should track per-key misses with getMany", async () => {
		const storely = new Storely({ stats: true });

		await storely.set("a", 1);
		storely.stats.reset();

		await storely.get(["a", "missing1", "missing2"]);

		expect(storely.stats.hits).toBe(1);
		expect(storely.stats.misses).toBe(2);
	});

	it("should emit per-key stat:set on setMany()", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_SET, listener);

		await storely.setMany([
			{ key: "a", value: 1 },
			{ key: "b", value: 2 },
			{ key: "c", value: 3 },
		]);

		expect(listener).toHaveBeenCalledTimes(3);
		const keys = listener.mock.calls.map((call: StorelyTelemetryEvent[]) => call[0].key);
		expect(keys).toContain("a");
		expect(keys).toContain("b");
		expect(keys).toContain("c");
	});

	it("should emit per-key stat:error on setMany() failure", async () => {
		const errorStore = new StorelyMemoryAdapter(new Map());
		errorStore.setMany = () => {
			throw new Error("store error");
		};
		const storely = new Storely({ store: errorStore, stats: true });
		storely.on("error", () => {}); // suppress unhandled error

		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_ERROR, listener);

		await storely.setMany([
			{ key: "a", value: 1 },
			{ key: "b", value: 2 },
		]);

		expect(listener).toHaveBeenCalledTimes(2);
		for (const call of listener.mock.calls) {
			const payload = call[0] as StorelyTelemetryEvent;
			expect(payload.event).toBe("error");
			expect(payload.key).toBeTypeOf("string");
			expect(payload).not.toHaveProperty("keys");
		}
	});

	it("should emit per-key stat:delete on deleteMany()", async () => {
		const storely = new Storely({ stats: true });
		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_DELETE, listener);

		await storely.set("a", 1);
		await storely.set("b", 2);
		await storely.set("c", 3);
		await storely.delete(["a", "b", "c"]);

		expect(listener).toHaveBeenCalledTimes(3);
		const keys = listener.mock.calls.map((call: StorelyTelemetryEvent[]) => call[0].key);
		expect(keys).toContain("a");
		expect(keys).toContain("b");
		expect(keys).toContain("c");
	});

	it("should emit per-key stat:error on deleteMany() failure", async () => {
		const errorStore = new StorelyMemoryAdapter(new Map());
		errorStore.deleteMany = () => {
			throw new Error("store error");
		};
		const storely = new Storely({ store: errorStore, stats: true });
		storely.on("error", () => {}); // suppress unhandled error

		const listener = vi.fn();
		storely.on(StorelyEvents.STAT_ERROR, listener);

		await storely.delete(["x", "y"]);

		expect(listener).toHaveBeenCalledTimes(2);
		for (const call of listener.mock.calls) {
			const payload = call[0] as StorelyTelemetryEvent;
			expect(payload.event).toBe("error");
			expect(payload.key).toBeTypeOf("string");
			expect(payload).not.toHaveProperty("keys");
		}
	});

	it("should never include keys property in telemetry events", async () => {
		const storely = new Storely({ stats: true });
		const events: StorelyTelemetryEvent[] = [];

		storely.on(StorelyEvents.STAT_SET, (e: StorelyTelemetryEvent) => events.push(e));
		storely.on(StorelyEvents.STAT_HIT, (e: StorelyTelemetryEvent) => events.push(e));
		storely.on(StorelyEvents.STAT_MISS, (e: StorelyTelemetryEvent) => events.push(e));
		storely.on(StorelyEvents.STAT_DELETE, (e: StorelyTelemetryEvent) => events.push(e));

		await storely.set("a", 1);
		await storely.set("b", 2);
		await storely.get(["a", "b", "missing"]);
		await storely.setMany([
			{ key: "c", value: 3 },
			{ key: "d", value: 4 },
		]);
		await storely.delete(["a", "b"]);

		expect(events.length).toBeGreaterThan(0);
		for (const event of events) {
			expect(event).not.toHaveProperty("keys");
		}
	});
});
