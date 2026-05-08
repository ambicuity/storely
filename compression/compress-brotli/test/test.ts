import { constants as zlibConstants } from "node:zlib";
import { compressionTestSuite } from "@storely/test-suite";
import { it } from "vitest";
import StorelyBrotli from "../src/index.js";

const { BROTLI_PARAM_MODE, BROTLI_PARAM_QUALITY } = zlibConstants;

compressionTestSuite(it, new StorelyBrotli());

it("compression with compression options", async (t) => {
	const options = {
		compressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
				[BROTLI_PARAM_QUALITY]: 7,
			},
		},
	};

	const storely = new StorelyBrotli(options);
	const compressed = await storely.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
	const decompressed = await storely.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

it("decompression with decompression options", async (t) => {
	const options = {
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
			},
		},
	};

	const storely = new StorelyBrotli(options);
	const compressed = await storely.compress("whatever");
	const decompressed = await storely.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

it("compression/decompression with compression/decompression options", async (t) => {
	const options = {
		compressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
			},
		},
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
			},
		},
	};

	const storely = new StorelyBrotli(options);
	const compressed = await storely.compress("whatever");
	const decompressed = await storely.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});
