import { Storely } from "@ambicuity/ambicore";
import { compressionTestSuite } from "@ambicuity/test-suite";
import { it } from "vitest";
import StorelyGzip from "../src/index.js";

compressionTestSuite(it, new StorelyGzip());

it("object type compression/decompression", async (t) => {
	const storely = new StorelyGzip();
	const testValue = JSON.stringify({
		my: "super",
		puper: [456, 567],
		awesome: "pako",
	});
	const compressed = await storely.compress(testValue);
	const decompressed = await storely.decompress(compressed);
	t.expect(decompressed).toEqual(testValue);
});

it("compress returns a base64 string", async (t) => {
	const storely = new StorelyGzip();
	const compressed = await storely.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
});

it("options at class level", async (t) => {
	const storely = new StorelyGzip({ compress: { chunkSize: 32 * 1024 } });
	const compressed = await storely.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
	const decompressed = await storely.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

it("decompress should not throw error when empty with gzip", async (t) => {
	const storely = new Storely({ store: new Map(), compression: new StorelyGzip() });
	await t.expect(storely.get("foo")).resolves.not.toThrowError();
});

it("should not throw error when empty", async (t) => {
	const storely = new Storely({ store: new Map() });
	await t.expect(storely.get("foo")).resolves.not.toThrowError();
});
