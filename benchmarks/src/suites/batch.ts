import type { BackendName, BenchClient, Mode, Operation, ResultRow } from "../types.js";
import { KEY_POOL_SIZE, makeKeys, makeValue, rowsFromResults, runBenchSuite } from "./util.js";

const BATCH_SIZES = [10, 100, 1000];
const VALUE_SIZE = 1024; // 1 KB — typical, fixed for batch

interface BatchArgs {
	backend: BackendName;
	mode: Mode;
	clients: BenchClient[];
}

export async function runBatchSuite(args: BatchArgs): Promise<ResultRow[]> {
	const { backend, mode, clients } = args;
	const rows: ResultRow[] = [];

	for (const batchSize of BATCH_SIZES) {
		const poolSize = Math.max(KEY_POOL_SIZE, batchSize * 4);
		const keys = makeKeys(`batch-${batchSize}`, poolSize);
		const value = makeValue(VALUE_SIZE);
		const entries: Array<[string, unknown]> = keys.map((k) => [k, value]);

		// Pre-populate for getMany/deleteMany. Skip clients whose backend rejects this load.
		const eligible: BenchClient[] = [];
		for (const client of clients) {
			try {
				await client.clear();
				await client.setMany(entries);
				eligible.push(client);
			} catch (err) {
				console.warn(
					`[${backend}/${mode}] ${client.name} cannot store batch=${batchSize}: ${(err as Error).message} — skipping for this batch size`,
				);
			}
		}
		if (eligible.length === 0) {
			console.warn(`[${backend}/${mode}] no clients eligible for batch=${batchSize} — skipping`);
			continue;
		}

		const sliceAt = (i: number) => keys.slice(i % (poolSize - batchSize), (i % (poolSize - batchSize)) + batchSize);
		const sliceEntries = (i: number): Array<[string, unknown]> => {
			const start = i % (poolSize - batchSize);
			return entries.slice(start, start + batchSize);
		};

		// getMany
		console.log(`\n[${backend}/${mode}] getMany batch=${batchSize}`);
		let i = 0;
		const gm = await runBenchSuite({
			label: `${backend}-${mode}-getMany-${batchSize}`,
			clients: eligible,
			fn: (client) => client.getMany(sliceAt(i++)),
		});
		rows.push(
			...rowsFromResults(gm, eligible, {
				backend,
				mode,
				operation: "getMany" as Operation,
				batchSize,
			}),
		);

		// setMany
		console.log(`\n[${backend}/${mode}] setMany batch=${batchSize}`);
		let j = 0;
		const sm = await runBenchSuite({
			label: `${backend}-${mode}-setMany-${batchSize}`,
			clients: eligible,
			fn: (client) => client.setMany(sliceEntries(j++)),
		});
		rows.push(
			...rowsFromResults(sm, eligible, {
				backend,
				mode,
				operation: "setMany" as Operation,
				batchSize,
			}),
		);

		// deleteMany
		console.log(`\n[${backend}/${mode}] deleteMany batch=${batchSize}`);
		let d = 0;
		const dm = await runBenchSuite({
			label: `${backend}-${mode}-deleteMany-${batchSize}`,
			clients: eligible,
			fn: (client) => client.deleteMany(sliceAt(d++)),
			beforeEachClient: async (client) => {
				await client.setMany(entries);
			},
		});
		rows.push(
			...rowsFromResults(dm, eligible, {
				backend,
				mode,
				operation: "deleteMany" as Operation,
				batchSize,
			}),
		);
	}

	return rows;
}
