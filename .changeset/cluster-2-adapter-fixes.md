---
"@storely/mongo": minor
"@storely/mysql": minor
"@storely/dynamo": minor
"@storely/redis": patch
"@storely/postgres": patch
---

**Cluster 2 — Adapter deadlock & data-loss fixes.** MongoDB `initConnection` now rejects on connection failure instead of leaving every subsequent operation deadlocked. MySQL pool is per-instance with proper `await endPool` on disconnect (no more module-level singleton leaks). DynamoDB `clear()` paginates Scan results so tables >1 MB are fully cleared; the silent 6-hour default TTL was replaced with an explicit `defaultTtl` option. Redis `set(k, v, 0)` semantics clarified — `0` now means "no expiry" everywhere. Postgres `deleteMany` chunks at 1000 keys to avoid driver-side memory blowup.
