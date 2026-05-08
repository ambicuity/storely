import Benchmark from "benchmark";
import type { BenchClient, Operation, ResultRow } from "../types.js";

export const KEY_POOL_SIZE = 1000;

export function makeKeys(prefix: string, n: number): string[] {
	return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

export function makeValue(byteSize: number): string {
	// Build a string whose UTF-8 byte length is `byteSize` (ASCII chars only).
	return "x".repeat(byteSize);
}

export interface RunOptions {
	label: string;
	clients: BenchClient[];
	fn: (client: BenchClient) => Promise<unknown>;
	beforeEachClient?: (client: BenchClient) => Promise<void>;
}

export function runBenchSuite(opts: RunOptions): Promise<
	Array<{ name: string; hz: number; rme: number; samples: number; mean: number }>
> {
	return new Promise((resolve, reject) => {
		const suite = new Benchmark.Suite(opts.label);
		const setupTasks: Array<() => Promise<void>> = [];
		// Cap per-client error log spam: print first 3 errors then suppress.
		const errCounts = new Map<string, number>();
		const ERR_CAP = 3;
		for (const client of opts.clients) {
			suite.add(client.name, {
				defer: true,
				fn: (deferred: { resolve: () => void }) => {
					opts.fn(client).then(
						() => deferred.resolve(),
						(err) => {
							const n = (errCounts.get(client.name) ?? 0) + 1;
							errCounts.set(client.name, n);
							if (n <= ERR_CAP) {
								const msg = (err as Error)?.message ?? String(err);
								console.error(`[${opts.label}] ${client.name} threw: ${msg}`);
								if (n === ERR_CAP) console.error(`[${opts.label}] ${client.name} further errors suppressed`);
							}
							deferred.resolve();
						},
					);
				},
			});
			if (opts.beforeEachClient) {
				setupTasks.push(() => opts.beforeEachClient!(client));
			}
		}
		const results: Array<{ name: string; hz: number; rme: number; samples: number; mean: number }> = [];
		suite.on("cycle", (event: Benchmark.Event) => {
			const t = event.target;
			results.push({
				name: String(t.name),
				hz: Number(t.hz),
				rme: Number(t.stats?.rme ?? 0),
				samples: Number(t.stats?.sample?.length ?? 0),
				mean: Number(t.stats?.mean ?? 0),
			});
			console.log(`  ${String(t)}`);
		});
		suite.on("complete", () => resolve(results));
		suite.on("error", (event: Benchmark.Event) => reject(event.target.error));
		// Run beforeEachClient setup tasks sequentially, then start the suite.
		(async () => {
			for (const fn of setupTasks) await fn();
			suite.run({ async: true });
		})().catch(reject);
	});
}

export function rowsFromResults(
	cycleResults: Array<{ name: string; hz: number; rme: number; samples: number; mean: number }>,
	clients: BenchClient[],
	common: Omit<ResultRow, "library" | "hz" | "rme" | "samples" | "mean" | "fallback">,
): ResultRow[] {
	const byName = new Map(clients.map((c) => [c.name, c] as const));
	return cycleResults.map((r) => {
		const client = byName.get(r.name as BenchClient["name"]);
		const fallback = client?.fallbacks?.includes(common.operation as Operation) ?? false;
		return {
			...common,
			library: r.name as ResultRow["library"],
			hz: r.hz,
			rme: r.rme,
			samples: r.samples,
			mean: r.mean,
			fallback,
		};
	});
}
