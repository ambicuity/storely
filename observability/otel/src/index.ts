/**
 * OpenTelemetry instrumentation for Storely.
 *
 * `instrumentWithOtel(storely, { tracer, meter, namespace })` subscribes to
 * Storely's StorelyEvents stream and maps each event onto OTel counters and
 * histograms. It does NOT monkey-patch the Storely instance — it's a parallel
 * subscriber, matching the pattern of `StorelyStats.subscribe()` in core.
 *
 * Callers supply the OTel `tracer` and `meter`. We don't pull in
 * `@opentelemetry/api` as a hard runtime dep; instead the instance is duck-typed
 * to the public OTel interface, so any compatible implementation works.
 */

import type Storely from "@ambicuity/storely-core";
import { StorelyEvents } from "@ambicuity/storely-core";

/** Minimal OTel meter interface — duck-types to `@opentelemetry/api`'s `Meter`. */
export type OtelMeter = {
	createCounter(
		name: string,
		options?: { description?: string; unit?: string },
	): {
		add(value: number, attributes?: Record<string, string | number | boolean>): void;
	};
	createHistogram(
		name: string,
		options?: { description?: string; unit?: string },
	): {
		record(value: number, attributes?: Record<string, string | number | boolean>): void;
	};
};

/** Minimal OTel tracer interface — duck-types to `@opentelemetry/api`'s `Tracer`. */
export type OtelTracer = {
	startActiveSpan<T>(name: string, fn: (span: OtelSpan) => T | Promise<T>): T | Promise<T>;
};

/** Minimal OTel span interface. */
export type OtelSpan = {
	setAttribute(key: string, value: string | number | boolean): void;
	recordException(exception: Error): void;
	end(): void;
};

export type InstrumentOptions = {
	/** Meter for counters / histograms. Omit to disable metrics. */
	meter?: OtelMeter;
	/** Tracer for spans. Omit to disable tracing. */
	tracer?: OtelTracer;
	/** Optional namespace prefix for metric and span names. Defaults to `"storely"`. */
	namespace?: string;
};

/** Disposable returned by `instrumentWithOtel` for clean shutdown. */
export type Instrumentation = {
	/** Detach all listeners and clean up. */
	dispose(): void;
};

/**
 * Attach OpenTelemetry instrumentation to a Storely instance.
 *
 * @example
 * ```ts
 * import Storely from "@ambicuity/storely-core";
 * import { instrumentWithOtel } from "@ambicuity/otel";
 * import { trace, metrics } from "@opentelemetry/api";
 *
 * const storely = new Storely({ store });
 * const otel = instrumentWithOtel(storely, {
 *   meter: metrics.getMeter("myapp"),
 *   tracer: trace.getTracer("myapp"),
 * });
 *
 * // ... later ...
 * otel.dispose();
 * ```
 */
export function instrumentWithOtel(
	storely: Storely<unknown>,
	options: InstrumentOptions,
): Instrumentation {
	const prefix = options.namespace ?? "storely";
	const meter = options.meter;
	const tracer = options.tracer;

	const counters = meter
		? {
				hit: meter.createCounter(`${prefix}.cache.hits`, {
					description: "Cache hits",
				}),
				miss: meter.createCounter(`${prefix}.cache.misses`, {
					description: "Cache misses",
				}),
				set: meter.createCounter(`${prefix}.cache.sets`, {
					description: "Cache set operations",
				}),
				delete: meter.createCounter(`${prefix}.cache.deletes`, {
					description: "Cache delete operations",
				}),
				error: meter.createCounter(`${prefix}.cache.errors`, {
					description: "Cache operation errors",
				}),
			}
		: undefined;

	type StatEvent = { key?: string; namespace?: string };

	const onHit = (event: StatEvent) => {
		counters?.hit.add(1, { namespace: event.namespace ?? "" });
	};
	const onMiss = (event: StatEvent) => {
		counters?.miss.add(1, { namespace: event.namespace ?? "" });
	};
	const onSet = (event: StatEvent) => {
		counters?.set.add(1, { namespace: event.namespace ?? "" });
	};
	const onDelete = (event: StatEvent) => {
		counters?.delete.add(1, { namespace: event.namespace ?? "" });
	};
	const onError = (event: StatEvent) => {
		counters?.error.add(1, { namespace: event.namespace ?? "" });
	};

	// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.on signature
	(storely as any).on(StorelyEvents.STAT_HIT, onHit);
	// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.on signature
	(storely as any).on(StorelyEvents.STAT_MISS, onMiss);
	// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.on signature
	(storely as any).on(StorelyEvents.STAT_SET, onSet);
	// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.on signature
	(storely as any).on(StorelyEvents.STAT_DELETE, onDelete);
	// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.on signature
	(storely as any).on(StorelyEvents.STAT_ERROR, onError);

	// Tracer setup: span-wrap public operations using Storely's hook lifecycle.
	// Hook-based wrapping is non-monkey-patching: BEFORE_X starts a span,
	// AFTER_X ends it. We carry the span on a per-call WeakMap keyed by the
	// hook payload object.
	type TraceCtx = { span: OtelSpan; startedAt: number };
	const inflight = new WeakMap<object, TraceCtx>();
	let getHistogram: ReturnType<OtelMeter["createHistogram"]> | undefined;
	let setHistogram: ReturnType<OtelMeter["createHistogram"]> | undefined;

	if (meter) {
		getHistogram = meter.createHistogram(`${prefix}.cache.get.duration`, {
			description: "Duration of get operations",
			unit: "ms",
		});
		setHistogram = meter.createHistogram(`${prefix}.cache.set.duration`, {
			description: "Duration of set operations",
			unit: "ms",
		});
	}

	const tracedHooks: Array<{ before: string; after: string; spanName: string }> = [
		{ before: "before:get", after: "after:get", spanName: `${prefix}.get` },
		{ before: "before:set", after: "after:set", spanName: `${prefix}.set` },
		{ before: "before:delete", after: "after:delete", spanName: `${prefix}.delete` },
	];

	const hookHandlers: Array<{ event: string; handler: (data: object) => void }> = [];

	for (const { before, after, spanName } of tracedHooks) {
		const beforeHandler = (data: object) => {
			if (!tracer) return;
			const startedAt = Date.now();
			tracer.startActiveSpan(spanName, (span) => {
				inflight.set(data, { span, startedAt });
				return undefined;
			});
		};
		const afterHandler = (data: object) => {
			const ctx = inflight.get(data);
			if (ctx) {
				ctx.span.end();
				inflight.delete(data);
				const duration = Date.now() - ctx.startedAt;
				if (spanName.endsWith(".get")) {
					getHistogram?.record(duration);
				} else if (spanName.endsWith(".set")) {
					setHistogram?.record(duration);
				}
			}
		};
		// biome-ignore lint/suspicious/noExplicitAny: hook signature
		(storely as any).hook(before, beforeHandler);
		// biome-ignore lint/suspicious/noExplicitAny: hook signature
		(storely as any).hook(after, afterHandler);
		hookHandlers.push({ event: before, handler: beforeHandler });
		hookHandlers.push({ event: after, handler: afterHandler });
	}

	return {
		dispose() {
			// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.off signature
			(storely as any).off(StorelyEvents.STAT_HIT, onHit);
			// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.off signature
			(storely as any).off(StorelyEvents.STAT_MISS, onMiss);
			// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.off signature
			(storely as any).off(StorelyEvents.STAT_SET, onSet);
			// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.off signature
			(storely as any).off(StorelyEvents.STAT_DELETE, onDelete);
			// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.off signature
			(storely as any).off(StorelyEvents.STAT_ERROR, onError);
			for (const { event, handler } of hookHandlers) {
				// biome-ignore lint/suspicious/noExplicitAny: matches Hookified.removeHook signature
				(storely as any).removeHook?.(event, handler);
			}
		},
	};
}
