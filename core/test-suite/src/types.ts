import type { StorelyStorageAdapter } from "@ambicuity/core";

/** Factory function that returns a Storely-compatible store instance. Used by Storely-wrapper test suites. */
// biome-ignore lint/suspicious/noExplicitAny: type format
export type StorelyStoreFn = () => StorelyStorageAdapter | any;

/**
 * A test registration function compatible with vitest's `it` or `test`.
 * Passed into test suite functions so tests register under the caller's test runner.
 */
export type TestFunction = (
	name: string,
	// biome-ignore lint/suspicious/noExplicitAny: minimal vitest context type
	fn: (context: { expect: (...args: any[]) => any }) => void | Promise<void>,
) => void;

/** Factory function that returns a {@link StorelyStorageAdapter} instance. Used by storage-level test suites. */
export type StorageFn = () => StorelyStorageAdapter;

/**
 * Options for configuring storage-level test suites.
 * Boolean flags control which test groups run (all default to `true`).
 */
export type StorageTestOptions = {
	/** Value returned by get() for missing/expired keys. Default: undefined */
	missingValue?: undefined | null;
	/** Enable basic CRUD tests (set/get/delete/has/clear). Default: true */
	basic?: boolean;
	/** Enable batch operation tests (setMany/getMany/hasMany/deleteMany). Default: true */
	batch?: boolean;
	/** Enable iterator tests. Default: true */
	iterator?: boolean;
	/** Enable TTL tests. Default: true */
	ttl?: boolean;
	/** Enable namespace getter/setter test. Default: true */
	namespace?: boolean;
	/** Enable disconnect test. Default: true */
	disconnect?: boolean;
	/**
	 * Enable concurrency / interleaving tests. Default: false.
	 * Opt-in because not every adapter is provisioned for heavy parallel
	 * load in the standard test environment.
	 */
	concurrency?: boolean;
	/**
	 * Enable chaos / adapter-failure-mode tests. Default: false.
	 * Requires the harness to control backend lifecycle (pause/kill/restart)
	 * — opt in only when running under a chaos-enabled test runner.
	 */
	chaos?: boolean;
	/**
	 * Maximum time a single chaos-op may block before it's considered a hang.
	 * Default: 10_000 ms. Tune to match the adapter's `commandTimeout`.
	 */
	chaosTimeoutMs?: number;
};
