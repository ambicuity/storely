# `@storely/mysql` Operations

## Latency expectations

Reference numbers from `perf-baselines/mysql.json` (local docker). Comparable to Postgres for single-key ops.

## Tuning

- **Per-instance pool** — Cluster 2 replaced the module-level pool singleton. Each `StorelyMysql` instance owns its pool; `disconnect()` correctly `await`s `endPool`.
- **`intervalExpiration`** — interval (in seconds) for the server-side expired-row cleanup event. **Note:** units differ from other adapters which use milliseconds. Set carefully.
- **Event name** — Cluster 7 made the cleanup event name include the table identifier so multiple instances on the same MySQL server don't collide.

## Failure modes

- **Pool exhausted**: queries queue. Bound the wait via the pool's acquireTimeout option.
- **Server-side event scheduler disabled**: TTL cleanup won't run. Verify `event_scheduler = ON`.
- **`endPool` mid-flight**: Cluster 2 made `disconnect()` await pool drain, so in-flight queries complete before disconnect returns.

## Known limitations

- `deleteMany` still does two round-trips per chunk (pre-flight `SELECT id` then `DELETE`). MySQL 8.0.20+ supports `DELETE … RETURNING`; migrating is post-`6.0.0` work.
- `intervalExpiration` is in seconds, not milliseconds. Cross-package inconsistency carried forward; documented in JSDoc.
