# @storely/benchmarks

Competitive benchmarks comparing `storely` against its closest architectural rivals — `keyv` and `cache-manager` — across every storage backend the three libraries share.

## Quick start

```sh
# In-memory only (fast, no Docker needed)
pnpm --filter @storely/benchmarks bench -- --backend=memory --suite=crud --mode=defaults

# Full run across all backends and both modes
pnpm test:services:start
pnpm bench
pnpm test:services:stop
```

Results land in `benchmarks/results/<timestamp>.{json,md}` and (unless `--skip-docs`) a generated page at `website/site/docs/benchmarks.md`.

## CLI flags

| Flag | Values | Default | Notes |
|---|---|---|---|
| `--backend=<name>` | `memory`, `redis`, `sqlite`, `mysql`, `postgres`, `mongo`, `all` | `all` | Backends not reachable on their default port are auto-skipped via TCP probe. |
| `--suite=<name>` | `crud`, `batch`, `all` | `all` | `crud` covers `get`/`set`/`delete`/`has` at value sizes 32 B / 1 KB / 64 KB. `batch` covers `getMany`/`setMany`/`deleteMany` at sizes 10 / 100 / 1000. |
| `--mode=<name>` | `defaults`, `json`, `both` | `both` | See "Modes" below. |
| `--docs-out=<path>` | path | `website/site/docs/benchmarks.md` | Where to write the generated docs page. |
| `--skip-docs` | flag | false | Don't update the docs site page. |

## Modes

- **`defaults`** — each library runs with its out-of-the-box configuration. This reflects what real users get when they `npm install` and follow the README. (All three libraries currently default to JSON-based serialization, so values for the two modes are usually similar; the column is kept so the comparison stays meaningful if any of them changes its default.)
- **`json`** — every library is explicitly configured with `JSON.stringify` / `JSON.parse`. Strict apples-to-apples.

## Fairness rules

- Connections are opened and warmed up **before** each measured cycle starts.
- For read/has/delete benchmarks, we pre-populate a 1000-key pool. Writes rotate through the same pool, so the workload is set-or-overwrite. `delete` re-populates the pool before each Benchmark.js cycle but Benchmark.js may run many iterations per cycle — the absolute number reflects the average across populated and exhausted states. Relative comparison between libraries remains valid.
- TTL is disabled in all libraries (would otherwise differ in cost).
- Each library gets its own isolated store (separate Map / sqlite file / Mongo collection) so they don't contend for the same keys.
- Any operation a library doesn't natively support is implemented via `Promise.all` of singles and footnoted with `*` in the report. Currently:
  - `keyv` lacks native `setMany` → emulated.
  - `cache-manager` lacks native `has` → emulated as `get(key) !== null/undefined`.

## Caveats

- `cache-manager` v6+ uses Keyv stores under the hood. So for any non-memory backend, `cache-manager` results reflect Keyv's performance plus a thin wrapper layer. This is documented in the report's footnotes.
- The benchmark harness uses Benchmark.js's deferred async pattern. Per-iteration overhead is identical across all three libraries, so the comparison is fair, but absolute ops/sec numbers are slightly lower than what a tighter loop would produce.

## Sanity bands

Numbers outside these rough bands likely indicate a harness bug, not a real perf finding. Bands reflect benchmark.js deferred async timing against local services — absolute numbers are RTT-bound and lower than a tight synchronous loop:

| Backend | Operation | Expected band |
|---|---|---|
| memory | `get` (default + structured fast path) | 3M – 7M ops/s |
| memory | `get` (json mode) | 600k – 2M ops/s |
| redis (localhost) | `get` / `set` | 1k – 3k ops/s |
| sqlite (file) | `get` | 30k – 200k ops/s |
| sqlite (file) | `setMany(1000)` | 100 – 500 ops/s |
| postgres (localhost) | `get` | 1k – 4k ops/s |
| mysql (localhost) | `get` | 1k – 3k ops/s |
| mongo (localhost) | `get` | 1k – 3k ops/s |

If you see e.g. keyv `set` on redis at 40k+ ops/s, that's the historical
serialize-disabled bug — confirm `benchmarks/src/libraries/{keyv,cache-manager}.ts`
is not passing `serialize: undefined`/`deserialize: undefined`. Pre-fix numbers
were measuring node-redis throwing on a non-string value, caught silently.

## Regression gate

A regression gate at `regression-check.ts` compares the most recent per-run
JSON in `results/` against a tracked snapshot at `benchmarks/baseline.json`,
storely cell by storely cell, and fails when the current run's `hz` is more
than 5% below the baseline AND the RME error bars don't overlap.

- `pnpm --filter @storely/benchmarks gate` — runs the comparison.
- `pnpm --filter @storely/benchmarks gate -- --promote` — replaces
  `baseline.json` with the latest run. Use after intentional perf changes
  (positive or negative). Commit `benchmarks/baseline.json` to record it.

CI runs `pnpm bench` (writes a fresh per-run JSON) then `pnpm gate` (compares
that fresh JSON to the committed baseline).

The baseline tracks **storely's** numbers only — keyv and cache-manager rows
in the JSON are kept for context but the gate doesn't enforce against them.
That avoids holding storely to absolute-perf targets ("be faster than keyv
on every cell"), which is brittle and conflates "regression" with "we didn't
win the head-to-head." A real regression is when storely got slower vs its
own previous self.

## Adding a backend

1. Create `src/backends/<name>.ts` exporting a `BackendFactory` (see `types.ts`).
2. Register it in `src/backends/index.ts`.
3. Make sure each library has an adapter for that backend.
