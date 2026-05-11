import type { StorelySerializationAdapter } from "@ambicuity/core";
import superjson from "superjson";

export class StorelySuperJsonSerializer implements StorelySerializationAdapter {
	stringify(object: unknown): string {
		return superjson.stringify(object);
	}

	parse<T>(data: string): T {
		return superjson.parse<T>(data);
	}
}

export const superJsonSerializer = new StorelySuperJsonSerializer();

export default StorelySuperJsonSerializer;
