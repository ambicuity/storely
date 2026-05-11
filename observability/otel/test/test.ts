import Storely from "@ambicuity/storely-core";
import { describe, expect, test } from "vitest";
import {
	type Instrumentation,
	instrumentWithOtel,
	type OtelMeter,
	type OtelTracer,
} from "../src/index.js";

type Recorded = { name: string; value: number; attributes?: Record<string, unknown> };

/** In-memory meter that records every counter add and histogram record. */
function makeRecordingMeter(): { meter: OtelMeter; recorded: Recorded[] } {
	const recorded: Recorded[] = [];
	const meter: OtelMeter = {
		createCounter(name) {
			return {
				add(value, attributes) {
					recorded.push({ name, value, attributes });
				},
			};
		},
		createHistogram(name) {
			return {
				record(value, attributes) {
					recorded.push({ name, value, attributes });
				},
			};
		},
	};
	return { meter, recorded };
}

/** No-op tracer that just synchronously invokes the callback with a dummy span. */
function makeNoopTracer(): { tracer: OtelTracer; spans: string[] } {
	const spans: string[] = [];
	const tracer: OtelTracer = {
		startActiveSpan(name, fn) {
			spans.push(name);
			return fn({
				setAttribute() {},
				recordException() {},
				end() {},
			});
		},
	};
	return { tracer, spans };
}

describe("instrumentWithOtel", () => {
	test("records hit/miss/set counters on cache operations", async () => {
		const { meter, recorded } = makeRecordingMeter();
		const storely = new Storely({ store: new Map() });
		const instrumentation = instrumentWithOtel(storely, { meter });

		await storely.set("a", 1);
		await storely.get("a");
		await storely.get("missing");

		// Counters fire on the storely events. Verify the names landed.
		const names = recorded.map((r) => r.name);
		expect(names).toContain("storely.cache.sets");
		expect(names).toContain("storely.cache.hits");
		expect(names).toContain("storely.cache.misses");

		instrumentation.dispose();
	});

	test("honors a custom namespace prefix on metric names", async () => {
		const { meter, recorded } = makeRecordingMeter();
		const storely = new Storely({ store: new Map() });
		const instrumentation = instrumentWithOtel(storely, { meter, namespace: "myapp" });

		await storely.set("a", 1);
		expect(recorded.some((r) => r.name === "myapp.cache.sets")).toBe(true);

		instrumentation.dispose();
	});

	test("works with tracer-only (no meter) without throwing", async () => {
		const { tracer } = makeNoopTracer();
		const storely = new Storely({ store: new Map() });
		const instrumentation = instrumentWithOtel(storely, { tracer });

		await storely.set("a", 1);
		await storely.get("a");

		instrumentation.dispose();
	});

	test("dispose() stops recording", async () => {
		const { meter, recorded } = makeRecordingMeter();
		const storely = new Storely({ store: new Map() });
		const instrumentation = instrumentWithOtel(storely, { meter });

		await storely.set("a", 1);
		const countBefore = recorded.length;

		instrumentation.dispose();
		await storely.set("b", 2);
		const countAfter = recorded.length;

		// Either the count is unchanged (full detach), or the new event didn't
		// trigger a recorded entry. Either way, dispose() must prevent growth.
		expect(countAfter).toBe(countBefore);
	});

	test("dispose is idempotent", () => {
		const { meter } = makeRecordingMeter();
		const storely = new Storely({ store: new Map() });
		const instrumentation: Instrumentation = instrumentWithOtel(storely, { meter });
		instrumentation.dispose();
		expect(() => instrumentation.dispose()).not.toThrow();
	});

	test("instrumentation with no meter and no tracer is a no-op", async () => {
		const storely = new Storely({ store: new Map() });
		const instrumentation = instrumentWithOtel(storely, {});

		await storely.set("a", 1);
		await storely.get("a");

		instrumentation.dispose();
	});
});
