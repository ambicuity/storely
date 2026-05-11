import type StorelyModule from "@ambicuity/core";
import { storelyApiTests } from "./api.js";
import { storelyNamespaceTests } from "./namespace.js";
import { storageBasicTests } from "./storage-basic.js";
import { storageBatchTests } from "./storage-batch.js";
import { storageChaosTests } from "./storage-chaos.js";
import { storageConcurrencyTests } from "./storage-concurrency.js";
import { storageDisconnectTests } from "./storage-disconnect.js";
import { storageIteratorTests } from "./storage-iterator.js";
import { storageNamespaceTests } from "./storage-namespace.js";
import { storageTtlTests } from "./storage-ttl.js";
import type { StorageFn, StorageTestOptions, StorelyStoreFn, TestFunction } from "./types.js";
import { storelyValueTests } from "./values.js";

/**
 * Runs the full Storely-wrapper test suite: API, value types, and namespace tests.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param Storely - The Storely constructor
 * @param store - Factory that returns a fresh store instance per test
 */
const storelyTestSuite = (
	test: TestFunction,
	Storely: typeof StorelyModule,
	store: StorelyStoreFn,
) => {
	storelyApiTests(test, Storely, store);
	storelyValueTests(test, Storely, store);
	storelyNamespaceTests(test, Storely, store);
};

/**
 * Runs the full storage adapter test suite: basic CRUD, batch, iterator, TTL, namespace, and disconnect.
 * Individual test groups can be toggled off via {@link StorageTestOptions}.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param store - Factory that returns a fresh {@link StorelyStorageAdapter} instance per test
 * @param options - Configuration for missing value behavior and test group toggles
 */
const storageTestSuite = (test: TestFunction, store: StorageFn, options?: StorageTestOptions) => {
	storageBasicTests(test, store, options);
	storageBatchTests(test, store, options);
	storageIteratorTests(test, store, options);
	storageTtlTests(test, store, options);
	storageNamespaceTests(test, store, options);
	storageDisconnectTests(test, store, options);
	storageConcurrencyTests(test, store, options);
	storageChaosTests(test, store, options);
};

export { storelyApiTests } from "./api.js";
export { compressionTestSuite } from "./compression.js";
export { encryptionTestSuite } from "./encryption.js";
export { delay, delay as sleep } from "./helper.js";
export { storelyIteratorTests } from "./iterator.js";
export { storelyNamespaceTests } from "./namespace.js";
export { serializationTestSuite } from "./serialization.js";
export { storageBasicTests } from "./storage-basic.js";
export { storageBatchTests } from "./storage-batch.js";
export { storageChaosTests } from "./storage-chaos.js";
export { storageConcurrencyTests } from "./storage-concurrency.js";
export { storageDisconnectTests } from "./storage-disconnect.js";
export { storageIteratorTests } from "./storage-iterator.js";
export { storageNamespaceTests } from "./storage-namespace.js";
export { storageTtlTests } from "./storage-ttl.js";
export type { StorageFn, StorageTestOptions, StorelyStoreFn, TestFunction } from "./types.js";
export { storelyValueTests } from "./values.js";
export { storageTestSuite, storelyTestSuite };
