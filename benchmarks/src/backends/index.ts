import type { BackendFactory } from "../types.js";
import { etcdBackend } from "./etcd.js";
import { keydbBackend } from "./keydb.js";
import { memcacheBackend } from "./memcache.js";
import { memoryBackend } from "./memory.js";
import { mongoBackend } from "./mongo.js";
import { mysqlBackend } from "./mysql.js";
import { postgresBackend } from "./postgres.js";
import { redisBackend } from "./redis.js";
import { sqliteBackend } from "./sqlite.js";
import { valkeyBackend } from "./valkey.js";

export const allBackends: BackendFactory[] = [
	memoryBackend,
	redisBackend,
	sqliteBackend,
	mysqlBackend,
	postgresBackend,
	mongoBackend,
	memcacheBackend,
	etcdBackend,
	valkeyBackend,
	keydbBackend,
];
