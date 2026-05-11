import { promisify } from "node:util";
import { type BrotliOptions, brotliCompress, brotliDecompress, constants } from "node:zlib";
import type { StorelyCompressionAdapter } from "@ambicuity/ambicore";

const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

/**
 * Default quality for brotli compression. Node's underlying default is 11
 * (maximum), which is ~5–10× slower than quality 4 for typical cache payloads
 * with marginal additional compression ratio. Quality 4 is the standard
 * cache-storage tradeoff. Override via `compressOptions.params`.
 */
const DEFAULT_BROTLI_QUALITY = 4;

export type Options = {
	compressOptions?: BrotliOptions;
	decompressOptions?: BrotliOptions;
};

export class StorelyBrotli implements StorelyCompressionAdapter {
	private readonly _compressOptions: BrotliOptions;
	private readonly _decompressOptions?: BrotliOptions;

	constructor(options?: Options) {
		const userParams = options?.compressOptions?.params ?? {};
		const params = {
			[constants.BROTLI_PARAM_QUALITY]: DEFAULT_BROTLI_QUALITY,
			...userParams,
		};
		this._compressOptions = { ...options?.compressOptions, params };
		this._decompressOptions = options?.decompressOptions;
	}

	async compress(value: string): Promise<string> {
		const compressed = await brotliCompressAsync(value, this._compressOptions);
		return compressed.toString("base64");
	}

	async decompress(value: string): Promise<string> {
		const buffer = Buffer.from(value, "base64");
		const decompressed = await brotliDecompressAsync(buffer, {
			...this._decompressOptions,
		});
		return decompressed.toString();
	}
}

export default StorelyBrotli;
