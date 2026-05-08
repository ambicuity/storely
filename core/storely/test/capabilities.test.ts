import { describe, expect, test } from "vitest";
import {
	detectStorely,
	detectStorelyCompression,
	detectStorelyEncryption,
	detectStorelySerialization,
	detectStorelyStorage,
} from "../src/capabilities.js";
import { Storely } from "../src/index.js";

const none = { exists: false, methodType: "none" };
const sync = { exists: true, methodType: "sync" };

describe("capabilities", () => {
	describe("detectStorely", () => {
		test("should return all false for null, undefined, non-objects, and empty objects", () => {
			for (const input of [null, undefined, "string", {}]) {
				const result = detectStorely(input);
				expect(result.compatible).toBe(false);
				expect(result.methods.get).toEqual(none);
				expect(result.methods.set).toEqual(none);
				expect(result.properties.hooks).toBe(false);
				expect(result.properties.stats).toBe(false);
			}
		});

		test("should detect Map capabilities (not a full Storely)", () => {
			const result = detectStorely(new Map());
			expect(result.compatible).toBe(false);
			expect(result.methods.get.exists).toBe(true);
			expect(result.methods.set.exists).toBe(true);
			expect(result.methods.delete.exists).toBe(true);
			expect(result.methods.clear.exists).toBe(true);
			expect(result.methods.has.exists).toBe(true);
			expect(result.methods.getMany.exists).toBe(false);
		});

		test("should detect all capabilities on a Storely instance", () => {
			const storely = new Storely();
			const result = detectStorely(storely);
			expect(result.compatible).toBe(true);
			expect(result.methods.get.exists).toBe(true);
			expect(result.methods.set.exists).toBe(true);
			expect(result.methods.delete.exists).toBe(true);
			expect(result.methods.clear.exists).toBe(true);
			expect(result.methods.has.exists).toBe(true);
			expect(result.methods.getMany.exists).toBe(true);
			expect(result.methods.setMany.exists).toBe(true);
			expect(result.methods.deleteMany.exists).toBe(true);
			expect(result.methods.hasMany.exists).toBe(true);
			expect(result.methods.disconnect.exists).toBe(true);
			expect(result.methods.getRaw.exists).toBe(true);
			expect(result.methods.getManyRaw.exists).toBe(true);
			expect(result.methods.setRaw.exists).toBe(true);
			expect(result.methods.setManyRaw.exists).toBe(true);
			expect(result.methods.iterator.exists).toBe(true);
			expect(result.properties.hooks).toBe(true);
			expect(result.properties.stats).toBe(true);
		});

		test("should detect Storely with custom store", () => {
			expect(detectStorely(new Storely({ store: new Map() })).compatible).toBe(true);
		});

		test("should handle partial objects and non-function properties", () => {
			// Partial Storely-like object
			const r1 = detectStorely({ get: () => {}, set: () => {}, delete: () => {}, clear: () => {} });
			expect(r1.compatible).toBe(false);
			expect(r1.methods.get.exists).toBe(true);
			expect(r1.methods.set.exists).toBe(true);
			expect(r1.properties.hooks).toBe(false);

			// Only some methods
			const r2 = detectStorely({ get: () => {}, set: () => {} });
			expect(r2.compatible).toBe(false);
			expect(r2.methods.get.exists).toBe(true);
			expect(r2.methods.delete.exists).toBe(false);

			// Non-function properties are not detected as methods
			const r3 = detectStorely({ get: "not a function", set: "not a function" });
			expect(r3.methods.get.exists).toBe(false);
			expect(r3.methods.set.exists).toBe(false);

			// Partial many methods
			const r4 = detectStorely({
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				getMany: () => {},
				hooks: {},
				stats: {},
			});
			expect(r4.compatible).toBe(false);
			expect(r4.methods.getMany.exists).toBe(true);
			expect(r4.methods.setMany.exists).toBe(false);
		});

		test("should detect hooks and stats as properties", () => {
			const result = detectStorely({
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				hooks: {},
				stats: {},
			});
			expect(result.properties.hooks).toBe(true);
			expect(result.properties.stats).toBe(true);
			expect(result.compatible).toBe(false);
		});

		test("should return compatible: true when all required properties are present", () => {
			const obj = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				has: () => {},
				getMany: () => {},
				setMany: () => {},
				deleteMany: () => {},
				hasMany: () => {},
				disconnect: () => {},
				getRaw: () => {},
				getManyRaw: () => {},
				setRaw: () => {},
				setManyRaw: () => {},
				hooks: {},
				stats: {},
				iterator: () => {},
			};
			expect(detectStorely(obj).compatible).toBe(true);
		});

		test("should report methodType for each method", () => {
			const result = detectStorely(new Map());
			expect(result.methods.get.methodType).toBe("sync");
			expect(result.methods.getMany.methodType).toBe("none");
		});
	});

	describe("detectStorelyStorage", () => {
		const allNoneMethods = {
			get: none,
			getMany: none,
			has: none,
			hasMany: none,
			set: none,
			setMany: none,
			delete: none,
			deleteMany: none,
			clear: none,
			disconnect: none,
			iterator: none,
		};

		test("should return store none for null, undefined, non-objects, and empty objects", () => {
			for (const input of [null, undefined, "string", {}]) {
				expect(detectStorelyStorage(input)).toEqual({
					compatible: false,
					store: "none",
					methods: allNoneMethods,
				});
			}
		});

		test("should detect Map as mapLike with sync methods", () => {
			const result = detectStorelyStorage(new Map());
			expect(result.compatible).toBe(true);
			expect(result.store).toBe("mapLike");
			expect(result.methods.get).toEqual(sync);
			expect(result.methods.set).toEqual(sync);
			expect(result.methods.delete).toEqual(sync);
			expect(result.methods.clear).toEqual(sync);
			expect(result.methods.has).toEqual(sync);
			expect(result.methods.getMany).toEqual(none);
		});

		test("should detect Map with extra sync methods as mapLike", () => {
			const store = Object.assign(new Map(), {
				hasMany: () => [],
				setMany: () => {},
				deleteMany: () => [],
			});
			const result = detectStorelyStorage(store);
			expect(result.store).toBe("mapLike");
			expect(result.methods.hasMany.methodType).toBe("sync");
		});

		test("should detect async adapters and classify store types correctly", () => {
			// Core async CRUD only → asyncMap
			const asyncCore = {
				get: async () => {},
				set: async () => {},
				delete: async () => {},
				clear: async () => {},
			};
			const r1 = detectStorelyStorage(asyncCore);
			expect(r1.compatible).toBe(true);
			expect(r1.store).toBe("asyncMap");

			// Sync core without has → asyncMap (not mapLike)
			const syncNoHas = { get: () => {}, set: () => {}, delete: () => {}, clear: () => {} };
			expect(detectStorelyStorage(syncNoHas).store).toBe("asyncMap");

			// Full async adapter → storelyStorage
			const full = {
				get: async () => {},
				set: async () => {},
				delete: async () => {},
				clear: async () => {},
				has: async () => true,
				getMany: async () => [],
				setMany: async () => {},
				deleteMany: async () => true,
				hasMany: async () => [],
				disconnect: async () => {},
				iterator: async function* () {
					yield ["key", "value"];
				},
			};
			const fullResult = detectStorelyStorage(full);
			expect(fullResult.compatible).toBe(true);
			expect(fullResult.store).toBe("storelyStorage");
			expect(fullResult.methods.get.methodType).toBe("async");
			expect(fullResult.methods.iterator.methodType).toBe("sync");
		});

		test("should return none for incomplete objects and non-function properties", () => {
			const r1 = detectStorelyStorage({ get: () => {}, set: () => {} });
			expect(r1.compatible).toBe(false);
			expect(r1.store).toBe("none");
			expect(r1.methods.get.exists).toBe(true);
			expect(r1.methods.delete.exists).toBe(false);

			const r2 = detectStorelyStorage({ get: "not a function", set: "not a function" });
			expect(r2.methods.get.exists).toBe(false);
			expect(r2.methods.get.methodType).toBe("none");
		});

		test("should detect Storely.store capabilities", () => {
			const storely = new Storely();
			const result = detectStorelyStorage(storely.store);
			expect(result.methods.get.exists).toBe(true);
			expect(result.methods.set.exists).toBe(true);
		});

		test("should detect mixed sync and async method types", () => {
			const adapter = {
				get: async () => {},
				set: () => {},
				delete: async () => {},
				clear: () => {},
				has: async () => {},
				setMany: () => {},
				deleteMany: async () => {},
				hasMany: () => {},
			};
			const result = detectStorelyStorage(adapter);
			expect(result.methods.get.methodType).toBe("async");
			expect(result.methods.set.methodType).toBe("sync");
			expect(result.methods.delete.methodType).toBe("async");
			expect(result.methods.clear.methodType).toBe("sync");
		});
	});

	describe("detectStorelyCompression", () => {
		test("should return all false for null, undefined, non-objects, and empty objects", () => {
			for (const input of [null, undefined, "string", {}]) {
				const result = detectStorelyCompression(input);
				expect(result.compatible).toBe(false);
				expect(result.methods.compress).toEqual(none);
				expect(result.methods.decompress).toEqual(none);
			}
		});

		test("should detect valid compression adapter and partial adapters", () => {
			const valid = detectStorelyCompression({
				compress: (d: string) => d,
				decompress: (d: string) => d,
			});
			expect(valid.compatible).toBe(true);
			expect(valid.methods.compress.exists).toBe(true);
			expect(valid.methods.decompress.exists).toBe(true);

			const partial1 = detectStorelyCompression({ compress: (d: string) => d });
			expect(partial1.compatible).toBe(false);
			expect(partial1.methods.compress.exists).toBe(true);
			expect(partial1.methods.decompress.exists).toBe(false);

			const partial2 = detectStorelyCompression({ decompress: (d: string) => d });
			expect(partial2.compatible).toBe(false);
			expect(partial2.methods.decompress.exists).toBe(true);
		});

		test("should handle non-function properties, async functions, and extra properties", () => {
			const r1 = detectStorelyCompression({
				compress: "not a function",
				decompress: "not a function",
			});
			expect(r1.compatible).toBe(false);
			expect(r1.methods.compress.exists).toBe(false);

			const r2 = detectStorelyCompression({
				compress: async (d: string) => d,
				decompress: async (d: string) => d,
			});
			expect(r2.compatible).toBe(true);
			expect(r2.methods.compress.methodType).toBe("async");

			const extra = {
				compress: (d: string) => d,
				decompress: (d: string) => d,
				serialize: () => {},
			};
			expect(detectStorelyCompression(extra).compatible).toBe(true);
		});
	});

	describe("detectStorelySerialization", () => {
		test("should return all false for null, undefined, non-objects, and empty objects", () => {
			for (const input of [null, undefined, "string", {}]) {
				const result = detectStorelySerialization(input);
				expect(result.compatible).toBe(false);
				expect(result.methods.stringify).toEqual(none);
				expect(result.methods.parse).toEqual(none);
			}
		});

		test("should detect valid serialization adapter and partial adapters", () => {
			const valid = detectStorelySerialization({
				stringify: (o: unknown) => JSON.stringify(o),
				parse: (d: string) => JSON.parse(d),
			});
			expect(valid.compatible).toBe(true);
			expect(valid.methods.stringify.exists).toBe(true);

			expect(
				detectStorelySerialization({ stringify: (o: unknown) => JSON.stringify(o) }).compatible,
			).toBe(false);
			expect(detectStorelySerialization({ parse: (d: string) => JSON.parse(d) }).compatible).toBe(
				false,
			);
		});

		test("should handle non-function properties, JSON object, and extra properties", () => {
			expect(
				detectStorelySerialization({ stringify: "not a function", parse: "not a function" })
					.compatible,
			).toBe(false);
			expect(detectStorelySerialization(JSON).compatible).toBe(true);
			expect(detectStorelySerialization(JSON).methods.stringify.methodType).toBe("sync");

			const extra = {
				stringify: (o: unknown) => JSON.stringify(o),
				parse: (d: string) => JSON.parse(d),
				compress: () => {},
			};
			expect(detectStorelySerialization(extra).compatible).toBe(true);
		});
	});

	describe("detectStorelyEncryption", () => {
		test("should return all false for null, undefined, non-objects, and empty objects", () => {
			for (const input of [null, undefined, "string", {}]) {
				const result = detectStorelyEncryption(input);
				expect(result.compatible).toBe(false);
				expect(result.methods.encrypt).toEqual(none);
				expect(result.methods.decrypt).toEqual(none);
			}
		});

		test("should detect valid encryption adapter and partial adapters", () => {
			const valid = detectStorelyEncryption({
				encrypt: (d: string) => d,
				decrypt: (d: string) => d,
			});
			expect(valid.compatible).toBe(true);
			expect(valid.methods.encrypt.exists).toBe(true);

			expect(detectStorelyEncryption({ encrypt: (d: string) => d }).compatible).toBe(false);
			expect(detectStorelyEncryption({ decrypt: (d: string) => d }).compatible).toBe(false);
		});

		test("should handle non-function properties, async functions, and extra properties", () => {
			expect(
				detectStorelyEncryption({ encrypt: "not a function", decrypt: "not a function" })
					.compatible,
			).toBe(false);

			const r2 = detectStorelyEncryption({
				encrypt: async (d: string) => d,
				decrypt: async (d: string) => d,
			});
			expect(r2.compatible).toBe(true);
			expect(r2.methods.encrypt.methodType).toBe("async");

			const extra = { encrypt: (d: string) => d, decrypt: (d: string) => d, algorithm: "AES" };
			expect(detectStorelyEncryption(extra).compatible).toBe(true);
		});
	});
});
