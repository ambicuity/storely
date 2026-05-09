import type { DeflateFunctionOptions, InflateOptions } from "pako";

/**
 * Options applied at compress-time (gzip).
 */
export type CompressOptions = DeflateFunctionOptions;

/**
 * Options applied at decompress-time (gunzip). `to` is implicitly set
 * to `"string"` by the adapter and should not be supplied directly.
 */
export type DecompressOptions = Omit<InflateOptions, "to">;

/**
 * Combined adapter options.
 *
 * Earlier revisions used a single intersection of deflate + inflate
 * option types, which silently passed inflate-only options to deflate
 * and vice versa. The two are now separated.
 */
export type Options = {
	compress?: CompressOptions;
	decompress?: DecompressOptions;
};
