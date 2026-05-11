import { Buffer } from "node:buffer";
import type { StorelyCompressionAdapter } from "@ambicuity/ambicore";
import { gzip, ungzip } from "pako";
import type { Options } from "./types.js";

/**
 * Gzip compression adapter for Storely.
 *
 * Produces real RFC 1952 gzip output (magic bytes `1f 8b`), so values
 * compressed by this adapter can be round-tripped through any tool that
 * understands gzip — `zcat`, S3 with `Content-Encoding: gzip`, browser
 * decoders, etc. Earlier revisions used `pako.deflate` / `pako.inflate`,
 * which produce raw zlib (DEFLATE) data rather than gzip; that was a
 * misnomer and broke interop.
 */
export class StorelyGzip implements StorelyCompressionAdapter {
	private readonly _compressOptions: Options["compress"];
	private readonly _decompressOptions: Options["decompress"];

	constructor(options?: Options) {
		this._compressOptions = options?.compress;
		this._decompressOptions = options?.decompress;
	}

	async compress(value: string): Promise<string> {
		const compressed = gzip(value, this._compressOptions);
		return Buffer.from(compressed).toString("base64");
	}

	async decompress(value: string): Promise<string> {
		const buffer = Buffer.from(value, "base64");
		return ungzip(buffer, { ...this._decompressOptions, to: "string" });
	}
}

export type { CompressOptions, DecompressOptions, Options } from "./types.js";
export default StorelyGzip;
