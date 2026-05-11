---
"storely": minor
"@storely/test-suite": minor
"@storely/memcache": patch
"@storely/otel": minor
---

**Cluster 9 — Production readiness.** First release-candidate cut for the `6.0.0` line. Adds release engineering, operability, and confidence infrastructure on top of the architecturally-complete Clusters 1–8.

- **Versioning:** all 22 packages bumped to `6.0.0-rc.1`.
- **Changesets:** adopted as the primary release path. `.changeset/` config + workflow scaffolded; CONTRIBUTING.md documents the contributor flow.
- **Stability docs:** new `docs/DEPRECATION_POLICY.md` and `docs/API_STABILITY.md` define the support contract for the `6.0.x` line.
- **Operator runbook:** `docs/RUNBOOK.md` plus per-adapter operations docs for the seven non-experimental adapters.
- **Perf gate:** `scripts/perf-baseline.ts` + `perf-baselines/` + `.github/workflows/perf-gate.yml`. Label-gated PR check (25% regression tolerance) catches order-of-magnitude perf regressions without competitive-benchmark noise.
- **Chaos tests:** opt-in `chaos: true` flag on `@storely/test-suite` with three failure-mode scenarios per adapter. `.github/workflows/chaos.yml` is label-gated.
- **`@storely/otel`** — new first-party observability adapter. Duck-typed to the OpenTelemetry API; subscribes to `StorelyEvents` for counters and wraps `get`/`set`/`delete` hooks in spans. No monkey-patching; disposable for clean shutdown.
- **`memcache` disposition:** flagged as permanent experimental for `6.0.x` (unmaintained underlying client; migration tracked post-`6.0.0`).
