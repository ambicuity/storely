/**
 * Lightweight perf-regression harness.
 *
 * Goal: catch order-of-magnitude regressions, NOT compete on micro-benchmarks.
 * This is intentionally smaller than the previous bench infrastructure that
 * was removed at 9e32f1f.
 *
 * Usage:
 *   pnpm tsx scripts/perf-baseline.ts <adapter>                     # measure + write baseline
 *   pnpm tsx scripts/perf-baseline.ts <adapter> --compare           # measure + compare to baseline
 *   pnpm tsx scripts/perf-baseline.ts --all                         # all production adapters
 *
 * Backends must be up via `pnpm test:services:start`.
 * Adapter must be one of: redis, postgres, mysql, mongo, sqlite, valkey, rocksdb.
 *
 * Output: perf-baselines/<adapter>.json with p50/p99 for each op.
 * Exit code: 0 on success / within-tolerance regression; 1 on >25% regression.
 */

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASELINES_DIR = path.join(ROOT, "perf-baselines");
const REGRESSION_THRESHOLD = 1.25; // 25% slower than baseline fails the gate

type OpName = "set" | "get" | "delete" | "setMany100" | "getMany100" | "deleteMany100";

type Measurement = {
	p50: number;
	p99: number;
	samples: number;
};

type Baseline = {
	adapter: string;
	storely_version: string;
	captured_at: string;
	ops: Partial<Record<OpName, Measurement>>;
};

/** Measures the wall-clock duration of a single async operation in milliseconds. */
async function timed(fn: () => Promise<unknown>): Promise<number> {
	const start = performance.now();
	await fn();
	return performance.now() - start;
}

/** Compute p50/p99 from a sample array. Mutates input. */
function percentiles(samples: number[]): Measurement {
	samples.sort((a, b) => a - b);
	const p50 = samples[Math.floor(samples.length * 0.5)] ?? 0;
	const p99 = samples[Math.floor(samples.length * 0.99)] ?? 0;
	return { p50, p99, samples: samples.length };
}

/**
 * Adapter factory. Imports the adapter dynamically so a missing optional
 * peer doesn't crash the whole sweep. Caller must have spun up the
 * relevant docker service via `pnpm test:services:start`.
 */
// biome-ignore lint/suspicious/noExplicitAny: factory boundary
async function makeAdapter(name: string): Promise<{ adapter: any; cleanup: () => Promise<void> }> {
	switch (name) {
		case "redis": {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic adapter construction
			const mod = (await import("@ambicuity/redis")) as any;
			const adapter = new mod.default({
				uri: process.env.REDIS_URL ?? "redis://localhost:6379",
				namespace: `perfbase-${Date.now()}`,
				commandTimeout: 5_000,
			});
			return { adapter, cleanup: async () => adapter.disconnect?.() };
		}
		case "postgres": {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic adapter construction
			const mod = (await import("@ambicuity/postgres")) as any;
			const adapter = new mod.default({
				uri: process.env.POSTGRES_URL ?? "postgresql://postgres:postgres@localhost:5432/storely_test",
				namespace: `perfbase-${Date.now()}`,
			});
			return { adapter, cleanup: async () => adapter.disconnect?.() };
		}
		case "mysql": {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic adapter construction
			const mod = (await import("@ambicuity/mysql")) as any;
			const adapter = new mod.default({
				uri: process.env.MYSQL_URL ?? "mysql://root@localhost:3306/storely_test",
				namespace: `perfbase-${Date.now()}`,
			});
			return { adapter, cleanup: async () => adapter.disconnect?.() };
		}
		case "mongo": {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic adapter construction
			const mod = (await import("@ambicuity/mongo")) as any;
			const adapter = new mod.default({
				url: process.env.MONGO_URL ?? "mongodb://localhost:27017/storely_test",
				namespace: `perfbase-${Date.now()}`,
			});
			return { adapter, cleanup: async () => adapter.disconnect?.() };
		}
		case "sqlite": {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic adapter construction
			const mod = (await import("@ambicuity/sqlite")) as any;
			const tmpFile = path.join(ROOT, `tmp-perfbase-${Date.now()}.sqlite`);
			const adapter = new mod.default({ uri: `sqlite://${tmpFile}` });
			return {
				adapter,
				cleanup: async () => {
					await adapter.disconnect?.();
					if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
				},
			};
		}
		case "valkey": {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic adapter construction
			const mod = (await import("@ambicuity/valkey")) as any;
			const adapter = new mod.default({
				uri: process.env.VALKEY_URL ?? "redis://localhost:6380",
				namespace: `perfbase-${Date.now()}`,
				commandTimeout: 5_000,
			});
			return { adapter, cleanup: async () => adapter.disconnect?.() };
		}
		case "rocksdb": {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic adapter construction
			const mod = (await import("@ambicuity/rocksdb")) as any;
			const tmpDir = path.join(ROOT, `tmp-perfbase-rocks-${Date.now()}`);
			const adapter = new mod.default({ path: tmpDir });
			return {
				adapter,
				cleanup: async () => {
					await adapter.disconnect?.();
					fs.rmSync(tmpDir, { recursive: true, force: true });
				},
			};
		}
		default:
			throw new Error(`Unknown adapter: ${name}`);
	}
}

async function measureAdapter(name: string): Promise<Baseline> {
	console.log(`\nMeasuring ${name}...`);
	const { adapter, cleanup } = await makeAdapter(name);

	const ops: Baseline["ops"] = {};

	try {
		// Warmup
		for (let i = 0; i < 100; i++) {
			await adapter.set(`warmup:${i}`, "v");
		}

		// set: 1000 samples
		{
			const samples: number[] = [];
			for (let i = 0; i < 1000; i++) {
				samples.push(await timed(() => adapter.set(`set:${i}`, `value-${i}`)));
			}
			ops.set = percentiles(samples);
		}

		// get: 1000 samples on the keys we just wrote
		{
			const samples: number[] = [];
			for (let i = 0; i < 1000; i++) {
				samples.push(await timed(() => adapter.get(`set:${i}`)));
			}
			ops.get = percentiles(samples);
		}

		// delete: 1000 samples
		{
			const samples: number[] = [];
			for (let i = 0; i < 1000; i++) {
				samples.push(await timed(() => adapter.delete(`set:${i}`)));
			}
			ops.delete = percentiles(samples);
		}

		// setMany 100: 100 samples (skip if adapter doesn't support it)
		if (typeof adapter.setMany === "function") {
			const samples: number[] = [];
			for (let i = 0; i < 100; i++) {
				const batch = Array.from({ length: 100 }, (_, j) => ({
					key: `sm:${i}:${j}`,
					value: `v-${j}`,
				}));
				samples.push(await timed(() => adapter.setMany(batch)));
			}
			ops.setMany100 = percentiles(samples);
		}

		// getMany 100: 100 samples
		if (typeof adapter.getMany === "function") {
			const samples: number[] = [];
			for (let i = 0; i < 100; i++) {
				const keys = Array.from({ length: 100 }, (_, j) => `sm:${i}:${j}`);
				samples.push(await timed(() => adapter.getMany(keys)));
			}
			ops.getMany100 = percentiles(samples);
		}

		// deleteMany 100: 100 samples
		if (typeof adapter.deleteMany === "function") {
			const samples: number[] = [];
			for (let i = 0; i < 100; i++) {
				const keys = Array.from({ length: 100 }, (_, j) => `sm:${i}:${j}`);
				samples.push(await timed(() => adapter.deleteMany(keys)));
			}
			ops.deleteMany100 = percentiles(samples);
		}

		await adapter.clear?.();
	} finally {
		await cleanup();
	}

	const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")) as {
		version: string;
	};

	return {
		adapter: name,
		storely_version: rootPkg.version,
		captured_at: new Date().toISOString(),
		ops,
	};
}

function compareToBaseline(current: Baseline, baseline: Baseline): { ok: boolean; report: string } {
	const lines: string[] = [`\nComparing ${current.adapter}: ${baseline.storely_version} → ${current.storely_version}`];
	let ok = true;

	for (const op of Object.keys(current.ops) as OpName[]) {
		const cur = current.ops[op];
		const base = baseline.ops[op];
		if (!cur || !base) {
			lines.push(`  ${op}: SKIP (missing baseline or current)`);
			continue;
		}

		const p50Ratio = cur.p50 / base.p50;
		const p99Ratio = cur.p99 / base.p99;
		const p50Flag = p50Ratio > REGRESSION_THRESHOLD ? " ❌" : "";
		const p99Flag = p99Ratio > REGRESSION_THRESHOLD ? " ❌" : "";
		if (p50Flag || p99Flag) ok = false;

		lines.push(
			`  ${op}: p50 ${base.p50.toFixed(2)}→${cur.p50.toFixed(2)}ms (${p50Ratio.toFixed(2)}×)${p50Flag}, p99 ${base.p99.toFixed(2)}→${cur.p99.toFixed(2)}ms (${p99Ratio.toFixed(2)}×)${p99Flag}`,
		);
	}

	lines.push(ok ? "\n  ✅ all percentiles within tolerance" : `\n  ❌ regressions over ${REGRESSION_THRESHOLD}× threshold`);
	return { ok, report: lines.join("\n") };
}

function writeBaseline(b: Baseline): void {
	if (!fs.existsSync(BASELINES_DIR)) fs.mkdirSync(BASELINES_DIR, { recursive: true });
	const file = path.join(BASELINES_DIR, `${b.adapter}.json`);
	fs.writeFileSync(file, `${JSON.stringify(b, null, "\t")}\n`);
	console.log(`  → wrote ${path.relative(ROOT, file)}`);
}

function readBaseline(adapter: string): Baseline | undefined {
	const file = path.join(BASELINES_DIR, `${adapter}.json`);
	if (!fs.existsSync(file)) return undefined;
	return JSON.parse(fs.readFileSync(file, "utf-8")) as Baseline;
}

async function main() {
	const args = process.argv.slice(2);
	const compare = args.includes("--compare");
	const all = args.includes("--all");
	const PROD_ADAPTERS = ["redis", "postgres", "mysql", "mongo", "sqlite", "valkey", "rocksdb"];
	const targets = all ? PROD_ADAPTERS : args.filter((a) => !a.startsWith("--"));

	if (targets.length === 0) {
		console.error("Usage: pnpm tsx scripts/perf-baseline.ts <adapter> [--compare]");
		console.error("       pnpm tsx scripts/perf-baseline.ts --all [--compare]");
		process.exit(2);
	}

	let exit = 0;

	for (const name of targets) {
		try {
			const current = await measureAdapter(name);

			if (compare) {
				const baseline = readBaseline(name);
				if (!baseline) {
					console.log(`  no baseline for ${name}; writing initial`);
					writeBaseline(current);
					continue;
				}
				const { ok, report } = compareToBaseline(current, baseline);
				console.log(report);
				if (!ok) exit = 1;
			} else {
				writeBaseline(current);
			}
		} catch (err) {
			console.error(`  ❌ ${name} failed:`, (err as Error).message);
			exit = 1;
		}
	}

	process.exit(exit);
}

void main();
