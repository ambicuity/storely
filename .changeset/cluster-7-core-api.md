---
"storely": minor
"@storely/bigmap": minor
---

**Cluster 7 — Core API refinements.** `setMany` now tracks per-entry success/failure instead of collapsing to all-false on a single bad entry. `BridgeAdapter.setMany` propagates the underlying store's per-key result instead of synthesising `true` regardless. `BigMap.set()` returns `this` so chaining works correctly and writes are routed to the proper shard. `throwOnEmptyListeners` now defaults to `false` — internal error events no longer crash consumers who haven't attached an `on("error")` handler.
