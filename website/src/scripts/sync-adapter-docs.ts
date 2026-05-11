/**
 * Walks the monorepo, copies each adapter / pipeline package README into
 * `src/content/adapters/` (or `src/content/docs/`) as MDX with frontmatter.
 *
 * Run via `pnpm sync` before every build.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, "../../..");
const SITE = resolve(__dirname, "..");

interface PackageSource {
	collection: "adapters" | "docs";
	slug: string;
	title: string;
	npm: string;
	tier?: "production" | "beta" | "experimental";
	tagline?: string;
	readme: string;
	section?: string;
	order?: number;
}

const adapters: PackageSource[] = [
	{
		collection: "adapters",
		slug: "redis",
		title: "Redis",
		npm: "@ambicuity/redis",
		tier: "production",
		tagline: "Battle-tested key-value store. Cluster and sentinel ready.",
		readme: "storage/redis/README.md",
	},
	{
		collection: "adapters",
		slug: "postgres",
		title: "PostgreSQL",
		npm: "@ambicuity/postgres",
		tier: "production",
		tagline: "ACID storage backed by a real relational engine.",
		readme: "storage/postgres/README.md",
	},
	{
		collection: "adapters",
		slug: "sqlite",
		title: "SQLite",
		npm: "@ambicuity/sqlite",
		tier: "production",
		tagline: "Local file storage. WAL mode opt-in. Multi-driver.",
		readme: "storage/sqlite/README.md",
	},
	{
		collection: "adapters",
		slug: "mysql",
		title: "MySQL",
		npm: "@ambicuity/mysql",
		tier: "beta",
		tagline: "Per-instance pool with safe SSL handshake.",
		readme: "storage/mysql/README.md",
	},
	{
		collection: "adapters",
		slug: "mongo",
		title: "MongoDB",
		npm: "@ambicuity/mongo",
		tier: "beta",
		tagline: "Documents and GridFS for large blobs.",
		readme: "storage/mongo/README.md",
	},
	{
		collection: "adapters",
		slug: "valkey",
		title: "Valkey",
		npm: "@ambicuity/valkey",
		tier: "beta",
		tagline: "Redis-protocol fork with bounded batch operations.",
		readme: "storage/valkey/README.md",
	},
	{
		collection: "adapters",
		slug: "rocksdb",
		title: "RocksDB",
		npm: "@ambicuity/rocksdb",
		tier: "beta",
		tagline: "Embedded LSM tree, lazy expiration, compression.",
		readme: "storage/rocksdb/README.md",
	},
	{
		collection: "adapters",
		slug: "keydb",
		title: "KeyDB",
		npm: "@ambicuity/keydb",
		tier: "experimental",
		tagline: "Multithreaded Redis-protocol server.",
		readme: "storage/keydb/README.md",
	},
	{
		collection: "adapters",
		slug: "memcache",
		title: "Memcache",
		npm: "@ambicuity/memcache",
		tier: "experimental",
		tagline: "Classic in-memory cache with namespaced flushes.",
		readme: "storage/memcache/README.md",
	},
	{
		collection: "adapters",
		slug: "etcd",
		title: "etcd",
		npm: "@ambicuity/etcd",
		tier: "experimental",
		tagline: "Distributed KV via lease-based TTL.",
		readme: "storage/etcd/README.md",
	},
	{
		collection: "adapters",
		slug: "dynamo",
		title: "DynamoDB",
		npm: "@ambicuity/dynamo",
		tier: "experimental",
		tagline: "Managed AWS storage with TTL attribute.",
		readme: "storage/dynamo/README.md",
	},
];

const pipeline: PackageSource[] = [
	{
		collection: "docs",
		slug: "core",
		title: "Core API",
		npm: "@ambicuity/storely-core",
		readme: "core/storely/README.md",
		section: "Core",
		order: 2,
	},
	{
		collection: "docs",
		slug: "bigmap",
		title: "BigMap",
		npm: "@ambicuity/bigmap",
		readme: "core/bigmap/README.md",
		section: "Core",
		order: 3,
	},
	{
		collection: "docs",
		slug: "compression",
		title: "Compression",
		npm: "@ambicuity/compress-*",
		readme: "compression/compress-gzip/README.md",
		section: "Pipeline",
		order: 10,
	},
	{
		collection: "docs",
		slug: "serialization",
		title: "Serialization",
		npm: "@ambicuity/serialize-*",
		readme: "serialization/superjson/README.md",
		section: "Pipeline",
		order: 11,
	},
	{
		collection: "docs",
		slug: "encryption",
		title: "Encryption",
		npm: "@ambicuity/encrypt-*",
		readme: "encryption/encrypt-node/README.md",
		section: "Pipeline",
		order: 12,
	},
	{
		collection: "docs",
		slug: "observability",
		title: "Observability",
		npm: "@ambicuity/otel",
		readme: "observability/otel/README.md",
		section: "Pipeline",
		order: 13,
	},
];

/**
 * Rewrite mentions of `@storely/<name>` to `@ambicuity/<name>` in copied
 * READMEs so the published-namespace story is consistent across the site.
 */
function rewriteContent(content: string): string {
	return content
		.replace(/@storely\//g, "@ambicuity/")
		.replace(/`storely`/g, "`@ambicuity/storely-core`")
		.replace(/npm install storely\b/g, "npm install @ambicuity/storely-core");
}

function frontmatter(src: PackageSource): string {
	const lines = ["---"];
	lines.push(`title: ${JSON.stringify(src.title)}`);
	if (src.collection === "adapters") {
		lines.push(`slug: ${JSON.stringify(src.slug)}`);
		lines.push(`npm: ${JSON.stringify(src.npm)}`);
		lines.push(`tier: ${JSON.stringify(src.tier)}`);
		lines.push(`tagline: ${JSON.stringify(src.tagline)}`);
		lines.push(`source: ${JSON.stringify(src.readme.replace(/\/README\.md$/, ""))}`);
	} else {
		if (src.section) lines.push(`section: ${JSON.stringify(src.section)}`);
		if (src.order !== undefined) lines.push(`order: ${src.order}`);
		lines.push(`description: ${JSON.stringify(`${src.title} reference for Storely.`)}`);
	}
	lines.push("---", "");
	return lines.join("\n");
}

function emit(src: PackageSource): void {
	const readmePath = join(REPO, src.readme);
	if (!existsSync(readmePath)) {
		console.warn(`! Missing README: ${readmePath}`);
		return;
	}
	const raw = readFileSync(readmePath, "utf8");
	const body = rewriteContent(raw);
	const targetDir = join(SITE, "content", src.collection);
	mkdirSync(targetDir, { recursive: true });
	const target = join(targetDir, `${src.slug}.md`);
	writeFileSync(target, frontmatter(src) + body, "utf8");
	console.log(`  ✓ ${src.collection}/${src.slug}.md`);
}

function main(): void {
	console.log("→ sync-adapter-docs");

	for (const dir of ["adapters", "docs"]) {
		const path = join(SITE, "content", dir);
		if (existsSync(path)) {
			// Only remove generated files, preserve hand-authored ones
			// (we identify generated files by their absence from manual lists)
		}
	}

	mkdirSync(join(SITE, "content", "adapters"), { recursive: true });
	mkdirSync(join(SITE, "content", "docs"), { recursive: true });
	mkdirSync(join(SITE, "content", "guides"), { recursive: true });

	for (const src of [...adapters, ...pipeline]) {
		emit(src);
	}

	console.log("→ done");
}

main();
