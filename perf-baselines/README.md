# Perf Baselines

This directory holds latency baselines (p50 / p99) per adapter, captured by `scripts/perf-baseline.ts`. The `.github/workflows/perf-gate.yml` workflow compares PR measurements against these files and fails when any percentile regresses by more than **25%**.

## Capturing or updating a baseline

```bash
pnpm test:services:start
pnpm tsx scripts/perf-baseline.ts --all
pnpm test:services:stop
```

Commit the resulting `<adapter>.json` files. Update only when an intentional change shifts the numbers (e.g. a perf improvement) — never to paper over a regression.

## Comparing against the committed baseline

```bash
pnpm tsx scripts/perf-baseline.ts --all --compare
```

Exit code is `0` when all percentiles are within `1.25×` the baseline, `1` otherwise.

## Caveats

- Numbers reflect the docker-compose backends from `scripts/`, not production hardware. Treat them as a relative-trend signal, not absolute SLOs. Real-world SLOs belong in [`docs/adapters/`](../docs/adapters/).
- The 25% threshold is intentionally loose. This gate exists to catch **order-of-magnitude regressions**, not micro-noise.
- Adapters without a baseline yet are written on first run (so the initial commit per adapter is the bootstrap baseline).
