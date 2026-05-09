# Remove all benchmarking

## Context

The `benchmarks/` package and its supporting infrastructure have not earned their keep. A full sweep takes 12+ hours and hangs indefinitely on adapter-level batch operations (memcache and keydb were observed). The signal it was supposed to deliver — competitive comparison against keyv and cache-manager — turned out to be brittle: the most recent baseline was misleading because the keyv/cache-manager wrappers were silently no-op'ing on `set`, and the corrected baseline showed parity rather than the dramatic gaps the project was named for. Even after the bench-config fix (`96a32bb`) and gate rework (`7ca4cb3`), the runtime is unaffordable for a feedback loop and the maintenance burden of 9 backend factories + competitor wrappers is high.

The decision: remove all benchmarking infrastructure. Keep specs and plans as historical record of what was tried and why.

## Goals

- The repo no longer contains a `benchmarks/` package.
- No CI job runs benchmarks.
- No documentation steers users to a benchmarks page.
- Future engineers can still read what was attempted by browsing `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Non-goals

- Rewrite git history. The bench-related commits stay in the log; deletion happens as a forward-only commit.
- Delete the design and plan documents. They describe decisions that were made; deleting them rewrites the historical record.
- Re-introduce a smaller bench harness. If perf measurement returns later, it gets a new spec on its own merits.

## Architecture

Single forward commit on `benchmark-supremacy` that:

1. Deletes the entire `benchmarks/` directory (package source, results, baseline, regression-check script, README, package.json, tsconfig, vitest config).
2. Deletes `website/site/docs/benchmarks.md` (auto-generated bench output that is now orphaned).
3. Removes the `bench-gate` job from `.github/workflows/ci.yml` (lines covering job header through "Stop Docker test services" step).
4. Removes the `benchmarks` entry from `pnpm-workspace.yaml` (line 8).
5. Removes the `bench` script from root `package.json` (line 22).
6. Removes the bench paragraph and directory line from root `README.md` (lines 52 and 57 specifically).

## Validation

After the commit:

```bash
test ! -d benchmarks/                                                    # exits 0
test ! -f website/site/docs/benchmarks.md                                # exits 0
grep -q 'bench-gate' .github/workflows/ci.yml                            # exits 1
grep -q '^  - .benchmarks' pnpm-workspace.yaml                           # exits 1
grep -q '"bench":' package.json                                          # exits 1
grep -qi 'benchmark' README.md                                           # exits 1
pnpm install                                                             # succeeds; lockfile updates as benchmarks deps drop
pnpm build                                                               # succeeds; benchmarks isn't in the build graph anymore
pnpm test                                                                # same pass/fail profile as pre-removal (no test in benchmarks/ was relied on by other packages)
```

Acceptance criteria:

1. The 6 commands above produce the expected exit codes / outcomes.
2. Other packages still build and test as before — the bench was a leaf consumer; nothing depends on it.
3. The CI lint/build/test jobs still pass on the resulting tree.

## Files to touch

**Delete (recursive):**
- `benchmarks/` (everything: src, results, node_modules, dist, package.json, README.md, etc.)

**Delete (single file):**
- `website/site/docs/benchmarks.md`

**Modify:**
- `.github/workflows/ci.yml` — remove the entire `bench-gate` job: from the line `  bench-gate:` (around line 114) through the last `if: always()` step belonging to that job. Confirm afterwards that no other job has `needs: [bench-gate]`.
- `pnpm-workspace.yaml` — remove the line that reads `  - 'benchmarks'` (currently around line 8).
- `package.json` — remove the `"bench": "pnpm --filter @storely/benchmarks run bench",` script entry from the `scripts` block (currently around line 22). If a trailing comma is left dangling, fix it.
- `README.md` — remove the directory-listing line `benchmarks/       Competitive benchmarks vs keyv and cache-manager` (currently around line 52) and the paragraph that begins "A competitive benchmark suite comparing storely against `keyv` and `cache-manager` …" (currently around line 57). Both are referenced by line number for orientation; the editor should match on text content, not line numbers, in case the file has drifted.

**Untouched (history):**
- `docs/superpowers/specs/2026-05-07-storely-benchmark-supremacy-design.md`
- `docs/superpowers/specs/2026-05-09-bench-coverage-design.md`
- `docs/superpowers/plans/2026-05-07-storely-benchmark-supremacy.md`
- `docs/superpowers/plans/2026-05-09-bench-coverage.md`
- All commits in the existing log.

## Risks

- **Lockfile drift.** `benchmarks` was a workspace package; its deps will be pruned on `pnpm install`. Acceptable; the lockfile updates atomically as part of the same commit.
- **CI matrix references.** If any other workflow references `bench-gate` (e.g., as a required check or a `needs:` dependency), removing it could break those. Mitigation: grep `.github/workflows/` for `bench-gate` references after editing — there should be exactly one (the job itself).
- **Docs site build.** If the docusaurus config (`website/`) explicitly registers `benchmarks.md` in its sidebar, removing the file may break the docs build. Mitigation: check `website/site/sidebars.*` for explicit references; if found, remove the entry there too.
- **External readers.** Anyone with a bookmark to the published benchmarks page (e.g., `https://storely.example/docs/benchmarks`) will get a 404 after the next docs deploy. Acceptable; the page was misleading anyway.
- **Regret.** If perf measurement turns out to matter again, this design will need to be reversed. The git log preserves everything; resurrection is a `git revert` away. The specs/plans we deliberately kept describe how the work was structured.

## Out of scope

- Replacing the bench with a different perf-measurement mechanism (CPU profiling, perf-tracking via `node --prof`, etc.). If that becomes desirable later, it gets its own spec.
- Removing the perf-related history from git. We keep it as a record.
- Changing storely's perf characteristics. The recent perf wins (Pillars 1+2+3, mysql delete fix, serializer fix) stay in the code — they were always good independent of the bench.
