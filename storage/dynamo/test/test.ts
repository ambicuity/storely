// biome-ignore-all lint/suspicious/noExplicitAny: this is a test file
import process from "node:process";
import { ResourceInUseException } from "@aws-sdk/client-dynamodb";
import { faker } from "@faker-js/faker";
import { storageTestSuite, storelyTestSuite } from "@storely/test-suite";
import Storely from "storely";
import { beforeEach, describe, it, vi } from "vitest";
import StorelyDynamo, { createStorely } from "../src/index.js";

process.env.AWS_ACCESS_KEY_ID = "dummyAccessKeyId";
process.env.AWS_SECRET_ACCESS_KEY = "dummySecretAccessKey";
process.env.AWS_REGION = "local";

const dynamoURL = "http://localhost:8000";
const storelyDynamodb = new StorelyDynamo({
	endpoint: dynamoURL,
	tableName: faker.string.uuid(),
});
const store = () => new StorelyDynamo({ endpoint: dynamoURL, tableName: faker.string.uuid() });

storelyTestSuite(it, Storely, store);
storageTestSuite(it, store, { iterator: false, ttl: false });

beforeEach(async () => {
	const storely = store();
	await storely.clear();
});

it("should ensure table creation", async (t) => {
	const store = new StorelyDynamo({
		endpoint: dynamoURL,
		tableName: faker.string.uuid(),
	});
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await store.set(key, value);
	await t.expect(store.get(key)).resolves.toBe(value);
});

it("should be able to create a storely instance", (t) => {
	const storely = new Storely<string>({ store: storelyDynamodb });
	t.expect((storely.store as StorelyDynamo).endpoint).toEqual(dynamoURL);
});

it("should be able to create a storely instance with namespace", (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL, namespace: "test" });
	t.expect(store.endpoint).toEqual(dynamoURL);
	t.expect(store.namespace).toEqual("test");
});

it(".clear() entire cache store with default namespace", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	t.expect(await store.clear()).toBeUndefined();
});

it(".clear() entire cache store with namespace", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL, namespace: "test" });
	t.expect(await store.clear()).toBeUndefined();
});

it(".clear() an empty store should not fail", async () => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	await store.clear();
	await store.clear();
});

it("should emit error when not ResourceNotFoundException on ensureTable", async (t) => {
	const store = new StorelyDynamo({
		endpoint: dynamoURL,
		tableName: "invalid_table%&#@",
	});

	const expectedError = new Promise((_resolve, reject) => {
		store.on("error", reject);
	});
	await t.expect(expectedError).rejects.toThrow(Error);
});

it("should handle scan result with undefined Items", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });

	// Mock the scan method to return undefined Items
	const originalScan = (store as any).client.scan;
	(store as any).client.scan = vi.fn().mockResolvedValueOnce({
		Items: undefined,
	});

	t.expect(await store.clear()).toBeUndefined();
	(store as any).client.scan = originalScan;
});

it("should handle namespace filtering when namespace is undefined", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL, namespace: undefined });

	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await store.set(key, value);

	t.expect(await store.clear()).toBeUndefined();
});

it("should handle ResourceInUseException when table already exists (fallback to wait for table to be created)", async (t) => {
	const store = new StorelyDynamo({
		endpoint: dynamoURL,
		tableName: faker.string.uuid(),
	});

	const originalSend = (store as any).client.send;
	(store as any).client.send = vi.fn().mockImplementation((command) => {
		if (command.constructor.name === "CreateTableCommand") {
			// Call CreateTableCommand twice to trigger the ResourceInUseException
			originalSend.call((store as any).client, command).catch(() => {});
		}

		return originalSend.call((store as any).client, command);
	});

	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await store.set(key, value);
	(store as any).client.send = originalSend;
	await t.expect(store.get(key)).resolves.toBe(value);
});

it("should wait for table when it exists but is not ACTIVE", async (t) => {
	const tableName = faker.string.uuid();

	// First create a store and table
	const store = new StorelyDynamo({
		endpoint: dynamoURL,
		tableName,
	});
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await store.set(key, value);

	// Now test ensureTable directly with a mocked CREATING status
	let describeCallCount = 0;
	const originalSend = (store as any).client.send;
	(store as any).client.send = vi.fn().mockImplementation(async (command) => {
		if (command.constructor.name === "DescribeTableCommand") {
			describeCallCount++;
			if (describeCallCount === 1) {
				// First call returns CREATING status
				return {
					Table: {
						TableName: tableName,
						TableStatus: "CREATING",
					},
				};
			}
		}
		return originalSend.call((store as any).client, command);
	});

	// Call ensureTable directly - this should hit the CREATING branch
	await store.ensureTable(tableName);
	t.expect(describeCallCount).toBeGreaterThanOrEqual(1);
	(store as any).client.send = originalSend;
});

it("should verify exposed client property", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	t.expect(store.client).toBeDefined();
	t.expect(store.client).toHaveProperty("send");
	t.expect(store.client).toHaveProperty("get");
	t.expect(store.client).toHaveProperty("put");
	t.expect(store.client).toHaveProperty("delete");
	t.expect(store.client).toHaveProperty("batchGet");
	t.expect(store.client).toHaveProperty("batchWrite");
	t.expect(store.client).toHaveProperty("scan");
});

it("should handle ResourceInUseException and wait for table", { timeout: 10000 }, async (t) => {
	const tableName = faker.string.uuid();
	const store = new StorelyDynamo({
		endpoint: dynamoURL,
		tableName,
	});

	// First create the table
	const key1 = faker.string.uuid();
	const value1 = faker.lorem.word();
	await store.set(key1, value1);

	// Now create another store instance that will hit ResourceInUseException
	const store2 = new StorelyDynamo({
		endpoint: dynamoURL,
		tableName,
	});

	const originalSend = (store2 as any).client.send;
	let createTableCalled = false;
	(store2 as any).client.send = vi.fn().mockImplementation(async (command) => {
		if (command.constructor.name === "CreateTableCommand" && !createTableCalled) {
			createTableCalled = true;
			throw new ResourceInUseException({
				message: "Table already being created",
				$metadata: {},
			});
		}
		return originalSend.call((store2 as any).client, command);
	});

	// This should wait for the table to exist
	const key2 = faker.string.uuid();
	const value2 = faker.lorem.word();
	await store2.set(key2, value2);
	t.expect(await store2.get(key2)).toBe(value2);
	(store2 as any).client.send = originalSend;
});

it("formatKey prefixes key and avoids double prefix", (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	store.namespace = "ns";
	t.expect(store.formatKey("key")).toBe("ns:key");
	t.expect(store.formatKey("ns:key")).toBe("ns:key");
	store.namespace = undefined;
	t.expect(store.formatKey("key")).toBe("key");
});

it("createKeyPrefix returns prefixed key when namespace is set", (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	t.expect(store.createKeyPrefix("key", "ns")).toBe("ns:key");
	t.expect(store.createKeyPrefix("key")).toBe("key");
	t.expect(store.createKeyPrefix("key", undefined)).toBe("key");
});

it("removeKeyPrefix strips prefix when namespace is set", (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	t.expect(store.removeKeyPrefix("ns:key", "ns")).toBe("key");
	t.expect(store.removeKeyPrefix("key")).toBe("key");
	t.expect(store.removeKeyPrefix("key", undefined)).toBe("key");
});

it("keyPrefixSeparator getter and setter", (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	t.expect(store.keyPrefixSeparator).toBe(":");
	store.keyPrefixSeparator = "::";
	t.expect(store.keyPrefixSeparator).toBe("::");
	t.expect(store.createKeyPrefix("key", "ns")).toBe("ns::key");
});

it("client getter and setter", (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	const originalClient = store.client;
	t.expect(originalClient).toBeDefined();
	const newStore = new StorelyDynamo({ endpoint: dynamoURL });
	store.client = newStore.client;
	t.expect(store.client).toBe(newStore.client);
});

it("defaultTtl getter and setter", (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	t.expect(store.defaultTtl).toBeUndefined();
	store.defaultTtl = 1000;
	t.expect(store.defaultTtl).toBe(1000);
});

it("get/set with namespace", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await store.set(key, value);
	t.expect(await store.get(key)).toBe(value);
});

it("delete with namespace", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	await store.set(key, faker.lorem.word());
	t.expect(await store.delete(key)).toBe(true);
	t.expect(await store.get(key)).toBeUndefined();
});

it("has returns false for expired key", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	const key = faker.string.uuid();
	// Set with a TTL of 0ms so it expires immediately (expiresAt will be ~now+1s)
	await store.set(key, "value", 0);
	// Manually overwrite with an already-expired expiresAt
	await store.client.put({
		TableName: store.tableName,
		Item: {
			id: store.formatKey(key),
			value: "value",
			expiresAt: Math.floor(Date.now() / 1000) - 10,
		},
	});
	t.expect(await store.has(key)).toBe(false);
});

it("hasMany returns false for expired keys", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL });
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	await store.set(key1, "value1");
	await store.set(key2, "value2");
	// Overwrite key1 with an expired expiresAt
	await store.client.put({
		TableName: store.tableName,
		Item: {
			id: store.formatKey(key1),
			value: "value1",
			expiresAt: Math.floor(Date.now() / 1000) - 10,
		},
	});
	const results = await store.hasMany([key1, key2]);
	t.expect(results).toEqual([false, true]);
});

describe("createStorely", () => {
	it("should create Storely instance with default options", (t) => {
		const storely = createStorely();
		t.expect(storely).toBeDefined();
		t.expect(storely.store).toBeInstanceOf(StorelyDynamo);
		t.expect(storely.namespace).toBeUndefined();
		t.expect((storely.store as StorelyDynamo).namespace).toBeUndefined();
	});

	it("should create Storely instance with string endpoint", (t) => {
		const storely = createStorely(dynamoURL);
		t.expect(storely).toBeDefined();
		t.expect(storely.store).toBeInstanceOf(StorelyDynamo);
		t.expect(storely.namespace).toBeUndefined();
		t.expect((storely.store as StorelyDynamo).namespace).toBeUndefined();

		t.expect((storely.store as StorelyDynamo).endpoint).toBe(dynamoURL);
	});

	it("should create Storely instance with custom namespace", (t) => {
		const namespace = faker.string.alphanumeric(10);
		const storely = createStorely({ endpoint: dynamoURL, namespace });
		t.expect(storely).toBeDefined();
		t.expect(storely.store).toBeInstanceOf(StorelyDynamo);
		t.expect(storely.namespace).toBe(namespace);
		t.expect((storely.store as StorelyDynamo).namespace).toBe(namespace);

		t.expect((storely.store as StorelyDynamo).endpoint).toBe(dynamoURL);
	});

	it("should create Storely instance with custom table name", (t) => {
		const tableName = faker.string.alphanumeric(10);
		const storely = createStorely({ endpoint: dynamoURL, tableName });
		t.expect(storely).toBeDefined();
		t.expect(storely.store).toBeInstanceOf(StorelyDynamo);
		t.expect(storely.namespace).toBeUndefined();
		t.expect((storely.store as StorelyDynamo).namespace).toBeUndefined();

		t.expect((storely.store as StorelyDynamo).tableName).toBe(tableName);
	});

	it("should create Storely instance with both namespace and table name", (t) => {
		const namespace = faker.string.alphanumeric(10);
		const tableName = faker.string.alphanumeric(10);
		const storely = createStorely({ endpoint: dynamoURL, namespace, tableName });
		t.expect(storely).toBeDefined();
		t.expect(storely.store).toBeInstanceOf(StorelyDynamo);
		t.expect(storely.namespace).toBe(namespace);
		t.expect((storely.store as StorelyDynamo).namespace).toBe(namespace);

		t.expect((storely.store as StorelyDynamo).tableName).toBe(tableName);
	});

	it("should create functional Storely instance that can store and retrieve values", async (t) => {
		const storely = createStorely({ endpoint: dynamoURL });
		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await storely.set(key, value);
		const retrieved = await storely.get(key);
		t.expect(retrieved).toBe(value);

		await storely.delete(key);
		const deletedValue = await storely.get(key);
		t.expect(deletedValue).toBeUndefined();
	});

	it("should create functional Storely instance with namespace that can store and retrieve values", async (t) => {
		const namespace = faker.string.alphanumeric(10);
		const storely = createStorely({ endpoint: dynamoURL, namespace });
		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await storely.set(key, value);
		const retrieved = await storely.get(key);
		t.expect(retrieved).toBe(value);

		// Create another Storely instance with same namespace to verify it can access the same data
		const storely2 = createStorely({ endpoint: dynamoURL, namespace });
		const retrieved2 = await storely2.get(key);
		t.expect(retrieved2).toBe(value);

		await storely.delete(key);
		const deletedValue = await storely.get(key);
		t.expect(deletedValue).toBeUndefined();
	});

	it("should handle various data types with createStorely", async (t) => {
		const storely = createStorely({ endpoint: dynamoURL });

		// Test with string
		const stringKey = faker.string.uuid();
		const stringValue = faker.lorem.sentence();
		await storely.set(stringKey, stringValue);
		t.expect(await storely.get(stringKey)).toBe(stringValue);

		// Test with number
		const numberKey = faker.string.uuid();
		const numberValue = faker.number.float({ max: 1000 });
		await storely.set(numberKey, numberValue);
		t.expect(await storely.get(numberKey)).toBe(numberValue);

		// Test with boolean
		const boolKey = faker.string.uuid();
		const boolValue = faker.datatype.boolean();
		await storely.set(boolKey, boolValue);
		t.expect(await storely.get(boolKey)).toBe(boolValue);

		// Test with object
		const objectKey = faker.string.uuid();
		const objectValue = {
			id: faker.string.uuid(),
			name: faker.person.fullName(),
			count: faker.number.int({ max: 100 }),
			active: faker.datatype.boolean(),
			nested: {
				field1: faker.lorem.word(),
				field2: faker.number.float({ max: 50 }),
			},
			array: [faker.string.uuid(), faker.string.uuid(), faker.string.uuid()],
		};
		await storely.set(objectKey, objectValue);
		t.expect(await storely.get(objectKey)).toEqual(objectValue);

		// Test with array
		const arrayKey = faker.string.uuid();
		const arrayValue = [
			faker.string.uuid(),
			faker.number.float({ max: 100 }),
			faker.datatype.boolean(),
			{ id: faker.string.uuid() },
			[1, 2, 3],
		];
		await storely.set(arrayKey, arrayValue);
		t.expect(await storely.get(arrayKey)).toEqual(arrayValue);

		// Test with Date object
		const dateKey = faker.string.uuid();
		const dateValue = faker.date.recent();
		await storely.set(dateKey, dateValue);
		const retrievedDate = await storely.get(dateKey);
		t.expect(retrievedDate).toBe(dateValue.toISOString());

		// Clean up
		await storely.delete(stringKey);
		await storely.delete(numberKey);
		await storely.delete(boolKey);
		await storely.delete(objectKey);
		await storely.delete(arrayKey);
		await storely.delete(dateKey);
	});
});

it("setMany returns false entries when batchWrite fails", async (t) => {
	const dynamo = store();
	dynamo.on("error", () => {});
	// Wait for table to be ready before mocking
	await dynamo.set("_warmup", "ok");
	// Mock batchWrite to simulate failure
	const originalBatchWrite = dynamo._client.batchWrite.bind(dynamo._client);
	dynamo._client.batchWrite = async () => {
		throw new Error("batchWrite failure");
	};

	const result = await dynamo.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
	]);
	t.expect(result).toEqual([false, false]);
	dynamo._client.batchWrite = originalBatchWrite;
});

it("setMany marks unprocessed items as false", async (t) => {
	const dynamo = store();
	dynamo.on("error", () => {});
	// Wait for table to be ready before mocking
	await dynamo.set("_warmup", "ok");
	// Mock batchWrite to return UnprocessedItems for the second key
	const key2Formatted = dynamo.formatKey("key2");
	dynamo._client.batchWrite = async (input: any) => {
		const tableName = Object.keys(input.RequestItems)[0];
		return {
			UnprocessedItems: {
				[tableName]: [{ PutRequest: { Item: { id: key2Formatted } } }],
			},
		};
	};

	const result = await dynamo.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
	]);
	t.expect(result?.[0]).toBe(true);
	t.expect(result?.[1]).toBe(false);
});

it("setMany with per-entry ttl", async (t) => {
	const dynamo = new StorelyDynamo({ endpoint: dynamoURL });
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const result = await dynamo.setMany([
		{ key: key1, value: "val1", ttl: 5000 },
		{ key: key2, value: "val2" },
	]);
	t.expect(result).toEqual([true, true]);
	t.expect(await dynamo.get(key1)).toBe("val1");
	t.expect(await dynamo.get(key2)).toBe("val2");
});

it("setMany handles unprocessed items with missing id", async (t) => {
	const dynamo = store();
	await dynamo.set("_warmup", "ok");
	dynamo._client.batchWrite = async (input: any) => {
		const tableName = Object.keys(input.RequestItems)[0];
		return {
			UnprocessedItems: {
				[tableName]: [{ PutRequest: { Item: {} } }],
			},
		};
	};
	const result = await dynamo.setMany([{ key: "key1", value: "val1" }]);
	t.expect(result).toEqual([true]);
});

it("getMany retries unprocessed keys", async (t) => {
	const dynamo = store();
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	await dynamo.set(key1, "val1");
	await dynamo.set(key2, "val2");

	const originalBatchGet = dynamo._client.batchGet.bind(dynamo._client);
	let callCount = 0;
	dynamo._client.batchGet = async (input: any) => {
		callCount++;
		if (callCount === 1) {
			const tableName = Object.keys(input.RequestItems)[0];
			return {
				UnprocessedKeys: {
					[tableName]: {
						Keys: [{ id: dynamo.formatKey(key1) }, { id: dynamo.formatKey(key2) }],
					},
				},
			};
		}
		return originalBatchGet(input);
	};

	const result = await dynamo.getMany([key1, key2]);
	t.expect(result).toEqual(["val1", "val2"]);
	t.expect(callCount).toBe(2);
	dynamo._client.batchGet = originalBatchGet;
});

it("iterator with default namespace", async (t) => {
	const store = new StorelyDynamo({ endpoint: dynamoURL, tableName: faker.string.uuid() });
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	await store.set(key1, "val1");
	await store.set(key2, "val2");

	const entries: Array<[string, string]> = [];
	for await (const entry of store.iterator()) {
		entries.push(entry as [string, string]);
	}

	t.expect(entries.length).toBe(2);
	const keys = entries.map(([key]) => key);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

it("iterator with namespace", async (t) => {
	const tableName = faker.string.uuid();
	const namespace = faker.string.alphanumeric(10);
	const store = new StorelyDynamo({ endpoint: dynamoURL, tableName, namespace });
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	await store.set(key1, "val1");
	await store.set(key2, "val2");

	// Also set a key without the namespace directly
	const storeNoNs = new StorelyDynamo({ endpoint: dynamoURL, tableName });
	await storeNoNs.set("no-ns-key", "val3");

	const entries: Array<[string, string]> = [];
	for await (const entry of store.iterator()) {
		entries.push(entry as [string, string]);
	}

	// Should only return the 2 namespaced keys
	t.expect(entries.length).toBe(2);
	const keys = entries.map(([key]) => key);
	t.expect(keys).toContain(`${namespace}:${key1}`);
	t.expect(keys).toContain(`${namespace}:${key2}`);
});

it("hasMany retries unprocessed keys", async (t) => {
	const dynamo = store();
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	await dynamo.set(key1, "val1");
	await dynamo.set(key2, "val2");

	const originalBatchGet = dynamo._client.batchGet.bind(dynamo._client);
	let callCount = 0;
	dynamo._client.batchGet = async (input: any) => {
		callCount++;
		if (callCount === 1) {
			const tableName = Object.keys(input.RequestItems)[0];
			return {
				UnprocessedKeys: {
					[tableName]: {
						Keys: [{ id: dynamo.formatKey(key1) }, { id: dynamo.formatKey(key2) }],
					},
				},
			};
		}
		return originalBatchGet(input);
	};

	const result = await dynamo.hasMany([key1, key2]);
	t.expect(result).toEqual([true, true]);
	t.expect(callCount).toBe(2);
	dynamo._client.batchGet = originalBatchGet;
});
