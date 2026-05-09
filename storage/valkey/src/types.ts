import type { Cluster, Redis as RedisInstance, RedisOptions } from "iovalkey";

export type StorelyValkeyOptions = RedisOptions & {
	uri?: string;
	useSets?: boolean;
};

export type StorelyUriOptions = string | StorelyValkeyOptions | RedisInstance | Cluster;
