import type { ConnectionOptions } from "mysql2";

export type StorelyMysqlOptions = {
	uri?: string;
	table?: string;
	keyLength?: number;
	namespaceLength?: number;
	intervalExpiration?: number;
	iterationLimit?: number;
} & ConnectionOptions;
