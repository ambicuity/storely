#!/usr/bin/env tsx
/**
 * Regression gate.
 *
 * Compares the most recent benchmark run in `benchmarks/results/` against a
 * tracked snapshot at `benchmarks/baseline.json`, cell-by-cell, for storely
 * only. A cell fails if the current ops/sec is more than `TOLERANCE` below the
 * baseline AND error bars do not overlap.
 *
 * The previous version asserted "storely within X% of fastest competitor in
 * the latest committed merged JSON" — it ignored the fresh bench run entirely
 * and held the project to an absolute-perf target rather than a regression
 * target. This rewrite makes the gate do what its name says.
 *
 * Usage:
 *   pnpm --filter @storely/benchmarks gate
 *     Compare latest run in results/ to baseline.json. Exit 1 on regression.
 *
 *   pnpm --filter @storely/benchmarks gate -- --promote
 *     Replace baseline.json with the latest run. Use after intentional perf
 *     changes (positive or negative). Commit the result.
 */
import { copyFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface ResultRow {
	backend: string;
	library: string;
	operation: string;
	mode: string;
	valueSize?: number;
	batchSize?: number;
	hz: number;
	rme: number;
}

interface ResultFile {
	rows: ResultRow[];
}

const here = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(here, "results");
const BASELINE_PATH = join(here, "baseline.json");
// Tolerance is 15% rather than 5%. Benchmark.js cycles report low within-run
// RME (often 1-5%) but between-run variance on the same hardware is larger:
// container scheduling, OS file cache state, redis/mysql connection-pool
// warmup, JIT tier transitions. Full sweeps on this codebase empirically
// drift 5-19% per cell across back-to-back runs with no code change at all.
// Below 15% is bench noise; real regressions worth flagging are 25%+.
const TOLERANCE = 0.15;

function loadJson(path: string): ResultFile {
	return JSON.parse(readFileSync(path, "utf8")) as ResultFile;
}

/**
 * Find the latest per-run JSON written by `pnpm bench` (excludes merged-*).
 * Picks by mtime so a fresh CI run is always used over a checked-in artifact.
 */
function findLatestRunPath(): string {
	const candidates = readdirSync(RESULTS_DIR)
		.filter((f) => f.endsWith(".json") && !f.startsWith("merged-"))
		.map((f) => {
			const full = join(RESULTS_DIR, f);
			return { path: full, mtime: statSync(full).mtimeMs };
		})
		.sort((a, b) => b.mtime - a.mtime);
	if (candidates.length === 0) {
		throw new Error(
			`No per-run benchmark JSON in ${RESULTS_DIR}. Run \`pnpm --filter @storely/benchmarks bench\` first.`,
		);
	}
	return candidates[0].path;
}

function cellKey(r: ResultRow): string {
	return `${r.backend}|${r.mode}|${r.operation}|${r.valueSize ?? ""}|${r.batchSize ?? ""}`;
}

function indexStorely(rows: ResultRow[]): Map<string, ResultRow> {
	const idx = new Map<string, ResultRow>();
	for (const r of rows) {
		if (r.library !== "storely") continue;
		idx.set(cellKey(r), r);
	}
	return idx;
}

function main(): void {
	const promote = process.argv.slice(2).includes("--promote");

	const latestRunPath = findLatestRunPath();

	if (promote) {
		copyFileSync(latestRunPath, BASELINE_PATH);
		console.log(`✅ Promoted ${latestRunPath} → ${BASELINE_PATH}`);
		console.log(`   Commit benchmarks/baseline.json to record the new reference.`);
		return;
	}

	const baseline = indexStorely(loadJson(BASELINE_PATH).rows);
	const current = indexStorely(loadJson(latestRunPath).rows);

	console.log(`baseline: ${BASELINE_PATH}`);
	console.log(`current:  ${latestRunPath}`);
	console.log(`storely cells — baseline ${baseline.size}, current ${current.size}`);

	const failures: Array<{
		cell: string;
		current: number;
		baseline: number;
		drop: number;
	}> = [];
	const newCells: string[] = [];

	for (const [k, cur] of current) {
		const base = baseline.get(k);
		if (!base) {
			newCells.push(k);
			continue;
		}
		if (cur.hz >= base.hz * (1 - TOLERANCE)) continue;
		// Error bar overlap: if the current run's RME-adjusted high overlaps the
		// baseline's RME-adjusted low, treat as noise rather than regression.
		const currentHigh = cur.hz * (1 + cur.rme / 100);
		const baselineLow = base.hz * (1 - base.rme / 100);
		if (currentHigh >= baselineLow) continue;
		failures.push({
			cell: k,
			current: cur.hz,
			baseline: base.hz,
			drop: (base.hz - cur.hz) / base.hz,
		});
	}

	if (newCells.length > 0) {
		console.log(`ℹ️  ${newCells.length} cells in current run are not in baseline (new cells):`);
		for (const k of newCells) console.log(`   - ${k}`);
		console.log(`   To incorporate them, run \`pnpm gate -- --promote\`.`);
	}

	if (failures.length === 0) {
		console.log(`✅ No regressions vs baseline (${current.size} cells checked).`);
		process.exit(0);
	}

	console.error(`❌ ${failures.length} cells regressed vs baseline:`);
	failures.sort((a, b) => b.drop - a.drop);
	for (const f of failures) {
		console.error(
			`  - ${f.cell}: ${f.current.toFixed(0)} ops/s (was ${f.baseline.toFixed(0)}, dropped ${(f.drop * 100).toFixed(1)}%)`,
		);
	}
	console.error(
		`\nIf the regressions are intentional, re-run \`pnpm bench\` and then \`pnpm gate -- --promote\` to advance the baseline.`,
	);
	process.exit(1);
}

main();
