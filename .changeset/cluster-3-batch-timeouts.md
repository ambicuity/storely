---
"@storely/redis": minor
"@storely/keydb": minor
"@storely/memcache": minor
"@storely/valkey": minor
---

**Cluster 3 — Batch-op timeouts.** All four batch methods (`getMany`, `setMany`, `deleteMany`, `hasMany`) on Redis, KeyDB, Memcache, and Valkey now respect a configurable `commandTimeout`. Previously these could hang indefinitely when the backend became transiently unreachable. Valkey's `clear()` switched from blocking `KEYS *` to cursor-based `SCAN`, and `deleteMany` now pipelines `UNLINK` in 1000-key chunks instead of N serial round-trips.
