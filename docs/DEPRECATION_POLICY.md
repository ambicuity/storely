# Deprecation Policy

This document describes how Storely handles deprecated exports across releases. It is the contract a consumer can rely on when planning upgrades.

## Lifecycle

A public API entity moves through three states:

1. **Stable** — fully supported, breaking changes only at a major version bump.
2. **Stable (deprecated)** — still functional and tested, but a replacement exists. Documented with `@deprecated` JSDoc and listed in [`API_STABILITY.md`](./API_STABILITY.md).
3. **Removed** — no longer exported. Removal happens in a major version (e.g. deprecated in `6.x`, removed in `7.0.0`).

## Notice window

- A deprecation must remain functional for **at least one minor version** after the release that introduces the `@deprecated` marker.
- A deprecation introduced in `6.1.0` may be removed no earlier than `7.0.0`.
- A deprecation that ships in the same release as a non-deprecated replacement does **not** start the clock until the next minor — consumers need a release where both old and new exist.

## Communication

Every deprecation must:

1. Carry a `@deprecated` JSDoc tag pointing at the replacement.
2. Appear in the release's CHANGELOG entry under a "Deprecated" subheading with a migration snippet.
3. Be listed in [`API_STABILITY.md`](./API_STABILITY.md) with its removal-target version.

## Breaking-change classes

Breaking changes that are **not** deprecations (e.g. an unfixable correctness bug requires a contract change) must:

- Land only at a major version bump.
- Carry an entry in the release's CHANGELOG under a "Breaking" subheading.
- Provide a migration code snippet wherever feasible.

## Experimental entities

Items tagged "experimental" in [`API_STABILITY.md`](./API_STABILITY.md) — including `@storely/keydb`, `@storely/memcache`, `@storely/etcd`, and `@storely/dynamo` — are **not covered by this policy**. They may change shape or be removed without a deprecation cycle. Use at your own risk.

## CVE handling

Security-driven breaking changes (e.g. a wire-format change to fix a vulnerability) override this policy. They will be:

- Released as patch versions where possible.
- Documented as breaking only when the change is unavoidable.
- Communicated via GitHub Security Advisory plus CHANGELOG.

See [`SECURITY.md`](../SECURITY.md) for the disclosure process.
