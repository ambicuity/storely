---
"storely": minor
---

**Cluster 1 — Release pipeline & disclosure.** The `release.yml` publish job now gates on lint/typecheck/build/test before it can ship a tag. `SECURITY.md` redirects reporters to GitHub's Private Security Advisory flow instead of public issues. `--provenance` and `id-token: write` enabled on the publish job for npm attestation. A standalone `pnpm -r exec tsc --noEmit` job catches type errors that tsdown would otherwise strip silently.
