# Storely Benchmark Supremacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `storely` the bolded fastest (or tied within 5%) on every cell of the competitive benchmark report against `keyv` and `cache-manager` — across every operation, backend, value size, and mode.

**Architecture:** Six independent pillars: (1) zero-cost hooks/telemetry/encode/decode when unused, (2) smart serialization defaults that match `keyv` (no serialization for in-memory), (3) one-query batched `deleteMany` on every SQL adapter, (4) MySQL value column migration to `MEDIUMBLOB`, (5) Redis path tuning that falls out of pillars 1+2, (6) Mongo bulk `deleteMany`. Pillars 1+2 are pre-requisites for pillars 5/6 to show up cleanly in benchmarks.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Biome, Benchmark.js. Storage drivers: `better-sqlite3`/`node:sqlite`/`bun:sqlite`, `pg`, `mysql2/promise`, `mongodb`, `@redis/client`.

**Spec:** `docs/superpowers/specs/2026-05-07-storely-benchmark-supremacy-design.md`

**Baseline benchmark report:** `benchmarks/results/merged-2026-05-08T00-28-17-160Z.{json,md}` — keep this file untouched as the comparison anchor.

---

## File Structure

**Modified:**
- `core/storely/src/storely.ts` — fast-path, lazy hooks/telemetry, smart serialization defaults
- `core/storely/src/json-serializer.ts` — bare-value encoding when no expires
- `core/storely/src/capabilities.ts` — add `inMemory` flag to capability detection
- `core/storely/src/types/adapters.ts` — extend capability type
- `storage/sqlite/src/index.ts` — batched `deleteMany`
- `storage/postgres/src/index.ts` — batched `deleteMany` (using RETURNING)
- `storage/mysql/src/index.ts` — batched `deleteMany` + `MEDIUMBLOB` migration
- `storage/mongo/src/index.ts` — bulk `deleteMany`

**Created:**
- `benchmarks/regression-check.ts` — CI gate that diffs latest results against baseline and exits non-zero on regression
- `core/storely/test/json-serializer-bare.test.ts` — wire-format tests for the bare-value encoding
- `core/storely/test/fast-path.test.ts` — verify the fast-path branch is taken and behaves correctly
- `storage/sqlite/test/delete-many-batch.test.ts` — batched `deleteMany` correctness
- `storage/postgres/test/delete-many-batch.test.ts` — same
- `storage/mysql/test/delete-many-batch.test.ts` — same
- `storage/mongo/test/delete-many-batch.test.ts` — same
- `storage/mysql/test/mediumblob-migration.test.ts` — schema migration

**Branching philosophy:** One feature branch per pillar; commit per task (≈one commit every 10–30 minutes); merge after the per-pillar benchmark gate passes.

---

# Pillar 1 — Core hot-path slimming

## Task 1: Lazy hookWithDeprecated

**Files:**
- Modify: `core/storely/src/storely.ts:1103-1113`
- Test: `core/storely/test/storely.test.ts` (existing — add cases)

**Why:** Every public op currently calls `await this.hook(event, ...)` in `hookWithDeprecated` regardless of whether any listeners exist. Skipping the await when no listeners are attached eliminates a microtask + Promise allocation per BEFORE_*/AFTER_* site (≈10 sites per request path).

- [ ] **Step 1: Open `core/storely/src/storely.ts` and locate `hookWithDeprecated` (currently lines 1103–1113):**

```ts
private async hookWithDeprecated(
    event: string,
    // biome-ignore lint/suspicious/noExplicitAny: hook data varies
    ...args: any[]
): Promise<void> {
    await this.hook(event, ...args);
    const deprecated = deprecatedHookAliases.get(event);
    if (deprecated && this.getHooks(deprecated)?.length) {
        await this.hook(deprecated, ...args);
    }
}
```

- [ ] **Step 2: Replace with the lazy version:**

```ts
private async hookWithDeprecated(
    event: string,
    // biome-ignore lint/suspicious/noExplicitAny: hook data varies
    ...args: any[]
): Promise<void> {
    const primaryCount = this.getHooks(event)?.length ?? 0;
    const alias = deprecatedHookAliases.get(event);
    const aliasCount = alias ? (this.getHooks(alias)?.length ?? 0) : 0;
    if (primaryCount === 0 && aliasCount === 0) return;
    if (primaryCount > 0) await this.hook(event, ...args);
    if (aliasCount > 0) await this.hook(alias as string, ...args);
}
```

- [ ] **Step 3: Add a regression test in `core/storely/test/storely.test.ts`. Append:**

```ts
test("hookWithDeprecated runs both new and deprecated hooks when both have listeners", async () => {
    const s = new Storely();
    const callOrder: string[] = [];
    s.onHook(StorelyHooks.BEFORE_GET, () => { callOrder.push("new"); });
    // The deprecated alias for BEFORE_GET (verify name in deprecatedHookAliases)
    s.onHook("preGet" as any, () => { callOrder.push("deprecated"); });
    await s.get("missing");
    expect(callOrder).toEqual(["new", "deprecated"]);
});

test("hookWithDeprecated skips entirely when no listeners are attached", async () => {
    const s = new Storely();
    // No listeners. Just exercise the path; we're asserting it doesn't throw and returns
    // a value identical to the slow path.
    await s.set("k", "v");
    expect(await s.get("k")).toBe("v");
});
```

- [ ] **Step 4: Run the storely tests:**

Run: `cd core/storely && pnpm test`
Expected: all green, including the two new tests.

- [ ] **Step 5: Commit:**

```bash
git add core/storely/src/storely.ts core/storely/test/storely.test.ts
git commit -m "storely - perf: skip hook awaits when no listeners are attached"
```

---

## Task 2: Lazy emitTelemetry

**Files:**
- Modify: `core/storely/src/storely.ts:1120-1139`
- Test: `core/storely/test/storely.test.ts`

**Why:** Telemetry emits a fully-allocated `StorelyTelemetryEvent` object per cache op even when nobody listens. We can short-circuit when stats are disabled and `listenerCount(event) === 0`.

- [ ] **Step 1: Locate the current `emitTelemetry` (lines 1120–1139):**

```ts
private emitTelemetry(event: StorelyEvents, key?: string | string[]): void {
    if (key === undefined) {
        this.emit(event, {
            event: event.replace("stat:", ""),
            namespace: this._namespace,
            timestamp: Date.now(),
        } as StorelyTelemetryEvent);
        return;
    }

    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
        this.emit(event, {
            event: event.replace("stat:", ""),
            key: k,
            namespace: this._namespace,
            timestamp: Date.now(),
        } as StorelyTelemetryEvent);
    }
}
```

- [ ] **Step 2: Replace with a fast-skip version:**

```ts
private emitTelemetry(event: StorelyEvents, key?: string | string[]): void {
    // Skip object allocation entirely when nobody is listening. Stats subscribes
    // when enabled, so listenerCount > 0 in that case.
    if (this.listenerCount(event) === 0) return;

    if (key === undefined) {
        this.emit(event, {
            event: event.replace("stat:", ""),
            namespace: this._namespace,
            timestamp: Date.now(),
        } as StorelyTelemetryEvent);
        return;
    }

    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
        this.emit(event, {
            event: event.replace("stat:", ""),
            key: k,
            namespace: this._namespace,
            timestamp: Date.now(),
        } as StorelyTelemetryEvent);
    }
}
```

- [ ] **Step 3: Add regression test in `core/storely/test/storely.test.ts`:**

```ts
test("emitTelemetry still fires events when stats are enabled", async () => {
    const s = new Storely({ stats: true });
    await s.set("k", "v");
    await s.get("k");
    await s.get("missing");
    expect(s.stats.hits).toBe(1);
    expect(s.stats.misses).toBe(1);
    expect(s.stats.sets).toBe(1);
});

test("emitTelemetry still fires events when an external listener is attached", async () => {
    const s = new Storely();
    let hits = 0;
    s.on(StorelyEvents.STAT_HIT, () => { hits++; });
    await s.set("k", "v");
    await s.get("k");
    expect(hits).toBe(1);
});
```

- [ ] **Step 4: Run tests:**

Run: `cd core/storely && pnpm test`
Expected: all green.

- [ ] **Step 5: Commit:**

```bash
git add core/storely/src/storely.ts core/storely/test/storely.test.ts
git commit -m "storely - perf: skip telemetry allocation when no listeners are attached"
```

---

## Task 3: Add `inMemory` capability flag

**Files:**
- Modify: `core/storely/src/capabilities.ts`
- Modify: `core/storely/src/types/adapters.ts` (the StorelyStorageCapability type definition)
- Test: `core/storely/test/capabilities.test.ts` (existing)

**Why:** Pillar 2.1 needs a way to detect "this store is in-memory" at construction time so the default serializer can be skipped. The capability detector already distinguishes `mapLike` (sync, in-memory) from `asyncMap` and `storelyStorage`, but the boolean isn't exposed as a first-class field.

- [ ] **Step 1: Open `core/storely/src/capabilities.ts` and locate the `StorelyStorageCapability` type around lines 61–65. Add an `inMemory: boolean` field. The type currently looks like:**

```ts
export type StorelyStorageCapability = {
    compatible: boolean;
    store: "mapLike" | "storelyStorage" | "asyncMap" | "none";
    methods: StorelyStorageMethods;
};
```

Change to:

```ts
export type StorelyStorageCapability = {
    compatible: boolean;
    store: "mapLike" | "storelyStorage" | "asyncMap" | "none";
    methods: StorelyStorageMethods;
    /**
     * True when the store is fully in-memory (synchronous Map-like or a
     * StorelyMemoryAdapter wrapping one). Used by Storely to skip default
     * serialization for in-memory stores, matching keyv's behavior.
     */
    inMemory: boolean;
};
```

- [ ] **Step 2: In the `detectStorelyStorage` function (around lines 221–269), set `inMemory` correctly. The function currently returns one of three shapes; for each return point, add `inMemory`:**

- For `store === "mapLike"`: `inMemory: true`
- For `store === "asyncMap"`: `inMemory: false`
- For `store === "storelyStorage"`: `inMemory: existing.capabilities?.inMemory ?? false` — propagate the inner adapter's flag if it exposes one; otherwise default to false.
- For `store === "none"`: `inMemory: false`

- [ ] **Step 3: In `core/storely/src/adapters/memory.ts`, the `StorelyMemoryAdapter` already computes `_capabilities` in its constructor (line 93: `this._capabilities = detectStorelyStorage(store)`). Override the `inMemory` flag in this adapter to always be `true` since the adapter wraps a Map-like store. After line 93 add:**

```ts
this._capabilities = { ...this._capabilities, inMemory: true };
```

- [ ] **Step 4: Add a test in `core/storely/test/capabilities.test.ts`:**

```ts
test("detectStorelyStorage marks a Map as inMemory", () => {
    const cap = detectStorelyStorage(new Map());
    expect(cap.inMemory).toBe(true);
});

test("detectStorelyStorage marks an asyncMap-shaped store as not inMemory", () => {
    const asyncStore = {
        async get() {}, async set() {}, async delete() { return true; }, async clear() {},
    };
    const cap = detectStorelyStorage(asyncStore);
    expect(cap.inMemory).toBe(false);
});

test("StorelyMemoryAdapter always reports inMemory: true", () => {
    const adapter = new StorelyMemoryAdapter(new Map());
    expect(adapter.capabilities.inMemory).toBe(true);
});
```

- [ ] **Step 5: Run tests:**

Run: `cd core/storely && pnpm test`
Expected: all green.

- [ ] **Step 6: Commit:**

```bash
git add core/storely/src/capabilities.ts core/storely/src/adapters/memory.ts core/storely/test/capabilities.test.ts
git commit -m "storely - feat: add inMemory capability flag for serialization defaults"
```

---

## Task 4: Smart serialization default — skip for in-memory stores

**Files:**
- Modify: `core/storely/src/storely.ts:103-129` (constructor) and `:1164-1170` (initSerialization)
- Test: `core/storely/test/storely.test.ts`

**Why:** With `serialization` set to `undefined` (default), Storely currently installs a `StorelyJsonSerializer` regardless of backend. For in-memory stores this serializes/parses 64KB of JSON per op when there's no need. `keyv`'s memory store doesn't serialize. Match it.

- [ ] **Step 1: In `core/storely/src/storely.ts`, the constructor body (lines 103–129) currently runs `initSerialization` (line 119) before `setStore` (line 124). The new check needs the store's capabilities, so we must reorder:**

```ts
constructor(
    store?: StorelyStorageAdapter | StorelyOptions,
    options?: Omit<StorelyOptions, "store">,
) {
    const mergedOptions = Storely.resolveOptions(store, options);

    super({
        throwOnHookError: false,
        throwOnEmptyListeners: true,
        throwOnEmitError: mergedOptions.throwOnErrors ?? false,
    });

    this.deprecatedHooks = buildDeprecatedHooks();
    this._compression = mergedOptions.compression;
    this._encryption = mergedOptions.encryption;
    this.initSanitize(mergedOptions);
    this.initNamespace(mergedOptions.namespace);

    if (mergedOptions.store) {
        this.setStore(mergedOptions.store);
    }

    // Must run after setStore so we can inspect _store.capabilities.inMemory
    this.initSerialization(mergedOptions);
    this.initStats(mergedOptions);

    this.setTtl(mergedOptions.ttl);
    this._checkExpired = mergedOptions.checkExpired ?? false;
}
```

- [ ] **Step 2: Update `initSerialization` (lines 1164–1170) to skip the default for in-memory stores:**

```ts
private initSerialization(options: StorelyOptions): void {
    if (options.serialization === false) {
        this._serialization = undefined;
        return;
    }
    if (options.serialization !== undefined) {
        this._serialization = options.serialization;
        return;
    }
    // No explicit option: default to JSON for non-memory stores; skip for memory stores.
    // Matches keyv's behavior — keyv's memory store does not serialize.
    if (this._store?.capabilities?.inMemory === true) {
        this._serialization = undefined;
        return;
    }
    this._serialization = new StorelyJsonSerializer();
}
```

- [ ] **Step 3: Add tests:**

```ts
test("Storely with default options + memory store skips serialization", () => {
    const s = new Storely({ store: new Map() });
    expect(s.serialization).toBeUndefined();
});

test("Storely with default options + asyncMap store still defaults to JSON serializer", () => {
    const asyncStore = {
        async get() {}, async set() {}, async delete() { return true; }, async clear() {},
    };
    const s = new Storely({ store: asyncStore });
    expect(s.serialization).toBeInstanceOf(StorelyJsonSerializer);
});

test("Storely with explicit serialization respects it for memory stores", () => {
    const s = new Storely({ store: new Map(), serialization: new StorelyJsonSerializer() });
    expect(s.serialization).toBeInstanceOf(StorelyJsonSerializer);
});

test("Storely with serialization: false still disables serialization", () => {
    const s = new Storely({ store: new Map(), serialization: false });
    expect(s.serialization).toBeUndefined();
});

test("memory + default: round-trips a 64KB string without serialization corruption", async () => {
    const s = new Storely({ store: new Map() });
    const big = "x".repeat(64 * 1024);
    await s.set("k", big);
    expect(await s.get("k")).toBe(big);
});
```

- [ ] **Step 4: Run tests:**

Run: `cd core/storely && pnpm test`
Expected: all green. Some pre-existing tests may have implicitly relied on the JSON serializer being on; if any break with `serialization: undefined` for memory, they were testing serializer behavior and need to be updated to instantiate Storely with an explicit serializer.

- [ ] **Step 5: Update CHANGELOG and README. In `core/storely/README.md`, find the "Defaults" section (or create a "Breaking changes" section near the top). Add:**

```markdown
### Breaking change in this version

When constructed with an in-memory store and no explicit `serialization` option,
`Storely` no longer wraps values with the default JSON serializer. This matches
the behavior of `keyv`'s in-memory store and removes a 4-80× per-op overhead
when working with `Map`-backed caches. To restore the previous behavior, pass
an explicit serializer:

```ts
import { Storely, StorelyJsonSerializer } from "storely";
const cache = new Storely({
    store: new Map(),
    serialization: new StorelyJsonSerializer(),
});
```
```

- [ ] **Step 6: Commit:**

```bash
git add core/storely/src/storely.ts core/storely/test/storely.test.ts core/storely/README.md
git commit -m "storely - perf: skip default serialization for in-memory stores"
```

---

## Task 5: Fast-path detection and short-circuit for `get`/`set`/`has`/`delete`

**Files:**
- Modify: `core/storely/src/storely.ts` (constructor, `get`, `set`, `has`, `delete`, plus a private `_fastPath` boolean)
- Test: `core/storely/test/fast-path.test.ts` (new)

**Why:** Once Pillar 2 lands, common config (memory store, no serialization, no compression, no encryption, no checkExpired, no sanitization) means `get`/`set`/`has`/`delete` can skip the encode/decode dance entirely. Returning a single resolved Promise instead of awaiting through `hookWithDeprecated` → `decode` → `Promise.all` cuts microtasks dramatically.

- [ ] **Step 1: In `storely.ts`, add a private boolean field below the existing private fields (near line 82):**

```ts
/**
 * When true, the configured pipeline is the trivial one: no serialization,
 * compression, encryption, expiry-check, or key sanitization. Hot-path
 * operations short-circuit through the storage adapter directly.
 * Recomputed whenever any pipeline component changes.
 */
private _fastPath = false;
```

- [ ] **Step 2: Add a private method that recomputes `_fastPath`:**

```ts
private recomputeFastPath(): void {
    this._fastPath =
        this._serialization === undefined &&
        this._compression === undefined &&
        this._encryption === undefined &&
        this._checkExpired === false &&
        (this._sanitize?.enabled ?? false) === false &&
        this._store?.capabilities?.inMemory === true;
}
```

- [ ] **Step 3: Call `recomputeFastPath()` at the end of the constructor (after `this._checkExpired = ...`) AND in every setter that mutates a relevant field: the setters for `compression`, `encryption`, `serialization`, `sanitize`, and `setStore`. Also after assigning `_checkExpired` in the constructor.**

For example, the `compression` setter:

```ts
public set compression(compress: StorelyCompressionAdapter | undefined) {
    this._compression = compress;
    this.recomputeFastPath();
}
```

Apply the same pattern to `encryption`, `serialization`, `sanitize` setters; in `setStore` add `this.recomputeFastPath();` as the last line; in the constructor add it after `this._checkExpired = mergedOptions.checkExpired ?? false;`.

- [ ] **Step 4: Modify `get()` (lines 366–419) to take the fast path when `_fastPath` is true. Insert at the start of the function body, after the array-dispatch check and after `key === ""` early return:**

```ts
if (this._fastPath) {
    const raw = await this._store.get<Value>(key as string);
    if (raw === undefined || raw === null) return undefined;
    // The memory adapter strips its internal envelope before returning;
    // raw is the user-visible value already.
    return raw as Value;
}
```

This sits before the existing `await this.hookWithDeprecated(...)` so when the fast path is on, no hooks/telemetry fire. **Important:** if a user attaches a hook or telemetry listener at runtime, `_fastPath` is NOT recomputed — listener attachment doesn't currently trigger any of our setters. We accept this trade-off: hooks attached after construction don't fire on the fast path. **This is a behavior change.** To make hook attachment dynamically toggle off the fast path, we'd need to override `Hookified.onHook`. We choose the simpler rule: fast path requires "no listeners ever" — if the user wants hooks/telemetry, they should attach before first op or set `serialization` to a non-undefined value (which forces the slow path).

Actually, simpler and safer: add `&& this.eventListeners.length === 0` to `recomputeFastPath` is hard since Hookified doesn't expose a count. Instead, **gate the fast path on hook listener counts at call time:**

Replace the `_fastPath` short-circuit in `get` with:

```ts
if (this._fastPath
    && (this.getHooks(StorelyHooks.BEFORE_GET)?.length ?? 0) === 0
    && (this.getHooks(StorelyHooks.AFTER_GET)?.length ?? 0) === 0
    && this.listenerCount(StorelyEvents.STAT_HIT) === 0
    && this.listenerCount(StorelyEvents.STAT_MISS) === 0) {
    const raw = await this._store.get<Value>(key as string);
    if (raw === undefined || raw === null) return undefined;
    return raw as Value;
}
```

- [ ] **Step 5: Apply the same check at the top of `set()` (after the `data` object construction at line 587):**

```ts
if (this._fastPath
    && (this.getHooks(StorelyHooks.BEFORE_SET)?.length ?? 0) === 0
    && (this.getHooks(StorelyHooks.AFTER_SET)?.length ?? 0) === 0
    && this.listenerCount(StorelyEvents.STAT_SET) === 0) {
    const resolvedTtl = resolveTtl(ttl, this._ttl);
    if (typeof value === "symbol") {
        this.emit(StorelyEvents.ERROR, "symbol cannot be serialized");
        return false;
    }
    return this._store.set(key, value as unknown, resolvedTtl);
}
```

This goes after sanitization and the empty-key check, before `await this.hookWithDeprecated(StorelyHooks.BEFORE_SET, data)`.

- [ ] **Step 6: Apply equivalent fast paths to `has()` and `delete()`. For `has`, after the empty-key check:**

```ts
if (this._fastPath
    && (this.getHooks(StorelyHooks.BEFORE_HAS)?.length ?? 0) === 0
    && (this.getHooks(StorelyHooks.AFTER_HAS)?.length ?? 0) === 0) {
    return this._store.has(key as string);
}
```

For `delete`:

```ts
if (this._fastPath
    && (this.getHooks(StorelyHooks.BEFORE_DELETE)?.length ?? 0) === 0
    && (this.getHooks(StorelyHooks.AFTER_DELETE)?.length ?? 0) === 0
    && this.listenerCount(StorelyEvents.STAT_DELETE) === 0) {
    return this._store.delete(key as string);
}
```

- [ ] **Step 7: Create `core/storely/test/fast-path.test.ts`:**

```ts
import { describe, expect, test } from "vitest";
import { Storely, StorelyJsonSerializer } from "../src/index.js";

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
        s.onHook("beforeSet", () => { calls.push("beforeSet"); });
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
        await new Promise(r => setTimeout(r, 10));
        expect(await s.get("k")).toBeUndefined();
    });
});
```

- [ ] **Step 8: Run tests:**

Run: `cd core/storely && pnpm test`
Expected: all green, including the new file.

- [ ] **Step 9: Commit:**

```bash
git add core/storely/src/storely.ts core/storely/test/fast-path.test.ts
git commit -m "storely - perf: synchronous fast-path for in-memory + no-serializer config"
```

---

## Task 6: Tighter `getMany`/`setMany` (sync loop instead of `Promise.all(map(async))`)

**Files:**
- Modify: `core/storely/src/storely.ts:425-463` (`getMany`) and `:632-685` (`setMany`)

**Why:** Both methods currently do `Promise.all(rawData.map(async row => …))` which allocates one Promise per entry and runs them as microtasks even when the work inside is synchronous. For batch sizes of 1000 that's 1000 unnecessary Promises. When serialization is off (Pillar 2), the inner work is purely synchronous; loop directly.

- [ ] **Step 1: In `getMany` (line 437), replace the `Promise.all` block with a sync loop. Find the existing block:**

```ts
let deserialized: Array<StorelyValue<Value> | undefined>;
if (this._checkExpired) {
    deserialized = await this.decodeWithExpire<Value>(keys, rawData as unknown[]);
} else {
    deserialized = await Promise.all(
        (rawData as unknown[]).map(async (row) => {
            if (row === undefined || row === null) {
                return undefined;
            }

            return typeof row === "string" ? this.decode<Value>(row) : (row as StorelyValue<Value>);
        }),
    );
}
```

Replace with:

```ts
let deserialized: Array<StorelyValue<Value> | undefined>;
if (this._checkExpired) {
    deserialized = await this.decodeWithExpire<Value>(keys, rawData as unknown[]);
} else if (this._serialization === undefined) {
    // Sync fast path: no async decode work; just narrow the rows.
    const rows = rawData as unknown[];
    deserialized = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        deserialized[i] = (row === undefined || row === null) ? undefined : (row as StorelyValue<Value>);
    }
} else {
    deserialized = await Promise.all(
        (rawData as unknown[]).map(async (row) => {
            if (row === undefined || row === null) return undefined;
            return typeof row === "string" ? this.decode<Value>(row) : (row as StorelyValue<Value>);
        }),
    );
}
```

- [ ] **Step 2: Apply the same pattern to `setMany`. Currently line 645:**

```ts
const serializedEntries = await Promise.all(
    entries.map(async ({ key, value, ttl }) => {
        ttl = resolveTtl(ttl, this._ttl);
        const expires = calculateExpires(ttl);
        if (typeof value === "symbol") {
            this.emit(StorelyEvents.ERROR, "symbol cannot be serialized");
            this.emitTelemetry(StorelyEvents.STAT_ERROR, key);
            throw new Error("symbol cannot be serialized");
        }
        const formattedValue = { value, expires };
        const encodedValue = await this.encode(formattedValue);
        return { key, value: encodedValue, ttl };
    }),
);
```

Replace with:

```ts
let serializedEntries: Array<{ key: string; value: unknown; ttl?: number }>;
if (this._serialization === undefined) {
    serializedEntries = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
        const { key, value, ttl: rawTtl } = entries[i];
        const ttl = resolveTtl(rawTtl, this._ttl);
        const expires = calculateExpires(ttl);
        if (typeof value === "symbol") {
            this.emit(StorelyEvents.ERROR, "symbol cannot be serialized");
            this.emitTelemetry(StorelyEvents.STAT_ERROR, key);
            throw new Error("symbol cannot be serialized");
        }
        // No serializer: encode is identity; pass value directly.
        serializedEntries[i] = { key, value: { value, expires }, ttl };
    }
} else {
    serializedEntries = await Promise.all(
        entries.map(async ({ key, value, ttl }) => {
            ttl = resolveTtl(ttl, this._ttl);
            const expires = calculateExpires(ttl);
            if (typeof value === "symbol") {
                this.emit(StorelyEvents.ERROR, "symbol cannot be serialized");
                this.emitTelemetry(StorelyEvents.STAT_ERROR, key);
                throw new Error("symbol cannot be serialized");
            }
            const formattedValue = { value, expires };
            const encodedValue = await this.encode(formattedValue);
            return { key, value: encodedValue, ttl };
        }),
    );
}
```

- [ ] **Step 3: Run tests:**

Run: `cd core/storely && pnpm test`
Expected: all green; the existing batch tests cover both branches now.

- [ ] **Step 4: Commit:**

```bash
git add core/storely/src/storely.ts
git commit -m "storely - perf: sync loop in getMany/setMany when no serializer is configured"
```

---

## Task 7: Per-pillar benchmark gate — Pillar 1 + 2

**Files:** none (validation only)

**Why:** Before moving to per-adapter pillars, confirm that the core changes have closed the memory/redis cliffs without regressing any winning cell.

- [ ] **Step 1: Run the memory-only benchmark in defaults mode:**

Run: `cd benchmarks && pnpm bench -- --backend=memory --suite=all --mode=both --skip-docs`
Expected: storely's memory `get`/`set`/`has`/`delete` at all sizes within 5% of `keyv` (the previously fastest), or bolded fastest. Compare to `benchmarks/results/merged-2026-05-08T00-28-17-160Z.md` baseline.

- [ ] **Step 2: Spot-check the redis benchmark in defaults mode (requires `pnpm test:services:start`):**

Run: `pnpm test:services:start && cd benchmarks && pnpm bench -- --backend=redis --suite=crud --mode=defaults --skip-docs`
Expected: redis `set(32B)` should now be in the same order of magnitude as keyv (was ~20× slower; should be within 1.5×).

- [ ] **Step 3: If anything regresses on a previously-winning cell, halt and investigate. Otherwise, commit the benchmark output:**

```bash
git add benchmarks/results/
git commit -m "benchmarks - test: snapshot results after pillars 1+2"
```

---

# Pillar 3 — Batched SQL `deleteMany`

## Task 8: SQLite batched `deleteMany`

**Files:**
- Modify: `storage/sqlite/src/index.ts:539-546`
- Test: `storage/sqlite/test/delete-many-batch.test.ts` (new)

**Why:** Currently loops `await this.delete(key)` — 1000 keys = 1000 round-trips. Replace with one SELECT (to determine which keys exist) + one DELETE WHERE key IN (…) per chunk of 998.

- [ ] **Step 1: Create `storage/sqlite/test/delete-many-batch.test.ts`:**

```ts
import { describe, expect, test } from "vitest";
import { StorelySqlite } from "../src/index.js";

describe("sqlite deleteMany batched", () => {
    test("returns true for existing keys, false for missing keys, in input order", async () => {
        const s = new StorelySqlite({ filename: ":memory:" });
        await s.set("a", "1");
        await s.set("c", "3");
        const result = await s.deleteMany(["a", "b", "c", "d"]);
        expect(result).toEqual([true, false, true, false]);
        expect(await s.get("a")).toBeUndefined();
        expect(await s.get("c")).toBeUndefined();
        await s.disconnect();
    });

    test("handles batches larger than the 998-param chunk size", async () => {
        const s = new StorelySqlite({ filename: ":memory:" });
        const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
        for (const k of keys) await s.set(k, "v");
        const result = await s.deleteMany(keys);
        expect(result.length).toBe(2500);
        expect(result.every(r => r === true)).toBe(true);
        await s.disconnect();
    });

    test("empty input returns empty array", async () => {
        const s = new StorelySqlite({ filename: ":memory:" });
        expect(await s.deleteMany([])).toEqual([]);
        await s.disconnect();
    });
});
```

- [ ] **Step 2: Run the test to confirm it fails on at least the first case (currently passes, but we want to lock the contract before refactoring):**

Run: `cd storage/sqlite && pnpm test delete-many-batch`
Expected: PASS already (the slow loop was correct, just slow). Good — we're TDD-locking the contract.

- [ ] **Step 3: Replace the `deleteMany` implementation in `storage/sqlite/src/index.ts` (lines 539–546):**

Current:
```ts
async deleteMany(keys: string[]): Promise<boolean[]> {
    const results: boolean[] = [];
    for (const key of keys) {
        results.push(await this.delete(key));
    }
    return results;
}
```

Replace with:
```ts
async deleteMany(keys: string[]): Promise<boolean[]> {
    if (keys.length === 0) return [];
    const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
    const ns = this.getNamespaceValue();
    const batchSize = 998; // 999 max params - 1 for namespace
    const existed = new Set<string>();

    for (let i = 0; i < strippedKeys.length; i += batchSize) {
        const batch = strippedKeys.slice(i, i + batchSize);
        const placeholders = batch.map(() => "?").join(", ");

        // First: discover which keys actually exist (per-key boolean accuracy).
        const select = `SELECT key FROM ${this.getCleanTableName()} WHERE key IN (${placeholders}) AND namespace = ?`;
        const rows = await this.query(select, ...batch, ns);
        for (const row of rows as Array<{ key: string }>) {
            existed.add(row.key);
        }

        // Then: single batched DELETE.
        const del = `DELETE FROM ${this.getCleanTableName()} WHERE key IN (${placeholders}) AND namespace = ?`;
        await this.query(del, ...batch, ns);
    }

    return strippedKeys.map((k) => existed.has(k));
}
```

- [ ] **Step 4: Run the test:**

Run: `cd storage/sqlite && pnpm test delete-many-batch`
Expected: PASS, all three cases.

- [ ] **Step 5: Run the full sqlite test suite to confirm no regression:**

Run: `cd storage/sqlite && pnpm test`
Expected: all green.

- [ ] **Step 6: Commit:**

```bash
git add storage/sqlite/src/index.ts storage/sqlite/test/delete-many-batch.test.ts
git commit -m "sqlite - perf: batched deleteMany with SELECT-then-DELETE for per-key accuracy"
```

---

## Task 9: Postgres batched `deleteMany` with RETURNING

**Files:**
- Modify: `storage/postgres/src/index.ts:457-460`
- Test: `storage/postgres/test/delete-many-batch.test.ts` (new)

**Why:** Postgres supports `DELETE … RETURNING key`, which collapses the SELECT-then-DELETE into a single round-trip per chunk.

- [ ] **Step 1: Create `storage/postgres/test/delete-many-batch.test.ts`:**

```ts
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { StorelyPostgres } from "../src/index.js";

const url = process.env.POSTGRES_URL || "postgresql://postgres:postgres@localhost:5432/postgres";

describe("postgres deleteMany batched", () => {
    let s: StorelyPostgres;
    beforeAll(async () => { s = new StorelyPostgres({ url, table: "storely_dm_test" }); });
    afterAll(async () => { await s.clear(); await s.disconnect(); });

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
        expect(result.every(r => r === true)).toBe(true);
    });

    test("empty input returns empty array", async () => {
        expect(await s.deleteMany([])).toEqual([]);
    });
});
```

- [ ] **Step 2: Replace `deleteMany` in `storage/postgres/src/index.ts` (lines 457–460):**

Current:
```ts
public async deleteMany(keys: string[]): Promise<boolean[]> {
    const results = await Promise.all(keys.map(async (key) => this.delete(key)));
    return results;
}
```

Replace with:
```ts
public async deleteMany(keys: string[]): Promise<boolean[]> {
    if (keys.length === 0) return [];
    const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
    const ns = this.getNamespaceValue();
    const deleted = new Set<string>();

    // RETURNING gives us per-key existence in a single round-trip.
    const sql = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = ANY($1) AND COALESCE(namespace, '') = COALESCE($2, '') RETURNING key`;
    const rows = await this.query(sql, [strippedKeys, ns]);
    for (const row of rows as Array<{ key: string }>) {
        deleted.add(row.key as string);
    }

    return strippedKeys.map((k) => deleted.has(k));
}
```

- [ ] **Step 3: Start postgres service and run the test:**

Run: `pnpm test:services:start && cd storage/postgres && pnpm test delete-many-batch`
Expected: PASS.

- [ ] **Step 4: Run the full suite:**

Run: `cd storage/postgres && pnpm test`
Expected: all green.

- [ ] **Step 5: Commit:**

```bash
git add storage/postgres/src/index.ts storage/postgres/test/delete-many-batch.test.ts
git commit -m "postgres - perf: batched deleteMany using DELETE … RETURNING"
```

---

## Task 10: MySQL batched `deleteMany`

**Files:**
- Modify: `storage/mysql/src/index.ts:468-475`
- Test: `storage/mysql/test/delete-many-batch.test.ts` (new)

**Why:** MySQL doesn't support RETURNING; use SELECT-then-DELETE pattern like SQLite.

- [ ] **Step 1: Create `storage/mysql/test/delete-many-batch.test.ts`:**

```ts
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { StorelyMysql } from "../src/index.js";

const uri = process.env.MYSQL_URL || "mysql://root:mysql@localhost:3306/storely";

describe("mysql deleteMany batched", () => {
    let s: StorelyMysql;
    beforeAll(async () => { s = new StorelyMysql({ uri, table: "storely_dm_test" }); });
    afterAll(async () => { await s.clear(); await s.disconnect(); });

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
        expect(result.every(r => r === true)).toBe(true);
    });

    test("empty input returns empty array", async () => {
        expect(await s.deleteMany([])).toEqual([]);
    });
});
```

- [ ] **Step 2: Replace `deleteMany` in `storage/mysql/src/index.ts` (lines 468–475):**

Current:
```ts
public async deleteMany(key: string[]): Promise<boolean[]> {
    const results: boolean[] = [];
    for (const k of key) {
        results.push(await this.delete(k));
    }
    return results;
}
```

Replace with:
```ts
public async deleteMany(keys: string[]): Promise<boolean[]> {
    if (keys.length === 0) return [];
    const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
    const ns = this.getNamespaceValue();
    const batchSize = 1000; // MySQL has no hard param limit but stay reasonable
    const existed = new Set<string>();

    for (let i = 0; i < strippedKeys.length; i += batchSize) {
        const batch = strippedKeys.slice(i, i + batchSize);

        // First: discover which keys exist for per-key boolean accuracy.
        const selSql = `SELECT id FROM ${escapeIdentifier(this._table)} WHERE id IN (?) AND namespace = ?`;
        const selFmt = mysql.format(selSql, [batch, ns]);
        const rows: mysql.RowDataPacket[] = await this.query(selFmt);
        for (const row of rows) existed.add(row.id as string);

        // Then: single batched DELETE.
        const delSql = `DELETE FROM ${escapeIdentifier(this._table)} WHERE id IN (?) AND namespace = ?`;
        await this.query(mysql.format(delSql, [batch, ns]));
    }

    return strippedKeys.map((k) => existed.has(k));
}
```

- [ ] **Step 3: Start mysql service and run the test:**

Run: `pnpm test:services:start && cd storage/mysql && pnpm test delete-many-batch`
Expected: PASS.

- [ ] **Step 4: Run the full suite:**

Run: `cd storage/mysql && pnpm test`
Expected: all green.

- [ ] **Step 5: Commit:**

```bash
git add storage/mysql/src/index.ts storage/mysql/test/delete-many-batch.test.ts
git commit -m "mysql - perf: batched deleteMany with SELECT-then-DELETE"
```

---

## Task 11: Per-pillar benchmark gate — Pillar 3

**Files:** none (validation only)

- [ ] **Step 1: Run the SQL benchmark suite:**

Run: `pnpm test:services:start && cd benchmarks && pnpm bench -- --backend=sqlite,postgres,mysql --suite=batch --mode=both --skip-docs`
Expected: every `deleteMany(n=1000)` cell shows storely as bolded fastest, OR within 5% of the fastest. Specifically:
  - sqlite `deleteMany(n=1000)`: was 61 ops/s, target ≥1400 ops/s (catch keyv).
  - postgres `deleteMany(n=1000)`: was 3 ops/s, target ≥39 ops/s.
  - mysql `deleteMany(n=1000)`: was 1 ops/s, target ≥103 ops/s.

- [ ] **Step 2: Commit benchmark snapshot:**

```bash
git add benchmarks/results/
git commit -m "benchmarks - test: snapshot results after pillar 3 (SQL deleteMany)"
```

---

# Pillar 6 — Mongo bulk operations

## Task 12: Mongo batched `deleteMany`

**Files:**
- Modify: `storage/mongo/src/index.ts` (around lines 485–488)
- Test: `storage/mongo/test/delete-many-batch.test.ts` (new)

**Why:** Currently `deleteMany` calls `this.delete(key)` per key. One `find({key:{$in}})` for existence then one `deleteMany({key:{$in}})` collapses N round-trips into 2.

- [ ] **Step 1: Create `storage/mongo/test/delete-many-batch.test.ts`:**

```ts
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { StorelyMongo } from "../src/index.js";

const url = process.env.MONGO_URL || "mongodb://localhost:27017";

describe("mongo deleteMany batched", () => {
    let s: StorelyMongo;
    beforeAll(async () => {
        s = new StorelyMongo({ url, db: "storely_test", collection: "dm_test" });
        await s.connect;
    });
    afterAll(async () => { await s.clear(); await s.disconnect(); });

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
        expect(result.every(r => r === true)).toBe(true);
    });

    test("empty input returns empty array", async () => {
        expect(await s.deleteMany([])).toEqual([]);
    });
});
```

- [ ] **Step 2: Open `storage/mongo/src/index.ts` around lines 485–488 and locate the current `deleteMany`. It looks roughly like:**

```ts
public async deleteMany(keys: string[]): Promise<boolean[]> {
    const results: boolean[] = [];
    for (const k of keys) results.push(await this.delete(k));
    return results;
}
```

Replace with:

```ts
public async deleteMany(keys: string[]): Promise<boolean[]> {
    if (keys.length === 0) return [];

    const conn = await this.connect;
    if (this._gridfs && conn.bucket) {
        // GridFS path: bulk-delete by querying file ids, then deleting one shot.
        // Fall back to per-key for correctness; GridFS is rarely benchmarked at scale.
        const results: boolean[] = [];
        for (const k of keys) results.push(await this.delete(k));
        return results;
    }

    const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
    const ns = this._namespace ?? "";
    const collection = conn.store;
    const batchSize = 1000;
    const existed = new Set<string>();

    for (let i = 0; i < strippedKeys.length; i += batchSize) {
        const batch = strippedKeys.slice(i, i + batchSize);

        // Pre-flight existence check (per-key boolean contract).
        const found = await collection
            .find({ key: { $in: batch }, namespace: ns }, { projection: { _id: 0, key: 1 } })
            .toArray();
        for (const doc of found) existed.add(doc.key as string);

        // Single bulk delete.
        await collection.deleteMany({ key: { $in: batch }, namespace: ns });
    }

    return strippedKeys.map((k) => existed.has(k));
}
```

If the actual property names in this adapter differ (`_namespace` vs `namespace`, `connect.store` vs `connect.collection`), match the surrounding code's pattern — read lines 207–275 and 337–380 for naming conventions.

- [ ] **Step 3: Start mongo and run the test:**

Run: `pnpm test:services:start && cd storage/mongo && pnpm test delete-many-batch`
Expected: PASS.

- [ ] **Step 4: Run the full suite:**

Run: `cd storage/mongo && pnpm test`
Expected: all green.

- [ ] **Step 5: Commit:**

```bash
git add storage/mongo/src/index.ts storage/mongo/test/delete-many-batch.test.ts
git commit -m "mongo - perf: batched deleteMany using find+deleteMany pair"
```

---

## Task 13: Per-pillar benchmark gate — Pillar 6

**Files:** none (validation only)

- [ ] **Step 1: Run the mongo benchmark:**

Run: `pnpm test:services:start && cd benchmarks && pnpm bench -- --backend=mongo --suite=batch --mode=both --skip-docs`
Expected: `deleteMany(n=1000)` was 7 ops/s, target ≥209 ops/s (matching keyv).

- [ ] **Step 2: Commit snapshot:**

```bash
git add benchmarks/results/
git commit -m "benchmarks - test: snapshot results after pillar 6 (mongo deleteMany)"
```

---

# Pillar 4 — MySQL `MEDIUMBLOB` migration

## Task 14: Switch MySQL value column to `MEDIUMBLOB` and add migration

**Files:**
- Modify: `storage/mysql/src/index.ts:245` (CREATE TABLE) plus the connect-init path
- Test: `storage/mysql/test/mediumblob-migration.test.ts` (new)

**Why:** TEXT with utf8mb4 caps storage at ~16KB effective; the benchmark's 64KB cells fail. `MEDIUMBLOB` is binary-safe and 16MB.

- [ ] **Step 1: Create `storage/mysql/test/mediumblob-migration.test.ts`:**

```ts
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { StorelyMysql } from "../src/index.js";
import mysql from "mysql2/promise";

const uri = process.env.MYSQL_URL || "mysql://root:mysql@localhost:3306/storely";

describe("mysql MEDIUMBLOB migration", () => {
    test("new tables are created with MEDIUMBLOB", async () => {
        const tableName = `storely_blob_${Date.now()}`;
        const s = new StorelyMysql({ uri, table: tableName });
        await s.set("k", "v"); // Force schema creation
        const conn = await mysql.createConnection(uri);
        const [rows]: any = await conn.query(
            `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = 'value'`,
            [tableName]
        );
        expect(rows[0].DATA_TYPE).toBe("mediumblob");
        await conn.query(`DROP TABLE ${tableName}`);
        await conn.end();
        await s.disconnect();
    });

    test("64KB value round-trips", async () => {
        const tableName = `storely_64k_${Date.now()}`;
        const s = new StorelyMysql({ uri, table: tableName });
        const big = "x".repeat(64 * 1024);
        await s.set("k", big);
        expect(await s.get("k")).toBe(big);
        await s.clear();
        await s.disconnect();
    });

    test("legacy TEXT table is migrated to MEDIUMBLOB on connect", async () => {
        const tableName = `storely_legacy_${Date.now()}`;
        const conn = await mysql.createConnection(uri);
        await conn.query(`CREATE TABLE \`${tableName}\` (id VARCHAR(255) NOT NULL, value TEXT, namespace VARCHAR(255) NOT NULL DEFAULT '', expires BIGINT UNSIGNED DEFAULT NULL, UNIQUE INDEX (id, namespace))`);
        const s = new StorelyMysql({ uri, table: tableName });
        await s.set("k", "v"); // Triggers connect path
        const [rows]: any = await conn.query(
            `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = 'value'`,
            [tableName]
        );
        expect(rows[0].DATA_TYPE).toBe("mediumblob");
        await conn.query(`DROP TABLE ${tableName}`);
        await conn.end();
        await s.disconnect();
    });
});
```

- [ ] **Step 2: In `storage/mysql/src/index.ts`, find the CREATE TABLE statement (line 245). Change `value TEXT` to `value MEDIUMBLOB`. The full CREATE TABLE becomes:**

```ts
const createTable = `CREATE TABLE IF NOT EXISTS \`${this._table}\`(id VARCHAR(255) NOT NULL, value MEDIUMBLOB, namespace VARCHAR(255) NOT NULL DEFAULT '', expires BIGINT UNSIGNED DEFAULT NULL, UNIQUE INDEX \`${this._table}_key_namespace_idx\` (id, namespace), INDEX \`${this._table}_expires_idx\` (expires))`;
```

- [ ] **Step 3: Add a migration that runs after the CREATE TABLE statement on connect. Look for the `init` or `connect` method that runs the CREATE TABLE; immediately after it, add:**

```ts
// Migration: legacy TEXT → MEDIUMBLOB. Idempotent.
const checkSql = `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'value'`;
const [colRows]: any = await this._pool.query(checkSql, [this._table]);
if (Array.isArray(colRows) && colRows[0]?.DATA_TYPE === "text") {
    await this._pool.query(`ALTER TABLE \`${this._table}\` MODIFY COLUMN value MEDIUMBLOB`);
}
```

(If the adapter uses `this.query()` rather than `this._pool.query()`, mirror its pattern. If the connect-init path is harder to locate, search for "CREATE TABLE IF NOT EXISTS" in the file and put the migration right after that statement runs.)

- [ ] **Step 4: Driver boundary check — the `mysql2` driver returns `MEDIUMBLOB` columns as `Buffer` by default. The `get()` and `getMany()` paths currently treat the value as the raw column value; if a `Buffer` arrives where the rest of storely expects a string, it'll break. Check by writing a test that gets a stored value back as a string. If the driver returns `Buffer`, decode at the read site. In `get()` (line 323 area), change the return:**

```ts
const v = row.value;
return (Buffer.isBuffer(v) ? v.toString("utf8") : v) as StorelyStorageGetResult<Value>;
```

Apply equivalently to `getMany`'s value-extraction (`validMap.set(row.id as string, ...)`) and any other read site. Wrapping the row.value in `Buffer.isBuffer(v) ? v.toString("utf8") : v` is the minimal, safe change.

- [ ] **Step 5: Run all three tests:**

Run: `pnpm test:services:start && cd storage/mysql && pnpm test mediumblob-migration`
Expected: all three PASS.

- [ ] **Step 6: Run the full mysql suite:**

Run: `cd storage/mysql && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit:**

```bash
git add storage/mysql/src/index.ts storage/mysql/test/mediumblob-migration.test.ts
git commit -m "mysql - feat: migrate value column to MEDIUMBLOB to support payloads ≥64KB"
```

---

## Task 15: Per-pillar benchmark gate — Pillar 4

**Files:** none

- [ ] **Step 1: Run the mysql 64KB cells:**

Run: `pnpm test:services:start && cd benchmarks && pnpm bench -- --backend=mysql --suite=crud --mode=both --skip-docs`
Expected: mysql 64KB `get`/`set`/`has` cells now show numbers (no `—`) and are within 5% of the fastest competitor.

- [ ] **Step 2: Commit snapshot:**

```bash
git add benchmarks/results/
git commit -m "benchmarks - test: snapshot results after pillar 4 (mysql MEDIUMBLOB)"
```

---

# Pillar 2.2 — JSON serializer bare-value encoding

## Task 16: Bare-value encoding in `StorelyJsonSerializer`

**Files:**
- Modify: `core/storely/src/json-serializer.ts:102-122`
- Test: `core/storely/test/json-serializer-bare.test.ts` (new)

**Why:** When the wrapped envelope has no `expires`, encoding `{value: "foo", expires: undefined}` produces `{"value":"foo"}` (8 bytes for 3-byte content). Switching to a bare `*"foo"` (6 bytes) and skipping the wrapper cuts payload size and removes one allocation per serialize/parse on the JSON-mode hot path.

- [ ] **Step 1: Create `core/storely/test/json-serializer-bare.test.ts`:**

```ts
import { describe, expect, test } from "vitest";
import { StorelyJsonSerializer } from "../src/json-serializer.js";

describe("JSON serializer bare-value encoding", () => {
    const ser = new StorelyJsonSerializer();

    test("stringifies bare value when expires is undefined", async () => {
        const out = await ser.stringify({ value: "hello", expires: undefined });
        expect(out).toBe('*"hello"');
    });

    test("stringifies wrapped value when expires is set", async () => {
        const out = await ser.stringify({ value: "hello", expires: 1234567890 });
        expect(out).toBe('{"value":"hello","expires":1234567890}');
    });

    test("parses bare-value form", async () => {
        const parsed = await ser.parse<string>('*"hello"');
        expect(parsed).toEqual({ value: "hello", expires: undefined });
    });

    test("parses legacy wrapped form (backward compat)", async () => {
        const parsed = await ser.parse<string>('{"value":"hello","expires":1234567890}');
        expect(parsed).toEqual({ value: "hello", expires: 1234567890 });
    });

    test("round-trips complex types in bare mode", async () => {
        const obj = { a: 1, b: [1, 2, 3], c: { nested: true } };
        const out = await ser.stringify({ value: obj, expires: undefined });
        const parsed = await ser.parse(out);
        expect(parsed).toEqual({ value: obj, expires: undefined });
    });

    test("round-trips Buffer and BigInt in bare mode", async () => {
        const out = await ser.stringify({
            value: { buf: Buffer.from("hi"), big: 42n },
            expires: undefined,
        });
        const parsed = await ser.parse<{ buf: Buffer; big: bigint }>(out);
        expect(parsed?.value.buf).toBeInstanceOf(Buffer);
        expect(parsed?.value.buf.toString()).toBe("hi");
        expect(parsed?.value.big).toBe(42n);
    });
});
```

- [ ] **Step 2: Modify `core/storely/src/json-serializer.ts`. Locate the existing `stringify` and `parse` methods (around lines 102 and 106):**

Current `stringify`:
```ts
public async stringify<T>(object: T): Promise<string> {
    return JSON.stringify(prepare(object));
}
```

Replace with:
```ts
public async stringify<T>(object: T): Promise<string> {
    // Optimization: when the wrapped envelope has no expires, store the bare
    // value with a sentinel prefix to avoid the {"value":..., "expires":...} overhead.
    // The sentinel '*' is unambiguous because JSON.stringify output starts with
    // one of: " { [ - 0-9 t f n.
    if (
        typeof object === "object" &&
        object !== null &&
        "value" in (object as Record<string, unknown>) &&
        (object as Record<string, unknown>).expires === undefined
    ) {
        return "*" + JSON.stringify(prepare((object as { value: unknown }).value));
    }
    return JSON.stringify(prepare(object));
}
```

Current `parse`:
```ts
public async parse<T>(data: string): Promise<T | undefined> {
    if (data === undefined || data === null) return undefined;
    return JSON.parse(data, (key, value) => {
        if (typeof value === "string") {
            if (value.startsWith(":base64:")) {
                return Buffer.from(value.slice(8), "base64");
            }
            if (value.startsWith(":bigint:")) {
                return BigInt(value.slice(8));
            }
            if (value.startsWith(":escaped:")) {
                return value.slice(9);
            }
        }
        return value;
    }) as T;
}
```

Replace with:
```ts
public async parse<T>(data: string): Promise<T | undefined> {
    if (data === undefined || data === null) return undefined;
    const reviver = (key: string, value: unknown) => {
        if (typeof value === "string") {
            if (value.startsWith(":base64:")) return Buffer.from(value.slice(8), "base64");
            if (value.startsWith(":bigint:")) return BigInt(value.slice(8));
            if (value.startsWith(":escaped:")) return value.slice(9);
        }
        return value;
    };
    if (data.length > 0 && data[0] === "*") {
        const value = JSON.parse(data.slice(1), reviver as any);
        return { value, expires: undefined } as unknown as T;
    }
    return JSON.parse(data, reviver as any) as T;
}
```

- [ ] **Step 3: Run the new test:**

Run: `cd core/storely && pnpm test json-serializer-bare`
Expected: all six PASS.

- [ ] **Step 4: Run all storely tests:**

Run: `cd core/storely && pnpm test`
Expected: all green. Look for any pre-existing tests that hard-coded the wrapped wire format string — those need updating to either match the new bare form or to set an `expires` value.

- [ ] **Step 5: Run all storage adapter tests with services started — they all use the JSON serializer in their test suites:**

Run: `pnpm test:services:start && pnpm -r test`
Expected: all green.

- [ ] **Step 6: Update `core/storely/README.md` Breaking Changes section:**

```markdown
The `StorelyJsonSerializer` wire format now omits the `{value, expires}`
envelope when `expires` is undefined, prefixing the bare value with `*`.
The decoder accepts both new and legacy formats, so reading existing data
written by older versions still works. Code that hand-rolls the wire format
(extremely uncommon) needs updating.
```

- [ ] **Step 7: Commit:**

```bash
git add core/storely/src/json-serializer.ts core/storely/test/json-serializer-bare.test.ts core/storely/README.md
git commit -m "storely - perf: bare-value JSON wire format when expires is unset"
```

---

# Pillar 5 — Redis verification

## Task 17: Verify Redis is now within 5% of keyv

**Files:** none — pure benchmarking.

**Why:** Pillars 1+2 should have closed most of the redis gap (the JSON wrap was the dominant cost). If anything remains, isolate and fix.

- [ ] **Step 1: Run the redis benchmark:**

Run: `pnpm test:services:start && cd benchmarks && pnpm bench -- --backend=redis --suite=all --mode=both --skip-docs`
Expected: every redis cell shows storely as bolded fastest OR within 5% of the fastest.

- [ ] **Step 2: If a cell still lags, inspect that specific operation in `storage/redis/src/index.ts` and look for non-batched paths or extra round-trips. Common culprits: `setMany` not pipelining when TTL is set; `getMany` doing `MGET` but post-processing serially. If found, file a follow-up issue and patch inline.

If everything passes, commit benchmark snapshot:

```bash
git add benchmarks/results/
git commit -m "benchmarks - test: snapshot results after pillar 5 (redis verification)"
```

---

# Validation — full sweep + regression-check script

## Task 18: Full benchmark sweep

**Files:** none

- [ ] **Step 1: Stop and restart services to start clean:**

Run: `pnpm test:services:stop && pnpm test:services:start`

- [ ] **Step 2: Run the full benchmark suite:**

Run: `cd benchmarks && pnpm bench`
Expected: every cell in the generated `benchmarks/results/<latest>.md` shows storely as bolded fastest or within 5% of the fastest.

- [ ] **Step 3: Manually diff the new merged report against `benchmarks/results/merged-2026-05-08T00-28-17-160Z.md`. List any cell where storely is not bolded AND the gap to the fastest exceeds 5%. If any exist, halt and address.

- [ ] **Step 4: Stop services:**

Run: `pnpm test:services:stop`

- [ ] **Step 5: Commit:**

```bash
git add benchmarks/results/
git commit -m "benchmarks - test: post-overhaul full sweep snapshot"
```

---

## Task 19: Regression-check script

**Files:**
- Create: `benchmarks/regression-check.ts`
- Modify: `benchmarks/package.json` (add a `gate` script)

**Why:** Lock the wins in CI so future changes can't silently regress.

- [ ] **Step 1: Create `benchmarks/regression-check.ts`. The merged JSON shape is `{ rows: ResultRow[] }` where `ResultRow` is defined in `benchmarks/src/types.ts:43-55` as `{ backend, library, operation, mode, valueSize?, batchSize?, hz, rme, samples, mean, fallback }`. The script groups rows into cells by `(backend, mode, operation, valueSize, batchSize)` and compares the `storely` row to the fastest non-storely row in each cell:**

```ts
#!/usr/bin/env tsx
/**
 * Regression gate: reads the latest merged benchmark JSON in benchmarks/results/
 * and asserts that for every (backend, mode, operation, valueSize, batchSize) cell,
 * storely's ops/sec is within 5% of the fastest competitor — or error bars overlap.
 * Exit 0 on pass; exit 1 with a diff list on failure.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface ResultRow {
    backend: string;
    library: string;
    operation: string;
    mode: string;
    valueSize?: number;
    batchSize?: number;
    hz: number;
    rme: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(here, "results");
const TOLERANCE = 0.05;

function loadLatestMerged(): ResultRow[] {
    const files = readdirSync(RESULTS_DIR)
        .filter((f) => f.startsWith("merged-") && f.endsWith(".json"))
        .sort();
    const latest = files[files.length - 1];
    if (!latest) throw new Error("No merged benchmark JSON found in benchmarks/results/");
    const data = JSON.parse(readFileSync(join(RESULTS_DIR, latest), "utf8")) as { rows: ResultRow[] };
    return data.rows;
}

function cellKey(r: ResultRow): string {
    return `${r.backend}|${r.mode}|${r.operation}|${r.valueSize ?? ""}|${r.batchSize ?? ""}`;
}

const rows = loadLatestMerged();
const cells = new Map<string, ResultRow[]>();
for (const r of rows) {
    const k = cellKey(r);
    const arr = cells.get(k) ?? [];
    arr.push(r);
    cells.set(k, arr);
}

const failures: Array<{ cell: string; storely: number; fastest: number; gap: number }> = [];
for (const [k, group] of cells) {
    const storely = group.find((g) => g.library === "storely");
    if (!storely) continue;
    const competitors = group.filter((g) => g.library !== "storely");
    if (competitors.length === 0) continue;
    const fastest = competitors.reduce((a, b) => (b.hz > a.hz ? b : a));
    if (storely.hz >= fastest.hz * (1 - TOLERANCE)) continue;
    const storelyHigh = storely.hz * (1 + storely.rme / 100);
    const fastestLow = fastest.hz * (1 - fastest.rme / 100);
    if (storelyHigh >= fastestLow) continue;
    failures.push({ cell: k, storely: storely.hz, fastest: fastest.hz, gap: (fastest.hz - storely.hz) / fastest.hz });
}

if (failures.length === 0) {
    console.log(`✅ All ${cells.size} cells within tolerance.`);
    process.exit(0);
}

console.error(`❌ ${failures.length} cells regressed:`);
for (const f of failures) {
    console.error(
        `  - ${f.cell}: storely ${f.storely.toFixed(0)} ops/s vs fastest ${f.fastest.toFixed(0)} ops/s (gap ${(f.gap * 100).toFixed(1)}%)`,
    );
}
process.exit(1);
```

- [ ] **Step 2: Add to `benchmarks/package.json` scripts:**

```json
"gate": "tsx regression-check.ts"
```

- [ ] **Step 3: Run it against the post-overhaul report:**

Run: `cd benchmarks && pnpm gate`
Expected: `✅ All N cells within tolerance.` Exit 0.

- [ ] **Step 4: Commit:**

```bash
git add benchmarks/regression-check.ts benchmarks/package.json
git commit -m "benchmarks - feat: regression-check gate script"
```

---

## Task 20: Wire regression-check into CI

**Files:**
- Modify: `.github/workflows/<existing-ci-yml>` (locate via `ls .github/workflows/`)
- OR create: a new minimal `bench-gate.yml` if none exists

**Why:** Without CI enforcement, the wins erode over time.

- [ ] **Step 1: Identify the existing CI config:**

Run: `ls .github/workflows/`

- [ ] **Step 2: Add a job (or step in the existing test job) that runs:**

```yaml
- name: Bench gate
  run: |
    pnpm test:services:start
    cd benchmarks && pnpm bench
    pnpm gate
    pnpm test:services:stop
  timeout-minutes: 30
```

Skip this step on PRs that are docs-only (use a path filter if the repo conventions support it).

- [ ] **Step 3: Push the branch and confirm the CI run passes against the new baseline.

- [ ] **Step 4: Commit:**

```bash
git add .github/workflows/
git commit -m "ci - feat: enforce benchmark regression gate"
```

---

## Self-Review Checklist (run before declaring the plan complete)

- [ ] Every spec section maps to a task: pillar 1.1 → Task 1, 1.2 → Task 2, 1.3 → Task 5, 1.4 → Task 6, 2.1 → Tasks 3+4, 2.2 → Task 16, 3 → Tasks 8+9+10, 4 → Task 14, 5 → Task 17, 6 → Task 12. Validation → Tasks 18+19+20. ✓
- [ ] No "TBD" / "fill in later" / "appropriate error handling" placeholders. ✓
- [ ] Function/method names consistent across tasks: `recomputeFastPath`, `_fastPath`, `removeKeyPrefix`, `getNamespaceValue`, `getCleanTableName`. ✓
- [ ] Every code step shows the actual code. ✓
- [ ] Per-pillar gates exist after each major work block (Tasks 7, 11, 13, 15, 17). ✓
- [ ] Final regression script + CI wiring lock the wins (Tasks 19, 20). ✓
