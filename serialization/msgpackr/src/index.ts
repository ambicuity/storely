import type { StorelySerializationAdapter } from "@ambicuity/storely-core";
import { Packr } from "msgpackr";

/**
 * MessagePack serializer for Storely, backed by `msgpackr`.
 *
 * Output is a base64-encoded MessagePack payload. Encoding/decoding works
 * in any environment that exposes either Node's `Buffer` or the
 * `btoa` / `atob` web globals — both branches are tried.
 */
export class StorelyMsgpackrSerializer implements StorelySerializationAdapter {
	private readonly packr: Packr;

	constructor() {
		this.packr = new Packr({ structuredClone: true });
	}

	stringify(object: unknown): string {
		const binary = this.packr.pack(object);
		return uint8ArrayToBase64(binary);
	}

	parse<T>(data: string): T {
		const binary = base64ToUint8Array(data);
		return this.packr.unpack(binary) as T;
	}
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(bytes).toString("base64");
	}
	const chunkSize = 0x8000;
	const parts: string[] = [];
	for (let i = 0; i < bytes.length; i += chunkSize) {
		parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
	}
	return btoa(parts.join(""));
}

function base64ToUint8Array(data: string): Uint8Array {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(data, "base64");
	}
	const binary = atob(data);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

export const msgpackrSerializer = new StorelyMsgpackrSerializer();

export default StorelyMsgpackrSerializer;
