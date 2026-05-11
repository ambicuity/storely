/**
 * Hand-authored navigation tree. Lives alongside content collections so docs
 * order can be edited without touching layout files.
 */

export interface NavItem {
	label: string;
	href: string;
}

export interface NavGroup {
	title: string;
	items: NavItem[];
}

export const docsNav: NavGroup[] = [
	{
		title: "Start",
		items: [
			{ label: "Getting started", href: "/docs/getting-started/" },
			{ label: "Core API", href: "/docs/core/" },
			{ label: "BigMap", href: "/docs/bigmap/" },
		],
	},
	{
		title: "Storage adapters",
		items: [
			{ label: "Overview", href: "/adapters/" },
			{ label: "Redis", href: "/adapters/redis/" },
			{ label: "PostgreSQL", href: "/adapters/postgres/" },
			{ label: "SQLite", href: "/adapters/sqlite/" },
			{ label: "MySQL", href: "/adapters/mysql/" },
			{ label: "MongoDB", href: "/adapters/mongo/" },
			{ label: "Valkey", href: "/adapters/valkey/" },
			{ label: "RocksDB", href: "/adapters/rocksdb/" },
			{ label: "KeyDB", href: "/adapters/keydb/" },
			{ label: "Memcache", href: "/adapters/memcache/" },
			{ label: "Etcd", href: "/adapters/etcd/" },
			{ label: "DynamoDB", href: "/adapters/dynamo/" },
		],
	},
	{
		title: "Pipeline",
		items: [
			{ label: "Compression", href: "/docs/compression/" },
			{ label: "Encryption", href: "/docs/encryption/" },
			{ label: "Serialization", href: "/docs/serialization/" },
			{ label: "Observability", href: "/docs/observability/" },
		],
	},
	{
		title: "Guides",
		items: [
			{ label: "Caching with Express", href: "/guides/caching-express/" },
			{ label: "Caching with Fastify", href: "/guides/caching-fastify/" },
			{ label: "Caching with Koa", href: "/guides/caching-koa/" },
			{ label: "Caching with NestJS", href: "/guides/caching-nestjs/" },
			{ label: "Caching with Node", href: "/guides/caching-node/" },
			{ label: "Caching in JavaScript", href: "/guides/caching-javascript/" },
		],
	},
	{
		title: "Project",
		items: [
			{ label: "Third-party adapters", href: "/third-party/" },
		],
	},
];

export interface AdapterEntry {
	slug: string;
	name: string;
	npm: string;
	tier: "production" | "beta" | "experimental";
	tagline: string;
	source: string;
}

export const adapters: AdapterEntry[] = [
	{
		slug: "redis",
		name: "Redis",
		npm: "@ambicuity/redis",
		tier: "production",
		tagline: "Battle-tested key-value store. Cluster and sentinel ready.",
		source: "storage/redis",
	},
	{
		slug: "postgres",
		name: "PostgreSQL",
		npm: "@ambicuity/postgres",
		tier: "production",
		tagline: "ACID storage backed by a real relational engine.",
		source: "storage/postgres",
	},
	{
		slug: "sqlite",
		name: "SQLite",
		npm: "@ambicuity/sqlite",
		tier: "production",
		tagline: "Local file storage. WAL mode opt-in. Multi-driver.",
		source: "storage/sqlite",
	},
	{
		slug: "mysql",
		name: "MySQL",
		npm: "@ambicuity/mysql",
		tier: "beta",
		tagline: "Per-instance pool with safe SSL handshake.",
		source: "storage/mysql",
	},
	{
		slug: "mongo",
		name: "MongoDB",
		npm: "@ambicuity/mongo",
		tier: "beta",
		tagline: "Documents and GridFS for large blobs.",
		source: "storage/mongo",
	},
	{
		slug: "valkey",
		name: "Valkey",
		npm: "@ambicuity/valkey",
		tier: "beta",
		tagline: "Redis-protocol fork with bounded batch operations.",
		source: "storage/valkey",
	},
	{
		slug: "rocksdb",
		name: "RocksDB",
		npm: "@ambicuity/rocksdb",
		tier: "beta",
		tagline: "Embedded LSM tree, lazy expiration, compression.",
		source: "storage/rocksdb",
	},
	{
		slug: "keydb",
		name: "KeyDB",
		npm: "@ambicuity/keydb",
		tier: "experimental",
		tagline: "Multithreaded Redis-protocol server.",
		source: "storage/keydb",
	},
	{
		slug: "memcache",
		name: "Memcache",
		npm: "@ambicuity/memcache",
		tier: "experimental",
		tagline: "Classic in-memory cache with namespaced flushes.",
		source: "storage/memcache",
	},
	{
		slug: "etcd",
		name: "etcd",
		npm: "@ambicuity/etcd",
		tier: "experimental",
		tagline: "Distributed KV via lease-based TTL.",
		source: "storage/etcd",
	},
	{
		slug: "dynamo",
		name: "DynamoDB",
		npm: "@ambicuity/dynamo",
		tier: "experimental",
		tagline: "Managed AWS storage with TTL attribute.",
		source: "storage/dynamo",
	},
];

export const tierLabel: Record<AdapterEntry["tier"], string> = {
	production: "Production-ready",
	beta: "Beta",
	experimental: "Experimental",
};

export const tierBlurb: Record<AdapterEntry["tier"], string> = {
	production:
		"Hardened in real deployments. Stable API, complete test coverage, recommended for new projects.",
	beta:
		"Feature-complete but awaiting load testing. Use with caution in production; report issues.",
	experimental:
		"Functional but not load-tested. Ship for early integration; do not put live traffic on these yet.",
};
