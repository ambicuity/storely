import StorelyDynamo from "@storely/dynamo";
import type { BackendFactory, BenchClient, Mode } from "../types.js";
import { buildStorelyClient } from "../libraries/storely.js";
import { probeTcp } from "./util.js";

// DynamoDB Local listens on port 8000 by default. There is no @keyv/dynamodb
// on npm at time of writing, so this row is storely-only — the bench's
// markdown/json reporters render single-library cells correctly.
//
// If port 8000 is taken by an unrelated process (e.g. a local dev server),
// available() returns false and the bench skips this backend gracefully.
const DYNAMO_ENDPOINT = process.env.DYNAMO_ENDPOINT ?? "http://localhost:8000";
const DYNAMO_TABLE = process.env.DYNAMO_TABLE ?? "storely_bench";

export const dynamoBackend: BackendFactory = {
	name: "dynamo",
	async available() {
		const url = new URL(DYNAMO_ENDPOINT);
		return await probeTcp(url.hostname, Number(url.port || 8000));
	},
	async build(mode: Mode): Promise<BenchClient[]> {
		const store = new StorelyDynamo({
			endpoint: DYNAMO_ENDPOINT,
			region: "local",
			tableName: DYNAMO_TABLE,
			credentials: { accessKeyId: "x", secretAccessKey: "x" },
		});
		return [buildStorelyClient({ mode, store })];
	},
};
