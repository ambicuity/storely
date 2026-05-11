---
"storely": minor
"@storely/test-suite": minor
"@storely/postgres": patch
"@storely/etcd": patch
"@storely/encrypt-node": minor
"@storely/encrypt-web": minor
"@storely/compress-brotli": patch
"@storely/compress-lz4": patch
---

**Cluster 8 — Architectural completion.** Documented the `Storely.get()` undefined-vs-missing semantic gap on the public overloads. Added `StorelyStats.snapshot*Keys()` defensive-copy methods alongside the existing live-map getters. Opt-in concurrency test suite in `@storely/test-suite`. Postgres pool config now validated at config-time (`max <= 0` and negative timeouts throw `RangeError`). Etcd iterator now fetches the prefix range in a single request instead of N+1 per-key gets. **Encryption wire format**: new ciphertexts carry a 4-byte `STv0` magic prefix for forward compatibility; decryption still accepts the legacy no-magic format. **PBKDF2 default raised to 600,000** (OWASP 2024); callers who need to decrypt data derived at the old 100,000 default must pass `iterations: 100_000` explicitly. Brotli default quality lowered from Node's 11 to 4 (cache-storage tradeoff). `compress-lz4` engines bumped to `>= 20` for root parity.
