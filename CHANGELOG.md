# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Starting with `1.0.0`, releases are generated from [Changesets](https://github.com/changesets/changesets) entries in [`.changeset/`](./.changeset/). See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the contributor workflow.

## 1.0.0 — 2026-05-11

Initial stable release. See [`README.md`](./README.md) for installation and a quickstart; each package ships its own `README.md` with API and usage details.

### Packages

#### Core

- [`storely`](./core/storely) — main key-value interface with hooks, events, stats, namespaces, TTL, and pluggable serialization/compression/encryption.
- [`@storely/test-suite`](./core/test-suite) — shared compliance test suite for storage adapters.
- [`@storely/bigmap`](./core/bigmap) — sharded in-memory `Map` implementation.

#### Storage adapters

- Production-ready: [`@storely/redis`](./storage/redis), [`@storely/sqlite`](./storage/sqlite), [`@storely/postgres`](./storage/postgres).
- Beta: [`@storely/mysql`](./storage/mysql), [`@storely/mongo`](./storage/mongo), [`@storely/valkey`](./storage/valkey), [`@storely/rocksdb`](./storage/rocksdb).
- Experimental: [`@storely/keydb`](./storage/keydb), [`@storely/memcache`](./storage/memcache), [`@storely/etcd`](./storage/etcd), [`@storely/dynamo`](./storage/dynamo).

#### Serialization

- [`@storely/serialize-superjson`](./serialization/superjson), [`@storely/serialize-msgpackr`](./serialization/msgpackr). The built-in JSON serializer (with binary/BigInt round-trip and a `*`-sentinel optimization for envelopes without an expiry) ships inside `storely`.

#### Compression

- [`@storely/compress-gzip`](./compression/compress-gzip) (RFC 1952), [`@storely/compress-brotli`](./compression/compress-brotli), [`@storely/compress-lz4`](./compression/compress-lz4) (requires Node ≥ 20).

#### Encryption

- [`@storely/encrypt-node`](./encryption/encrypt-node) (Node `crypto`) and [`@storely/encrypt-web`](./encryption/encrypt-web) (Web Crypto). AES-GCM and ChaCha20-Poly1305 AEAD; PBKDF2 `deriveKey()` defaults to 600,000 iterations (OWASP 2024). Ciphertext carries a 4-byte `STv0` magic prefix.

#### Observability

- [`@storely/otel`](./observability/otel) — first-party OpenTelemetry adapter (peer-dep only). Emits counters for hit/miss/set/delete/error, histograms for `get`/`set` durations, and spans around the hook lifecycle.

### API surface

The exported types and methods listed in each package's `README.md` are the supported public surface. Future breaking changes require a major version bump.

### Security

`SECURITY.md` directs vulnerability reports to GitHub's Private Security Advisory flow. `tar` is pinned `>= 7.5.9` via `pnpm.overrides`; `pnpm-workspace.yaml` enforces `minimumReleaseAge: 2880` (two days) to mitigate supply-chain risk.
