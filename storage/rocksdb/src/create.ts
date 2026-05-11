import Storely from "@ambicuity/ambicore";
import StorelyRocksDB from "./index.js";
import type { StorelyRocksDBOptions } from "./types.js";

/**
 * Creates a Storely instance with the RocksDB adapter.
 * @param storelyOptions - A RocksDB connection URI string or a StorelyRocksDBOptions configuration object.
 * @returns A new Storely instance backed by RocksDB.
 */
export const createStorelyRocksDB = (storelyOptions?: StorelyRocksDBOptions | string): Storely => {
	const adapter = new StorelyRocksDB(storelyOptions);

	if (typeof storelyOptions === "object" && storelyOptions?.namespace) {
		return new Storely({ store: adapter, namespace: storelyOptions.namespace });
	}

	return new Storely({ store: adapter });
};

/**
 * Creates a Storely instance with the RocksDB adapter in non-blocking mode.
 * Disables throwOnErrors and does not await the connection promise.
 * @param storelyOptions - A RocksDB connection URI string or a StorelyRocksDBOptions configuration object.
 * @returns A new Storely instance backed by RocksDB.
 */
export const createStorelyRocksDBNonBlocking = (
	storelyOptions?: StorelyRocksDBOptions | string,
): Storely => {
	const storely = createStorelyRocksDB(storelyOptions);
	const store = storely.store as StorelyRocksDB;
	store.throwOnErrors = false;
	storely.throwOnErrors = false;
	return storely;
};
