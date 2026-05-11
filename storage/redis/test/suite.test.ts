import { Storely } from "@ambicuity/storely";
import { storageTestSuite, storelyIteratorTests, storelyTestSuite } from "@ambicuity/test-suite";
import { afterAll, it } from "vitest";
import StorelyRedis, { type RedisClientType } from "../src/index.js";

const redisUrl = "redis://localhost:6379/5";
const store = () => new StorelyRedis(redisUrl);

afterAll(async () => {
	const client = (await store().getClient()) as RedisClientType;
	await client.flushDb();
	await store().disconnect();
});

storelyTestSuite(it, Storely, store);
storelyIteratorTests(it, Storely, store);
storageTestSuite(it, store);
