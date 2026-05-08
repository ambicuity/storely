import { storageTestSuite, storelyIteratorTests, storelyTestSuite } from "@storely/test-suite";
import { Storely } from "storely";
import { afterAll, it } from "vitest";
import StorelyKeyDB, { type RedisClientType } from "../src/index.js";

const keydbUrl = "keydb://localhost:6378/5";
const store = () => new StorelyKeyDB(keydbUrl);

afterAll(async () => {
	const client = (await store().getClient()) as RedisClientType;
	await client.flushDb();
	await store().disconnect();
});

storelyTestSuite(it, Storely, store);
storelyIteratorTests(it, Storely, store);
storageTestSuite(it, store);
