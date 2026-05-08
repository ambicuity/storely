import { faker } from "@faker-js/faker";
import { beforeEach, it } from "vitest";
import StorelyPostgres from "../src/index.js";
import { endAllPools } from "../src/pool.js";

const postgresUri = "postgresql://postgres:postgres@localhost:5433/storely_test";

const options = { ssl: { rejectUnauthorized: false } };

const store = () => new StorelyPostgres({ uri: postgresUri, iterationLimit: 2, ...options });

beforeEach(async () => {
	const storely = new StorelyPostgres({ uri: postgresUri, ...options });
	await storely.clear();
});

it("throws if ssl is not used", async (t) => {
	await endAllPools();
	try {
		const storely = new StorelyPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		await storely.get(key);
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	} finally {
		await endAllPools();
	}
});

it("iterator with default namespace", async (t) => {
	const storely = new StorelyPostgres({ uri: postgresUri, ...options });
	const key1 = faker.string.alphanumeric(10);
	const value1 = faker.lorem.sentence();
	const key2 = faker.string.alphanumeric(10);
	const value2 = faker.lorem.sentence();
	const key3 = faker.string.alphanumeric(10);
	const value3 = faker.lorem.sentence();
	await storely.set(key1, value1);
	await storely.set(key2, value2);
	await storely.set(key3, value3);

	const keys: string[] = [];
	const values: string[] = [];
	for await (const [key, value] of storely.iterator()) {
		keys.push(key);
		values.push(value as string);
	}

	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
	t.expect(keys).toContain(key3);
	t.expect(values).toContain(value1);
	t.expect(values).toContain(value2);
	t.expect(values).toContain(value3);
});

it(".clear() with undefined namespace", async (t) => {
	const storely = store();
	t.expect(await storely.clear()).toBeUndefined();
});

it("close connection successfully", async (t) => {
	const storely = store();
	const key = faker.string.alphanumeric(10);
	t.expect(await storely.get(key)).toBeUndefined();
	await storely.disconnect();
	try {
		await storely.get(key);
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});
