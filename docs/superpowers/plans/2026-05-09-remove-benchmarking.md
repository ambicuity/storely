# Remove Benchmarking Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the entire benchmarking infrastructure (package, CI job, docs page, workspace/script/README references) in one forward-only commit on `benchmark-supremacy`.

**Architecture:** Single commit that removes a leaf workspace package and its references. No code in other packages depends on `@storely/benchmarks`, so this is purely subtractive. Specs and plans under `docs/superpowers/` are deliberately preserved as historical record.

**Tech Stack:** pnpm workspace (`pnpm-workspace.yaml`), GitHub Actions CI (`.github/workflows/ci.yml`), docula docs site (`website/site/`).

**Spec:** `docs/superpowers/specs/2026-05-09-remove-benchmarking-design.md`

---

## Pre-flight notes

- Repo has unrelated unstaged changes at start of this work: `storage/postgres/test/delete-many-batch.test.ts` (formatting), `storage/sqlite/test/testdb.sqlite`, `storage/sqlite/test/testdb2.sqlite`, plus untracked `benchmarks/results/2026-05-09T*.json|.md` files. The untracked result files live inside `benchmarks/` and disappear when the directory is deleted in Task 2 — no special handling needed. The postgres/sqlite changes are unrelated to this spec; **stash them before starting** so the bench-removal commit stays clean.
- Branch must be `benchmark-supremacy` throughout. Do not switch branches.
- Single commit: do **not** commit between tasks. Stage everything at the end and commit once in Task 9.

---

### Task 1: Pre-flight — confirm state and stash unrelated changes

**Files:** none modified; working-tree-only operations.

- [ ] **Step 1: Confirm branch is `benchmark-supremacy`**

Run: `git rev-parse --abbrev-ref HEAD`
Expected output: `benchmark-supremacy`

If it says anything else, stop and ask the user — do not switch branches yourself.

- [ ] **Step 2: Stash the unrelated unstaged changes**

Run:
```bash
git stash push -m "pre-bench-removal: unrelated working-tree changes" \
  storage/postgres/test/delete-many-batch.test.ts \
  storage/sqlite/test/testdb.sqlite \
  storage/sqlite/test/testdb2.sqlite
```

Expected: a "Saved working directory" message. If `git stash push` reports "No local changes to save" for any path, that path was already clean — that's fine, continue.

- [ ] **Step 3: Confirm working tree no longer shows those files modified**

Run: `git status --porcelain | grep -E "(postgres/test/delete-many-batch|sqlite/test/testdb)"`
Expected: empty output (exit code 1).

The `benchmarks/results/2026-05-09T*` files in `git status --porcelain` output are still expected — they will be removed by `rm -rf benchmarks/` in Task 2.

---

### Task 2: Delete the `benchmarks/` package

**Files:**
- Delete (recursive): `benchmarks/`

- [ ] **Step 1: Delete the directory**

Run: `rm -rf benchmarks/`

- [ ] **Step 2: Verify deletion**

Run: `test ! -d benchmarks/ && echo "ok"`
Expected output: `ok`

---

### Task 3: Delete the orphan website docs page

**Files:**
- Delete: `website/site/docs/benchmarks.md`

- [ ] **Step 1: Delete the file**

Run: `rm website/site/docs/benchmarks.md`

- [ ] **Step 2: Verify deletion**

Run: `test ! -f website/site/docs/benchmarks.md && echo "ok"`
Expected output: `ok`

- [ ] **Step 3: Sanity check — no other docs file references it**

Run: `grep -rn "benchmarks" website/site/ 2>/dev/null | grep -v node_modules`
Expected: empty output (exit code 1). The only references at start of work were inside `website/site/docs/benchmarks.md` itself, which is now gone.

If this step finds matches, inspect them — there may be a sidebar or index page that needs the bench entry removed. Report findings before continuing.

---

### Task 4: Remove the `bench-gate` job from CI

**Files:**
- Modify: `.github/workflows/ci.yml` (delete lines 110–152, the `bench-gate` job and its preceding `# ---` comment block)

- [ ] **Step 1: Apply the edit**

Use the Edit tool. The exact `old_string` to remove (this is the entire trailing block from the existing file, starting after the previous job's last step):

```
      # Always stop containers so they don't linger between retries or reruns.
      - name: Stop Docker test services
        if: always()
        run: pnpm test:services:stop

  # ---------------------------------------------------------------------------
  # Bench gate — runs the competitive benchmark suite and asserts every cell is
  # within tolerance vs keyv/cache-manager. Long-running; pinned to a timeout.
  # ---------------------------------------------------------------------------
  bench-gate:
    name: Bench gate
    runs-on: ubuntu-latest
    needs: [build, test]
    # Full sweep across 12 backends × 2 modes × {crud, batch} suites.
    # Empirically ~90–135 min on GH-hosted ubuntu-latest after the bench
    # coverage expansion. Bumped from 45 to 120 in the bench-coverage PR.
    timeout-minutes: 120

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          run_install: false

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm build

      - name: Start Docker test services
        run: pnpm test:services:start

      - name: Run benchmark sweep
        run: pnpm --filter @storely/benchmarks bench

      - name: Run regression gate
        run: pnpm --filter @storely/benchmarks gate

      - name: Stop Docker test services
        if: always()
        run: pnpm test:services:stop
```

The `new_string` (keep just the `test` job's last `Stop Docker test services` step, drop everything after it):

```
      # Always stop containers so they don't linger between retries or reruns.
      - name: Stop Docker test services
        if: always()
        run: pnpm test:services:stop
```

- [ ] **Step 2: Verify `bench-gate` is gone**

Run: `grep -q 'bench-gate' .github/workflows/ci.yml && echo "still there" || echo "ok"`
Expected output: `ok`

- [ ] **Step 3: Verify no other workflow references `bench-gate`**

Run: `grep -rn "bench-gate" .github/`
Expected: empty output (exit code 1). At start of work, the only reference was inside ci.yml itself.

If this step finds anything (e.g., a `needs: [bench-gate]` in another job/workflow, or a branch protection-style required-check reference), inspect and remove or report.

- [ ] **Step 4: Verify the resulting yaml is structurally valid**

Run: `pnpm exec js-yaml .github/workflows/ci.yml > /dev/null && echo "yaml ok"`
Expected output: `yaml ok` (the project already has `js-yaml` as a devDep). If `js-yaml` CLI isn't on path, fall back to `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`.

---

### Task 5: Remove `benchmarks` from pnpm workspace

**Files:**
- Modify: `pnpm-workspace.yaml` (remove the `  - 'benchmarks'` entry on line 8)

- [ ] **Step 1: Apply the edit**

Use the Edit tool.

`old_string`:
```
  - 'website'
  - 'benchmarks'
minimumReleaseAge: 2880
```

`new_string`:
```
  - 'website'
minimumReleaseAge: 2880
```

- [ ] **Step 2: Verify removal**

Run: `grep -q "benchmarks" pnpm-workspace.yaml && echo "still there" || echo "ok"`
Expected output: `ok`

---

### Task 6: Remove `bench` script from root `package.json`

**Files:**
- Modify: `package.json` (remove the `"bench": ...` line on line 22)

- [ ] **Step 1: Apply the edit**

Use the Edit tool.

`old_string`:
```
    "test:services:stop": "chmod +x ./scripts/test-services-stop.sh && ./scripts/test-services-stop.sh",
    "bench": "pnpm --filter @storely/benchmarks run bench",
    "website:build": "pnpm recursive --filter @storely/website run website:build",
```

`new_string`:
```
    "test:services:stop": "chmod +x ./scripts/test-services-stop.sh && ./scripts/test-services-stop.sh",
    "website:build": "pnpm recursive --filter @storely/website run website:build",
```

- [ ] **Step 2: Verify removal and valid JSON**

Run: `grep -q '"bench":' package.json && echo "still there" || echo "ok"`
Expected output: `ok`

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('json ok')"`
Expected output: `json ok`

---

### Task 7: Remove benchmarking from root `README.md`

**Files:**
- Modify: `README.md` (remove the `benchmarks/` directory-listing line and the `# Benchmarks` section)

- [ ] **Step 1: Remove the directory-listing line**

The line to remove is inside a fenced code block in README.md (around line 52). Match with one line of context for uniqueness; do **not** include the surrounding ``` fences in `old_string`.

Use the Edit tool with:

- `old_string` (two lines):
  - `website/          Documentation website`
  - `benchmarks/       Competitive benchmarks vs keyv and cache-manager`
- `new_string` (one line):
  - `website/          Documentation website`

- [ ] **Step 2: Remove the `# Benchmarks` section**

Use the Edit tool.

`old_string`:
```

# Benchmarks

A competitive benchmark suite comparing storely against `keyv` and `cache-manager` across all shared backends lives in [`benchmarks/`](benchmarks/). Run with `pnpm bench` (start Docker test services first for non-memory backends). Latest results are published as a [docs site page](website/site/docs/benchmarks.md) and in [`benchmarks/results/`](benchmarks/results/).

# Packages
```

`new_string`:
```

# Packages
```

- [ ] **Step 3: Verify all benchmark mentions are gone**

Run: `grep -ni "benchmark" README.md && echo "still there" || echo "ok"`
Expected output: `ok`

---

### Task 8: Run validation suite

This task runs the spec's full validation block. Each step must pass before committing.

- [ ] **Step 1: Run the 6 spec assertions**

Run:
```bash
test ! -d benchmarks/ && echo "1 ok"
test ! -f website/site/docs/benchmarks.md && echo "2 ok"
grep -q 'bench-gate' .github/workflows/ci.yml && echo "3 fail" || echo "3 ok"
grep -q "^  - 'benchmarks'" pnpm-workspace.yaml && echo "4 fail" || echo "4 ok"
grep -q '"bench":' package.json && echo "5 fail" || echo "5 ok"
grep -qi 'benchmark' README.md && echo "6 fail" || echo "6 ok"
```

Expected output (six lines):
```
1 ok
2 ok
3 ok
4 ok
5 ok
6 ok
```

If any line says `fail`, go back to the matching task (1=Task 2, 2=Task 3, 3=Task 4, 4=Task 5, 5=Task 6, 6=Task 7) and fix.

- [ ] **Step 2: `pnpm install` — lockfile updates as benchmarks deps drop**

Run: `pnpm install`
Expected: install succeeds; `pnpm-lock.yaml` is modified (deps for `@storely/benchmarks` and its transitive-only dependencies — `benchmark`, `cache-manager`, `keyv`, `@keyv/*` — are pruned). No errors.

- [ ] **Step 3: `pnpm build`**

Run: `pnpm build`
Expected: every workspace package builds successfully. `@storely/benchmarks` is no longer in the build graph.

- [ ] **Step 4: `pnpm test` (lighter verification — full sweep is slow and Docker-dependent)**

If Docker test services are already running locally, run the full suite:
```bash
pnpm test
```
Expected: same pass/fail profile as before the removal — the bench was a leaf consumer, no other package's tests depended on it. If Docker isn't available, skip the full suite and at minimum run a non-Docker package to confirm vitest still works:
```bash
cd core/storely && pnpm test
```
Expected: storely core tests pass (no Docker needed).

If `pnpm test` fails for reasons unrelated to bench (e.g., test infrastructure flakiness, Docker service not started), document the failure but do not block the commit on it — pre-existing failures aren't this PR's responsibility. New failures introduced by the bench removal *do* block the commit.

---

### Task 9: Commit

**Files:** all changes from Tasks 2–7 plus `pnpm-lock.yaml` from Task 8.

- [ ] **Step 1: Review staged contents**

Run: `git status`
Expected modified/deleted entries:
- deleted: many files under `benchmarks/`
- deleted: `website/site/docs/benchmarks.md`
- modified: `.github/workflows/ci.yml`
- modified: `pnpm-workspace.yaml`
- modified: `package.json`
- modified: `README.md`
- modified: `pnpm-lock.yaml`

You should **not** see `storage/postgres/test/delete-many-batch.test.ts` or the sqlite testdb files — those are stashed.

- [ ] **Step 2: Stage the changes**

Run:
```bash
git add -A benchmarks/ website/site/docs/benchmarks.md \
  .github/workflows/ci.yml pnpm-workspace.yaml package.json README.md \
  pnpm-lock.yaml
```

(The `-A` form on the deleted directory ensures `git` records the deletions.)

- [ ] **Step 3: Re-confirm nothing unrelated is staged**

Run: `git diff --cached --name-only | grep -v -E "^(benchmarks/|website/site/docs/benchmarks\.md|\.github/workflows/ci\.yml|pnpm-workspace\.yaml|package\.json|README\.md|pnpm-lock\.yaml)$"`
Expected: empty output. If anything else is listed, unstage it (`git reset HEAD <path>`) before committing.

- [ ] **Step 4: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
mono - chore: remove benchmarking infrastructure

The benchmarks/ package, its CI gate, and the orphan website docs page
have not earned their keep. Full sweeps take 12+ hours, hang on adapter
batch ops, and the corrected baseline showed parity rather than the
dramatic gaps the project was named for. Single forward-only commit
deletes benchmarks/, website/site/docs/benchmarks.md, the bench-gate CI
job, and the workspace/script/README references. Specs and plans under
docs/superpowers/ stay as historical record per the design.

Spec: docs/superpowers/specs/2026-05-09-remove-benchmarking-design.md
Plan: docs/superpowers/plans/2026-05-09-remove-benchmarking.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify the commit landed**

Run: `git log -1 --stat | head -30`
Expected: HEAD is the new commit; the stat shows the deletions and modifications listed above.

---

### Task 10: Restore the stashed unrelated changes

- [ ] **Step 1: Pop the stash**

Run: `git stash pop`
Expected: the postgres/sqlite changes from Task 1 reappear in the working tree, unstaged. No conflicts (the bench commit didn't touch those files).

If `git stash pop` reports a conflict, inspect — but it shouldn't, given those files weren't part of this commit's changeset.

- [ ] **Step 2: Confirm final state**

Run: `git status`
Expected: clean except for the originally-unrelated working-tree changes (the postgres test format tweak and the sqlite testdb files), exactly mirroring the pre-Task-1 state minus the now-deleted `benchmarks/results/*` untracked files.

Done.

---

## Self-review notes

- **Spec coverage:** Tasks 2–7 each map to one of the spec's six "Files to touch" entries; Task 8 runs the spec's six validation commands plus `pnpm install/build/test`; Task 9 is the single forward commit the spec mandates.
- **Risks from spec covered:** Lockfile drift (Task 8 step 2), CI cross-references (Task 4 step 3), docs site sidebar references (Task 3 step 3 — confirmed not present at write time but step exists for safety).
- **Single-commit invariant:** Tasks 2–8 mutate the working tree without committing; only Task 9 commits. Task 1 stashes unrelated changes so they don't leak in; Task 10 restores them.
