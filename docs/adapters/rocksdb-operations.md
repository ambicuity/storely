# `@storely/rocksdb` Operations

## Latency expectations

Reference numbers from `perf-baselines/rocksdb.json`. RocksDB is in-process; latency is bounded by disk write amplification and compaction state.

## Tuning

- **Native binding**: depends on `@nxtedition/rocksdb` which compiles from source on install. Build will fail in scratch / Alpine / restricted CI without a C++ toolchain. Provision a build environment with `gcc` + `make` + Python.
- **Iterator** — Cluster 5 removed the silent 100-entry truncation. Pass `iterationLimit: N` only when you want a bounded iterator; the default yields all matching entries.
- **`path`** — directory on disk; ensure it's writable and on a volume with enough space (compaction can transiently 2–3× usage).

## Failure modes

- **Disk full**: writes throw. RocksDB does not write through silently.
- **Compaction stall**: very large writes can stall when compaction can't keep up. Tune the native options if you hit this; the adapter passes options through.
- **Process crash mid-write**: RocksDB's WAL recovers on next open. No data loss within the WAL window; entries past the WAL boundary are lost (this is configurable upstream).

## Known limitations

- No multi-process access. Open by exactly one process at a time.
- The native binding's lack of prebuilt binaries is the largest operational gotcha. If you need turnkey deployment, prefer SQLite for embedded use cases.
- Cluster 5 fixed a dead `Uint8Array` branch in `parseValue`; non-Buffer Uint8Array inputs now parse correctly.
