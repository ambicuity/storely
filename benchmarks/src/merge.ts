import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeDocsPage } from "./reporters/docs-page.js";
import { writeJsonReport } from "./reporters/json.js";
import { writeMarkdownReport } from "./reporters/markdown.js";
import type { ResultRow } from "./types.js";

interface CliArgs {
	inputs: string[];
	exclude: Array<{ backend?: string; mode?: string }>;
	docsOut?: string;
	skipDocs: boolean;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { inputs: [], exclude: [], skipDocs: false };
	for (const arg of argv.slice(2)) {
		const stripped = arg.replace(/^--/, "");
		const eq = stripped.indexOf("=");
		const k = eq === -1 ? stripped : stripped.slice(0, eq);
		const v = eq === -1 ? "" : stripped.slice(eq + 1);
		switch (k) {
			case "in":
				args.inputs.push(v);
				break;
			case "exclude": {
				// Format: backend=postgres or mode=defaults or backend=postgres+mode=defaults
				const parts = Object.fromEntries(v.split("+").map((s) => s.split("=")));
				args.exclude.push(parts as { backend?: string; mode?: string });
				break;
			}
			case "docs-out":
				args.docsOut = v;
				break;
			case "skip-docs":
				args.skipDocs = true;
				break;
		}
	}
	return args;
}

function shouldExclude(row: ResultRow, exclude: CliArgs["exclude"]): boolean {
	for (const filter of exclude) {
		const backendMatch = !filter.backend || row.backend === filter.backend;
		const modeMatch = !filter.mode || row.mode === filter.mode;
		if (backendMatch && modeMatch) return true;
	}
	return false;
}

function main(): void {
	const args = parseArgs(process.argv);
	if (args.inputs.length === 0) {
		console.error("Usage: tsx src/merge.ts --in=path1.json [--in=path2.json ...] [--exclude=backend=postgres]");
		process.exit(1);
	}

	const all: ResultRow[] = [];
	for (const path of args.inputs) {
		const data = JSON.parse(readFileSync(path, "utf8")) as { rows: ResultRow[] };
		const kept = data.rows.filter((r) => !shouldExclude(r, args.exclude));
		console.log(`  ${path}: ${data.rows.length} rows, ${kept.length} kept after filters`);
		all.push(...kept);
	}

	// De-duplicate: prefer later inputs over earlier ones for the same (backend, mode, operation, valueSize, batchSize, library)
	const dedup = new Map<string, ResultRow>();
	for (const r of all) {
		const k = `${r.backend}|${r.mode}|${r.operation}|${r.valueSize ?? ""}|${r.batchSize ?? ""}|${r.library}`;
		dedup.set(k, r);
	}
	const finalRows = Array.from(dedup.values());
	console.log(`\nTotal after dedup: ${finalRows.length} rows`);

	const here = dirname(fileURLToPath(import.meta.url));
	const resultsDir = join(here, "..", "results");
	mkdirSync(resultsDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const jsonPath = join(resultsDir, `merged-${stamp}.json`);
	const mdPath = join(resultsDir, `merged-${stamp}.md`);
	writeJsonReport(jsonPath, finalRows);
	writeMarkdownReport(mdPath, finalRows);
	console.log(`Wrote ${jsonPath}`);
	console.log(`Wrote ${mdPath}`);

	if (!args.skipDocs) {
		const defaultDocsOut = join(here, "..", "..", "website", "site", "docs", "benchmarks.md");
		const docsOut = args.docsOut ?? process.env.BENCH_DOCS_OUT ?? defaultDocsOut;
		writeDocsPage(docsOut, finalRows);
		console.log(`Wrote ${docsOut}`);
	}
}

main();
