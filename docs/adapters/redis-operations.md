# `@storely/redis` Operations

## Latency expectations

Reference numbers from `perf-baselines/redis.json` (local docker, single-instance). Production numbers depend on RTT to your Redis cluster.

| Op | p50 expectation |
|---|---|
| `get` / `set` | sub-millisecond on local; ~1–5ms over LAN |
| `setMany(100)` / `getMany(100)` | single-digit ms with pipelining |
| `deleteMany(100)` | single-digit ms via pipelined `UNLINK` |

## Tuning

- **`commandTimeout`** — default `5_000` ms. Set to your operation SLO. Cluster 3 wired this through all four batch methods.
- **`socket.keepAlive`** — pass through to the underlying `@redis/client` socket options when running behind load balancers that idle out long-lived connections.
- **TLS** — supply `socket.tls: true` plus cert paths via the same socket options pass-through.

## Failure modes

- **Backend unreachable**: returns rejected promise within `commandTimeout`. Does **not** hang (Cluster 3).
- **`set(key, value, 0)`**: TTL of `0` means "no expiry" (Cluster 2 clarified semantics).
- **Cluster mode**: supported via `cluster: true`. See package README for cluster configuration. Slot rebalancing is transparent to the adapter.

## Known limitations

- `clear()` with no namespace flushes the connected database. Set a namespace if you share the Redis instance.
- The `throwOnErrors: false` default means error events go to the `STAT_ERROR` listener path, not as thrown exceptions. Subscribe explicitly.
