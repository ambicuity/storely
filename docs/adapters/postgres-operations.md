# `@storely/postgres` Operations

## Latency expectations

Reference numbers from `perf-baselines/postgres.json` (local docker). Production latency dominated by network RTT and pool acquisition time.

| Op | p50 expectation (local docker) |
|---|---|
| `get` / `set` | low single-digit ms |
| `setMany(100)` | tens of ms (single round-trip via parameterized insert) |
| `deleteMany(100)` | single-digit ms (chunked at 1000 keys per Cluster 2) |

## Tuning

- **Pool config** — pass via `pool` option. Cluster 8 added validation at construction: `pool.max <= 0` and negative `connectionTimeoutMillis` / `idleTimeoutMillis` throw `RangeError`.
  - **`pool.max`** — default `10` (pg-driver default). Raise to 25–50 for high-concurrency services. Watch your Postgres `max_connections` ceiling.
  - **`pool.connectionTimeoutMillis`** — default `0` (wait forever). Set to ~5–10s in production so a misconfigured DB doesn't wedge the app.
  - **`pool.idleTimeoutMillis`** — default `10_000`. Lower if you pay per-connection.
- **`iterationLimit`** — default `500` (Cluster 2 bumped from `10`). Tune for typical iterator size.
- **`useUnloggedTable: true`** — faster writes but data lost on crash. Cache use only.

## Failure modes

- **Pool exhausted**: connection acquisition queues. Set `connectionTimeoutMillis` to bound the wait.
- **Schema race on first start**: Cluster 2 fixed concurrent-create races for the unique index. Code `23505` is suppressed during init.
- **Server unavailable**: queries reject with the pg driver error. The adapter does not retry.

## Known limitations

- No automatic schema migration framework. The table is created lazily on first init; subsequent schema changes require manual migration.
- `clear()` is a `TRUNCATE` per-namespace via `DELETE`. For very large tables, consider periodic full-table maintenance separately.
