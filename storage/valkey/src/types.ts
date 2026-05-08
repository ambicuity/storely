import type { Cluster, Redis, RedisOptions } from "iovalkey";

export type StorelyValkeyOptions = RedisOptions & {
	uri?: string;
	useSets?: boolean;
};

export type StorelyUriOptions = string | StorelyValkeyOptions | Redis | Cluster;
