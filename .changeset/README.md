# Changesets

This directory holds [Changesets](https://github.com/changesets/changesets) — files that describe what changed in a PR and which packages it affects.

## Workflow

Every PR with a behavior change must include a changeset:

```bash
pnpm changeset
```

Pick the affected packages, the bump level (`patch` / `minor` / `major`), and write a short description. The result is a Markdown file committed to this directory.

On release, Changesets aggregates the pending files into per-package CHANGELOG entries, bumps versions, and creates the release commit.

## Bump-level guide

- `patch` — bug fixes, doc updates, internal refactors with no API impact.
- `minor` — additive API changes (new methods, new options with defaults). No breaking changes.
- `major` — breaking changes (signature changes, removed exports, wire-format changes that drop legacy support).

Storely packages are **linked** — bumping any one package bumps all linked packages to the same version. This keeps the suite versioned coherently. See `config.json` for the linked list.

## Skip when

- A PR is docs-only with no shipping change (you can omit the changeset; the CI gate will allow doc-only PRs through a label).
- A PR only touches `@ambicuity/website` (it's in the `ignore` list — Changesets won't pick it up).
