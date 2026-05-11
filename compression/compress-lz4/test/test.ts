import { Storely } from "@ambicuity/storely-core";
import { compressionTestSuite } from "@ambicuity/test-suite";
import { it } from "vitest";
import StorelyLz4 from "../src/index.js";

compressionTestSuite(it, new StorelyLz4());

it("object type compression/decompression", async (t) => {
	const storely = new StorelyLz4();
	const value = JSON.stringify({
		a: 1,
		b: "test",
		c: true,
	});
	const compressed = await storely.compress(value);
	const decompressed = await storely.decompress(compressed);
	t.expect(decompressed).toEqual(value);
});

it("compression with dictionary option", async (t) => {
	const storely = new StorelyLz4("test");
	const compressed = await storely.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
	const decompressed = await storely.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

it("decompress should not throw error when empty with lz4", async (t) => {
	const storely = new Storely({ store: new Map(), compression: new StorelyLz4() });
	await t.expect(storely.get("foo")).resolves.not.toThrowError();
});

it("should not throw error when empty", async (t) => {
	const storely = new Storely({ store: new Map() });
	await t.expect(storely.get("foo")).resolves.not.toThrowError();
});
