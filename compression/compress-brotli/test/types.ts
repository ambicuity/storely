import zlib from "node:zlib";
import { Storely } from "storely";
import { it } from "vitest";
import StorelyBrotli from "../src/index.js";

type MyType = {
	a?: string;
	b?: number[];
};

it("default options", async (t) => {
	const storely = new Storely({
		compression: new StorelyBrotli(),
	});

	t.expect(await storely.set("testkey", { a: "testvalue" })).toBe(true);
	t.expect(await storely.get<MyType>("testkey")).toEqual({ a: "testvalue" });
});

it("compression user defined options", async (t) => {
	const options = {
		compressOptions: {
			chunkSize: 1024,
			parameters: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			},
		},
	};

	const storely = new Storely({
		compression: new StorelyBrotli(options),
	});

	t.expect(await storely.set("testkey", { a: "testvalue" })).toBe(true);
	t.expect(await storely.get<MyType>("testkey")).toEqual({ a: "testvalue" });
});

it("user defined options", async (t) => {
	const options = {
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			},
		},
	};

	const storely = new Storely({
		compression: new StorelyBrotli(options),
	});

	t.expect(await storely.set("testkey", { a: "testvalue" })).toBe(true);
	t.expect(await storely.get<MyType>("testkey")).toEqual({ a: "testvalue" });
});

it("using number array", async (t) => {
	const options = {
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			},
		},
	};

	const storely = new Storely({
		compression: new StorelyBrotli(options),
	});

	t.expect(await storely.set("testkey", { b: [1, 2, 3] })).toBe(true);
	t.expect(await storely.get<MyType>("testkey")).toEqual({ b: [1, 2, 3] });
});
