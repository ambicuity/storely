import type { BackendFactory } from "../types.js";
import { memoryBackend } from "./memory.js";
import { mongoBackend } from "./mongo.js";
import { mysqlBackend } from "./mysql.js";
import { postgresBackend } from "./postgres.js";
import { redisBackend } from "./redis.js";
import { sqliteBackend } from "./sqlite.js";

export const allBackends: BackendFactory[] = [
	memoryBackend,
	redisBackend,
	sqliteBackend,
	mysqlBackend,
	postgresBackend,
	mongoBackend,
];
