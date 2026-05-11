// biome-ignore-all lint/suspicious/noExplicitAny: keydb

import { Storely } from "@ambicuity/storely";
import type { RedisClientOptions, RedisClientType } from "@redis/client";
import StorelyKeyDB from "./index.js";
import type { StorelyKeyDBOptions } from "./types.js";

/**
 * Will create a Storely instance with the KeyDB adapter. This will also set the namespace.
 * @param connect - How to connect to the KeyDB server. If string pass in the url, if object pass in the options, if RedisClient pass in the client. If nothing is passed in, it will default to 'keydb://localhost:6378'.
 * @param {StorelyKeyDBOptions} options - Options for the adapter such as namespace, keyPrefixSeparator, and clearBatchSize.
 * @returns {Storely} - Storely instance with the KeyDB adapter
 */
export function createStorelyKeyDB(
	connect?: string | RedisClientOptions | RedisClientType,
	options?: StorelyKeyDBOptions,
): Storely {
	connect ??= "keydb://localhost:6378";
	const adapter = new StorelyKeyDB(connect, options);

	if (options?.namespace) {
		adapter.namespace = options.namespace;
		const storely = new Storely(adapter, {
			namespace: options?.namespace,
		});

		if (options?.throwOnConnectError) {
			// Set the throwOnError in Storely so it throws
			storely.throwOnErrors = true;
		}

		if (options?.throwOnErrors) {
			// Set the throwOnError in Storely so it throws
			storely.throwOnErrors = true;
		}

		return storely;
	}

	const storely = new Storely(adapter);

	if (options?.throwOnConnectError) {
		// Set the throwOnError in Storely so it throws
		storely.throwOnErrors = true;
	}

	if (options?.throwOnErrors) {
		// Set the throwOnError in Storely so it throws
		storely.throwOnErrors = true;
	}

	storely.namespace = undefined; // Ensure no namespace is set
	return storely;
}

export function createStorelyKeyDBNonBlocking(
	connect?: string | RedisClientOptions | RedisClientType,
	options?: StorelyKeyDBOptions,
): Storely {
	const storely = createStorelyKeyDB(connect, options);

	const storelyStore = storely.store as StorelyKeyDB<any>;

	storelyStore.throwOnConnectError = false;
	storelyStore.throwOnErrors = false;

	const keydbClient = storelyStore.client as RedisClientType;
	/* v8 ignore next -- @preserve */
	if (keydbClient.options) {
		keydbClient.options.disableOfflineQueue = true;
		if (keydbClient.options.socket) {
			keydbClient.options.socket.reconnectStrategy = false;
		}
	}

	storely.throwOnErrors = false;

	return storely;
}
