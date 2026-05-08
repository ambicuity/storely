import Storely, { StorelyJsonSerializer, StorelyMemoryAdapter } from "storely";
import { it } from "vitest";
import { StorelyLz4TestAdapter } from "../src/compression-adapter.js";
import { StorelyAes256TestAdapter } from "../src/encryption-adapter.js";
import {
	compressionTestSuite,
	encryptionTestSuite,
	serializationTestSuite,
	storageTestSuite,
	storelyIteratorTests,
	storelyTestSuite,
} from "../src/index.js";

const storeExtended = () => {
	class MapExtend extends Map {}

	return new MapExtend();
};

storelyTestSuite(it, Storely, storeExtended);
storelyIteratorTests(it, Storely, storeExtended);
compressionTestSuite(it, new StorelyLz4TestAdapter());

// Storage-level tests using StorelyMemoryAdapter
const memoryStore = () => new StorelyMemoryAdapter(new Map());
storageTestSuite(it, memoryStore);

// Serialization tests using built-in JSON serializer
serializationTestSuite(it, new StorelyJsonSerializer());

// Encryption tests using AES-256-GCM test adapter
encryptionTestSuite(it, new StorelyAes256TestAdapter("test-secret-key"));
