import type { BackendName, BenchClient, Mode, Operation, ResultRow } from "../types.js";
import { KEY_POOL_SIZE, makeKeys, makeValue, rowsFromResults, runBenchSuite } from "./util.js";

const VALUE_SIZES = [32, 1024, 64 * 1024];

interface CrudArgs {
	backend: BackendName;
	mode: Mode;
	clients: BenchClient[];
}

export async function runCrudSuite(args: CrudArgs): Promise<ResultRow[]> {
	const { backend, mode, clients } = args;
	const rows: ResultRow[] = [];

	for (const valueSize of VALUE_SIZES) {
		const keys = makeKeys(`crud-${valueSize}`, KEY_POOL_SIZE);
		const value = makeValue(valueSize);

		// Pre-populate keys for read/has/delete benchmarks. Skip any client whose
		// backend rejects this value size (e.g. MySQL TEXT column overflow at 64KB).
		const eligible: BenchClient[] = [];
		for (const client of clients) {
			try {
				await client.clear();
				for (const k of keys) await client.set(k, value);
				eligible.push(client);
			} catch (err) {
				console.warn(
					`[${backend}/${mode}] ${client.name} cannot store ${valueSize}B values: ${(err as Error).message} — skipping for this size`,
				);
			}
		}
		if (eligible.length === 0) {
			console.warn(`[${backend}/${mode}] no clients eligible for ${valueSize}B — skipping size`);
			continue;
		}

		// get
		console.log(`\n[${backend}/${mode}] get  value=${valueSize}B`);
		let i = 0;
		const getResults = await runBenchSuite({
			label: `${backend}-${mode}-get-${valueSize}`,
			clients: eligible,
			fn: (client) => client.get(keys[i++ % KEY_POOL_SIZE]),
		});
		rows.push(...rowsFromResults(getResults, eligible, { backend, mode, operation: "get" as Operation, valueSize }));

		// has
		console.log(`\n[${backend}/${mode}] has  value=${valueSize}B`);
		let j = 0;
		const hasResults = await runBenchSuite({
			label: `${backend}-${mode}-has-${valueSize}`,
			clients: eligible,
			fn: (client) => client.has(keys[j++ % KEY_POOL_SIZE]),
		});
		rows.push(...rowsFromResults(hasResults, eligible, { backend, mode, operation: "has" as Operation, valueSize }));

		// set (rotating pool — measures set-or-overwrite)
		console.log(`\n[${backend}/${mode}] set  value=${valueSize}B`);
		let k = 0;
		const setResults = await runBenchSuite({
			label: `${backend}-${mode}-set-${valueSize}`,
			clients: eligible,
			fn: (client) => client.set(keys[k++ % KEY_POOL_SIZE], value),
		});
		rows.push(...rowsFromResults(setResults, eligible, { backend, mode, operation: "set" as Operation, valueSize }));

		// delete (after pool exhaustion measures no-op delete throughput; documented in report)
		console.log(`\n[${backend}/${mode}] del  value=${valueSize}B`);
		let d = 0;
		const delResults = await runBenchSuite({
			label: `${backend}-${mode}-del-${valueSize}`,
			clients: eligible,
			fn: (client) => client.delete(keys[d++ % KEY_POOL_SIZE]),
			beforeEachClient: async (client) => {
				for (const x of keys) await client.set(x, value);
			},
		});
		rows.push(...rowsFromResults(delResults, eligible, { backend, mode, operation: "delete" as Operation, valueSize }));
	}

	return rows;
}
