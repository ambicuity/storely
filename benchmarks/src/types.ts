export type LibraryName = "storely" | "keyv" | "cache-manager";

export type BackendName =
	| "memory"
	| "redis"
	| "sqlite"
	| "mysql"
	| "postgres"
	| "mongo"
	| "memcache"
	| "etcd"
	| "valkey"
	| "keydb"
	| "dynamo"
	| "rocksdb";

export type Mode = "defaults" | "json";

export type Operation =
	| "get"
	| "set"
	| "delete"
	| "has"
	| "getMany"
	| "setMany"
	| "deleteMany";

export interface BenchClient {
	name: LibraryName;
	get(key: string): Promise<unknown>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
	has(key: string): Promise<boolean>;
	getMany(keys: string[]): Promise<Array<unknown>>;
	setMany(entries: Array<[string, unknown]>): Promise<void>;
	deleteMany(keys: string[]): Promise<void>;
	clear(): Promise<void>;
	disconnect(): Promise<void>;
	/** Operations this client emulates via Promise.all of singles. Footnoted in reports. */
	fallbacks?: Operation[];
}

export interface BackendFactory {
	name: BackendName;
	available(): Promise<boolean>;
	build(mode: Mode): Promise<BenchClient[]>;
}

export interface ResultRow {
	backend: BackendName;
	library: LibraryName;
	operation: Operation;
	mode: Mode;
	valueSize?: number;
	batchSize?: number;
	hz: number;
	rme: number;
	samples: number;
	mean: number;
	fallback: boolean;
}
