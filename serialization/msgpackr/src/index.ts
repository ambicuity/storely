import { Buffer } from "node:buffer";
import { Packr } from "msgpackr";
import type { StorelySerializationAdapter } from "storely";

export class StorelyMsgpackrSerializer implements StorelySerializationAdapter {
	private readonly packr: Packr;

	constructor() {
		this.packr = new Packr({ structuredClone: true });
	}

	stringify(object: unknown): string {
		const binary = this.packr.pack(object);
		return Buffer.from(binary).toString("base64");
	}

	parse<T>(data: string): T {
		const binary = Buffer.from(data, "base64");
		return this.packr.unpack(binary) as T;
	}
}

export const msgpackrSerializer = new StorelyMsgpackrSerializer();

export default StorelyMsgpackrSerializer;
