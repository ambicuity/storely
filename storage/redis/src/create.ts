// biome-ignore-all lint/suspicious/noExplicitAny: redis

import { Storely } from "@ambicuity/storely-core";
import type { RedisClientOptions, RedisClientType } from "@redis/client";
import StorelyRedis from "./index.js";
import type { StorelyRedisOptions } from "./types.js";

/**
 * Will create a Storely instance with the Redis adapter. This will also set the namespace.
 * @param connect - How to connect to the Redis server. If string pass in the url, if object pass in the options, if RedisClient pass in the client. If nothing is passed in, it will default to 'redis://localhost:6379'.
 * @param {StorelyRedisOptions} options - Options for the adapter such as namespace, keyPrefixSeparator, and clearBatchSize.
 * @returns {Storely} - Storely instance with the Redis adapter
 */
export function createStorely(
	connect?: string | RedisClientOptions | RedisClientType,
	options?: StorelyRedisOptions,
): Storely {
	connect ??= "redis://localhost:6379";
	const adapter = new StorelyRedis(connect, options);

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

export function createStorelyNonBlocking(
	connect?: string | RedisClientOptions | RedisClientType,
	options?: StorelyRedisOptions,
): Storely {
	const storely = createStorely(connect, options);

	const storelyStore = storely.store as StorelyRedis<any>;

	storelyStore.throwOnConnectError = false;
	storelyStore.throwOnErrors = false;

	const redisClient = storelyStore.client as RedisClientType;
	/* v8 ignore next -- @preserve */
	if (redisClient.options) {
		redisClient.options.disableOfflineQueue = true;
		if (redisClient.options.socket) {
			redisClient.options.socket.reconnectStrategy = false;
		}
	}

	storely.throwOnErrors = false;

	return storely;
}
