# `@storely/sqlite` Operations

## Latency expectations

Reference numbers from `perf-baselines/sqlite.json`. SQLite is in-process; latency is dominated by disk fsync timing, not network.

## Tuning

- **`wal: true`** — strongly recommended for any production deployment that has more than one reader or any concurrent writer. The default is `false` to match SQLite's standard, but WAL is the right choice for almost everyone.
- **`busyTimeoutMs`** — tune if you see "database is locked" errors. Default is driver-dependent.
- **Driver selection** — adapter auto-detects `better-sqlite3` vs `sqlite3` vs `node:sqlite` (Node 22+). Prefer `better-sqlite3` where available.

## Failure modes

- **`database is locked`**: WAL off + concurrent writers. Turn WAL on.
- **Disk full**: writes will throw a SQLite error. Catch on the calling layer.
- **Corruption from kill -9 during write**: WAL is journaled; recovery happens on next open. Without WAL, you may lose the last in-progress transaction.

## Known limitations

- Cluster 4 added `*.sqlite*` to `.gitignore` and removed previously-tracked test artefacts. Application-side `.sqlite` files are your responsibility.
- Multi-process readers across the same file rely on WAL. Document this in your deployment.
- `clear()` is a `DELETE FROM`; for very large tables, consider `DROP TABLE; CREATE TABLE` instead.
