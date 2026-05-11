# `@storely/valkey` Operations

## Latency expectations

Identical profile to Redis. Valkey is Redis-protocol compatible; see [`redis-operations.md`](./redis-operations.md) for baseline numbers and tuning that transfers.

## Tuning

- **`commandTimeout`** — Cluster 3 wired this through all four batch methods. Default `5_000` ms.
- **`clear()`** — Cluster 3 replaced blocking `KEYS *` with cursor-based `SCAN`. Safe on large keysets.
- **`deleteMany`** — Cluster 3 added 1000-key chunked `UNLINK` pipelining.

## Failure modes

Same as Redis. The protocol compatibility means failure modes carry over.

## Known limitations

- The `iovalkey` client is pre-1.0. Track upstream releases via Dependabot (now configured per Cluster 8).
- When in doubt, prefer `@storely/redis` for the better-tested driver. Use Valkey when you specifically need its server-side features.
