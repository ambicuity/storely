---
"@storely/compress-gzip": major
"@storely/rocksdb": minor
"@storely/etcd": minor
---

**Cluster 5 — Misnomer & correctness.** `@storely/compress-gzip` now produces **real gzip** (RFC 1952 with header/trailer) instead of raw DEFLATE. **This is a wire-format change**: data compressed with the previous alpha release of this package is not decompressable by the new version (and vice versa) — re-encode any persisted gzip-compressed values when upgrading. RocksDB iterator no longer silently truncates at 100 entries (limit is opt-in). Etcd lease lifecycle reworked into per-TTL buckets with explicit revocation on `disconnect()`.
