export type RocksDBCompression = "none" | "snappy" | "zstd" | "zlib" | "bzip2";

export type RocksDBLogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "header" | null;

export type StorelyRocksDBOptions = {
	/**
	 * Connection URI for RocksDB.
	 * - `rocksdb://:memory:` for in-memory (temp directory) storage
	 * - `rocksdb:///absolute/path/to/db` for file-based storage
	 * - `rocksdb://./relative/path` for relative path storage
	 * @default 'rocksdb://:memory:'
	 */
	uri?: string;

	/**
	 * Open database in read-only mode.
	 * @default false
	 */
	readOnly?: boolean;

	/**
	 * Create database if it doesn't exist.
	 * @default true
	 */
	createIfMissing?: boolean;

	/**
	 * Throw error if database already exists.
	 * @default false
	 */
	errorIfExists?: boolean;

	/**
	 * RocksDB compression type.
	 * @default 'snappy'
	 */
	compression?: RocksDBCompression;

	/**
	 * Interval in milliseconds between automatic expired-entry cleanup runs.
	 * 0 disables automatic cleanup.
	 * @default 0
	 */
	clearExpiredInterval?: number;

	/**
	 * Number of entries to fetch per iteration batch.
	 * @default 100
	 */
	iterationLimit?: number;

	/**
	 * RocksDB log verbosity level.
	 * `null` disables logging entirely.
	 * @default 'warn'
	 */
	infoLogLevel?: RocksDBLogLevel;
};

export enum RocksDBErrorMessages {
	/**
	 * Error message when the database is not open.
	 */
	DBNotOpen = "Database is not open",
	/**
	 * Error message when the URI format is invalid.
	 */
	InvalidURI = "Invalid RocksDB URI format",
	/**
	 * Error message when the database is opened in read-only mode and a write is attempted.
	 */
	ReadOnly = "Database is opened in read-only mode",
	/**
	 * Error message when the database already exists and errorIfExists is true.
	 */
	DBExists = "Database already exists",
}
