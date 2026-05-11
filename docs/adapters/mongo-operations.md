# `@storely/mongo` Operations

## Latency expectations

Reference numbers from `perf-baselines/mongo.json` (local docker). Mongo's network protocol is heavier than Redis; expect single-digit ms on local, ~10–20ms typical LAN.

## Tuning

- **MongoDB driver options** — passed through to `MongoClient` constructor. `maxPoolSize`, `serverSelectionTimeoutMS`, `socketTimeoutMS` are the three you'll touch most.
- **Index strategy** — adapter creates a unique compound index on `(key, namespace)` and a TTL index on `expires`. The TTL index drives expiry; Mongo's TTL monitor sweeps once a minute. Do not rely on millisecond-precise expiry.

## Failure modes

- **Connection failure at init**: Cluster 2 fixed the deadlock — `initConnection` now rejects the connect promise on failure. Subsequent `get` / `set` calls will reject promptly instead of hanging.
- **TTL monitor lag**: keys may live up to ~60 seconds past their `expires` timestamp before Mongo removes them. Use `expires`-aware `get` (the adapter checks and filters expired entries on read).
- **Deprecated `count()` warnings**: Cluster 2 switched `has()` / `hasMany()` to `countDocuments`. If you see deprecation warnings from `count()`, you're on an older snapshot.

## Known limitations

- The TTL index has the deprecated `background: true` option historically; Cluster 2 removed it. Driver v4+ ignores the flag anyway.
- Storage shape is a single collection per namespace path. Sharding strategies are up to your cluster topology.
