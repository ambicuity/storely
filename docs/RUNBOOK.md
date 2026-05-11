# Storely Operator Runbook

This document is for **operators running Storely in production**. It covers health-checking, tuning, common failure modes, and incident response. For per-adapter specifics — connection-pool defaults, latency expectations, known limitations — see [`docs/adapters/`](./adapters/).

## Health-checking a running instance

Storely is an event emitter. Subscribe to `StorelyEvents` for visibility:

```ts
import Storely, { StorelyEvents } from "storely";

const storely = new Storely({ store });
storely.on(StorelyEvents.STAT_HIT, (e) => /* hit */);
storely.on(StorelyEvents.STAT_MISS, (e) => /* miss */);
storely.on(StorelyEvents.STAT_ERROR, (e) => /* error — log + page if rate spikes */);
storely.on(StorelyEvents.ERROR, (err) => /* internal error — always log */);
```

For OTel-native instrumentation, install [`@storely/otel`](../observability/otel/) and call `instrumentWithOtel(storely, { tracer, meter })`. The adapter emits counters for hits/misses/sets/deletes/errors and wraps every public operation in a span.

## Tuning checklist

Each Storely instance has roughly three knobs that matter under load:

1. **Connection pool / client config** — see per-adapter doc for defaults and limits.
2. **`commandTimeout`** (Redis-family adapters) — caps how long a single command will wait before the adapter rejects. Default `5_000` ms. Lower for latency-sensitive paths; raise if your backend has predictable slow operations (e.g. cross-region replication).
3. **Batch size** — `setMany` / `getMany` / `deleteMany` payloads are chunked internally per adapter. For very large batches, prefer one big call (the adapter chunks) over many small calls (you pay per-call overhead).

## Common failure modes

### Operation hangs longer than expected

**Symptom:** a single `get` / `set` / `setMany` takes >5s or never returns.

**Likely causes:**
- Backend is unreachable but the underlying client is queueing commands without a timeout. **All four batch methods of Redis, KeyDB, Memcache, and Valkey now respect `commandTimeout` after Cluster 3.** If you set `commandTimeout: 0` or pass `undefined`, you opt out of the cap.
- Etcd lease exhaustion on high-frequency writes. Adapter buckets leases per TTL (Cluster 5) — verify your TTL distribution; pathological TTL spread per write defeats the bucketing.
- Postgres connection-pool saturation. Default pool max is `10`. Raise for high-concurrency workloads; see [`docs/adapters/postgres-operations.md`](./adapters/postgres-operations.md).

**Triage:**
1. Check `STAT_ERROR` event rate. A sudden spike correlates with backend issues.
2. Check `STAT_MISS` rate. If it spikes alongside slowness, the backend is dropping data, not just slow.
3. For Redis-family: confirm `commandTimeout` is set in the adapter constructor.

### Connection pool exhausted

**Symptom:** new operations queue or throw "connection acquisition timeout".

**Action:**
- Raise `pool.max` on Postgres / MySQL adapters. Default is `10`.
- Cluster 8 added validation that rejects `pool.max <= 0` at constructor time with `RangeError` — if you see that error, you've passed a config that would self-DoS.

### Lease leak / "limit exceeded" on etcd

**Symptom:** etcd reports lease-table-full errors after sustained write traffic.

**Action:**
- Verify you're using a `defaultTtl` (single shared lease) OR keeping the per-TTL bucket count bounded. Random per-write TTLs defeat bucketing.
- Call `adapter.disconnect()` cleanly on shutdown — Cluster 5 added bucket-lease revocation to disconnect.

### Memcache "key not found" after restart

**Memcache is permanent experimental for `6.0.x`.** Don't put live traffic on it.

### DynamoDB `clear()` partial

**Symptom:** keys remain after `clear()` returns.

**Action:** Cluster 2 added pagination to `clear()`. If you're on the old behavior, upgrade. Otherwise, file an issue — `clear()` should now drain a table of any size.

## CVE response process

1. Report via **GitHub Private Security Advisory** — see [`SECURITY.md`](../SECURITY.md). Do not file a public issue.
2. Maintainers acknowledge within 5 business days.
3. Fix is developed in a private branch; reporter is credited in the advisory unless they prefer anonymity.
4. Release plan:
   - **Patch release** for the current `6.0.x` line.
   - **Backport** to the previous minor if it's still receiving patches.
5. Advisory is made public on release day, with the fix version and CVSS score.

A breaking wire-format change driven by a CVE is communicated under the "Breaking" CHANGELOG section regardless of major/minor. See [`docs/DEPRECATION_POLICY.md`](./DEPRECATION_POLICY.md) — security overrides the standard deprecation cycle.

## Upgrade discipline

- **`patch` → `minor`**: read the CHANGELOG; no migration usually required.
- **`minor` → `major`**: read the migration guide. Deprecated APIs are removed at major bumps. See [`docs/API_STABILITY.md`](./API_STABILITY.md).
- **Wire format**: the encryption envelope is versioned (`STv0` magic prefix). Future versions will accept the old format for one full minor-release window before requiring the new prefix.

## Backups & disaster recovery

Storely is a cache abstraction, not a primary store. Adapter behavior on data loss:

- **In-memory / BigMap**: ephemeral by design. Lost on restart.
- **SQLite**: file-backed; back up the `.sqlite` file with the WAL settings documented in [`docs/adapters/sqlite-operations.md`](./adapters/sqlite-operations.md).
- **Redis / Valkey / KeyDB / Memcache**: rely on the backend's own persistence / replication. Storely doesn't add durability guarantees.
- **Postgres / MySQL / MongoDB / DynamoDB / Etcd / RocksDB**: durable by their nature; restore via the backend's standard backup tooling.

Treat Storely-backed data as cache: invalidatable, regeneratable. If you can't lose it, store it elsewhere and cache references with Storely.
