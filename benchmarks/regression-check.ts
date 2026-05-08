#!/usr/bin/env tsx
/**
 * Regression gate: reads the latest merged benchmark JSON in benchmarks/results/
 * and asserts that for every (backend, mode, operation, valueSize, batchSize) cell,
 * storely's ops/sec is within 5% of the fastest competitor — or error bars overlap.
 * Exit 0 on pass; exit 1 with a diff list on failure.
 */
import { readdirSync, readFileSync } from "node:fs";
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

const here = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(here, "results");
const TOLERANCE = 0.05;

function loadLatestMerged(): ResultRow[] {
	const files = readdirSync(RESULTS_DIR)
		.filter((f) => f.startsWith("merged-") && f.endsWith(".json"))
		.sort();
	const latest = files[files.length - 1];
	if (!latest) throw new Error("No merged benchmark JSON found in benchmarks/results/");
	const data = JSON.parse(readFileSync(join(RESULTS_DIR, latest), "utf8")) as { rows: ResultRow[] };
	return data.rows;
}

function cellKey(r: ResultRow): string {
	return `${r.backend}|${r.mode}|${r.operation}|${r.valueSize ?? ""}|${r.batchSize ?? ""}`;
}

const rows = loadLatestMerged();
const cells = new Map<string, ResultRow[]>();
for (const r of rows) {
	const k = cellKey(r);
	const arr = cells.get(k) ?? [];
	arr.push(r);
	cells.set(k, arr);
}

const failures: Array<{ cell: string; storely: number; fastest: number; gap: number }> = [];
for (const [k, group] of cells) {
	const storely = group.find((g) => g.library === "storely");
	if (!storely) continue;
	const competitors = group.filter((g) => g.library !== "storely");
	if (competitors.length === 0) continue;
	const fastest = competitors.reduce((a, b) => (b.hz > a.hz ? b : a));
	if (storely.hz >= fastest.hz * (1 - TOLERANCE)) continue;
	const storelyHigh = storely.hz * (1 + storely.rme / 100);
	const fastestLow = fastest.hz * (1 - fastest.rme / 100);
	if (storelyHigh >= fastestLow) continue;
	failures.push({
		cell: k,
		storely: storely.hz,
		fastest: fastest.hz,
		gap: (fastest.hz - storely.hz) / fastest.hz,
	});
}

if (failures.length === 0) {
	console.log(`✅ All ${cells.size} cells within tolerance.`);
	process.exit(0);
}

console.error(`❌ ${failures.length} cells regressed:`);
for (const f of failures) {
	console.error(
		`  - ${f.cell}: storely ${f.storely.toFixed(0)} ops/s vs fastest ${f.fastest.toFixed(0)} ops/s (gap ${(f.gap * 100).toFixed(1)}%)`,
	);
}
process.exit(1);
