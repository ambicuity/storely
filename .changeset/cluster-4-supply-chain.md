---
"storely": patch
---

**Cluster 4 — Supply chain & repo hygiene.** Added `*.sqlite` to `.gitignore` and removed previously-tracked sqlite test artefacts. Pinned `tar` via `pnpm.overrides` to clear the GHSA-* CVEs that flowed through `sqlite3`'s transitive deps. Flagged the four experimental adapters (`@storely/keydb`, `@storely/memcache`, `@storely/etcd`, `@storely/dynamo`) in the root README and per-package READMEs.
