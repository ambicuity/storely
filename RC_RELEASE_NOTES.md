# Storely 6.0.0-rc.1 — Release Candidate Notes

This is the first release candidate for Storely 6.0.0. It signals **production candidacy**: the codebase has cleared every audit-blocking item and is now in the operability-and-confidence phase. We are looking for real-world validation from early adopters before cutting the stable `6.0.0`.

## What landed since `6.0.0-alpha.4`

The `benchmark-supremacy` branch shipped eight focused clusters of fixes against the [2026-05-09 production-readiness audit](./docs/audits/2026-05-09-production-readiness-audit.md):

- **Cluster 1 — Release pipeline & disclosure.** The `release.yml` publish job now gates on lint/typecheck/build/test/website-build. `SECURITY.md` uses GitHub Private Security Advisory. `--provenance` and `id-token: write` enabled for npm attestation.
- **Cluster 2 — Data-loss & deadlock fixes.** MongoDB `initConnection` reject path. MySQL per-instance pool with `await endPool`. DynamoDB `clear()` pagination + removal of silent 6-hour default TTL. Redis `set(k, v, 0)` semantics clarified.
- **Cluster 3 — Batch-op hangs.** `commandTimeout` wired through all four batch methods of Redis, KeyDB, Memcache, Valkey. Valkey `clear()` switched to `SCAN`-based key collection.
- **Cluster 4 — Supply chain & repo hygiene.** `.gitignore *.sqlite`, tar CVE override, Memcache marked experimental, ContEXT realignment.
- **Cluster 5 — Misnomer & correctness.** `compress-gzip` switched from raw DEFLATE to true gzip. RocksDB iterator truncation fixed. Etcd lease lifecycle managed via per-TTL buckets.
- **Cluster 6 — Encryption hardening.** `deriveKey()` PBKDF2 helpers in both `encrypt-node` and `encrypt-web`. AEAD detection hardened with explicit ChaCha20-Poly1305 allowlist.
- **Cluster 7 — Core API refinements.** `setMany` per-entry success/failure. `BridgeAdapter.setMany` propagates underlying result. `BigMap.set()` returns `this`. `throwOnEmptyListeners` defaults to `false`.
- **Cluster 8 — Architectural completion.** `get()` undefined-vs-missing JSDoc'd. `StorelyStats` snapshot methods. Concurrency test suite (opt-in). Postgres pool validation. Etcd batched iterator. Encryption `STv0` magic prefix for forward compatibility. PBKDF2 default raised to 600k (OWASP 2024). Brotli quality default 4. GitHub Actions pinned to SHAs + Dependabot. Website CI job. Root `clean` script split.

## What's new in this RC

- **Versioning:** all 22 packages bumped to `6.0.0-rc.1`.
- **Documentation:** new [`docs/DEPRECATION_POLICY.md`](./docs/DEPRECATION_POLICY.md) and [`docs/API_STABILITY.md`](./docs/API_STABILITY.md) define the support contract for the `6.0.x` line.
- **Memcache disposition:** flagged as permanent experimental for `6.0.x`. The underlying client is unmaintained; migration to a maintained client is post-`6.0.0` work.

## Known caveats — please test these in your environment

### Experimental adapters

These ship for parity but are **not supported for production**. Use only with awareness of the known gaps.

- `@storely/keydb`
- `@storely/memcache` — permanent experimental for `6.0.x` (unmaintained client)
- `@storely/etcd`
- `@storely/dynamo`

See [`API_STABILITY.md`](./docs/API_STABILITY.md) for per-adapter rationale.

### Deferred to post-`6.0.0`

- Full competitive benchmark suite (the one removed at `9e32f1f`).
- Fuzzing harness for serializers and compression.
- Browser environment matrix for `@storely/encrypt-web` and `@storely/serialize-msgpackr`.
- `memcache` → `memjs` migration.

## How to validate this RC

1. Pin to `6.0.0-rc.1` in your project.
2. Run your existing integration tests against your adapter of choice.
3. Report regressions via [GitHub Issues](https://github.com/jaredwray/storely/issues).
4. Report security concerns via GitHub Private Security Advisory (see [`SECURITY.md`](./SECURITY.md)).

The stable `6.0.0` will be cut once we have at least two weeks of `rc.1` adoption signal without a regression report from an early adopter.

## Upgrading from `5.x`

See the [v5 → v6 migration guide](./website/site/docs/v5-to-v6.md). The most important shape changes were already in `6.0.0-alpha.x`; this RC adds documentation and operational maturity but does not change the public API beyond what alpha already shipped.
