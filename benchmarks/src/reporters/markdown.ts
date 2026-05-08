import { writeFileSync } from "node:fs";
import type { LibraryName, Mode, ResultRow } from "../types.js";

const LIBRARIES: LibraryName[] = ["storely", "keyv", "cache-manager"];

function formatHz(hz: number): string {
	if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)}M`;
	if (hz >= 1_000) return `${(hz / 1_000).toFixed(1)}k`;
	return hz.toFixed(0);
}

function formatCell(row: ResultRow | undefined, isFastest: boolean): string {
	if (!row) return "—";
	const hz = formatHz(row.hz);
	const rme = `±${row.rme.toFixed(1)}%`;
	const fb = row.fallback ? "*" : "";
	const body = `${hz} ops/s ${rme}${fb}`;
	return isFastest ? `**${body}**` : body;
}

function rowKey(r: ResultRow): string {
	return `${r.operation}|${r.valueSize ?? ""}|${r.batchSize ?? ""}`;
}

function rowLabel(r: ResultRow): string {
	if (r.batchSize !== undefined) return `${r.operation} (n=${r.batchSize})`;
	if (r.valueSize !== undefined) return `${r.operation} (${formatBytes(r.valueSize)})`;
	return r.operation;
}

function formatBytes(n: number): string {
	if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)}MB`;
	if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`;
	return `${n}B`;
}

export function renderMarkdown(rows: ResultRow[]): string {
	const out: string[] = [];
	out.push("# Storely competitive benchmarks");
	out.push("");
	out.push(`Generated: ${new Date().toISOString()}`);
	out.push("");
	out.push("Higher is better (operations per second). **Bold** = fastest in row. `*` = library lacks a native implementation; emulated via Promise.all of singles.");
	out.push("");

	const backends = Array.from(new Set(rows.map((r) => r.backend)));
	const modes: Mode[] = Array.from(new Set(rows.map((r) => r.mode))) as Mode[];

	for (const backend of backends) {
		out.push(`## Backend: ${backend}`);
		out.push("");
		for (const mode of modes) {
			const subset = rows.filter((r) => r.backend === backend && r.mode === mode);
			if (subset.length === 0) continue;
			out.push(`### Mode: ${mode === "defaults" ? "as-shipped defaults" : "JSON-normalized"}`);
			out.push("");
			out.push(`| Operation | ${LIBRARIES.join(" | ")} |`);
			out.push(`| --- | ${LIBRARIES.map(() => "---").join(" | ")} |`);

			const grouped = new Map<string, ResultRow[]>();
			for (const r of subset) {
				const k = rowKey(r);
				if (!grouped.has(k)) grouped.set(k, []);
				grouped.get(k)!.push(r);
			}
			const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
				const [opA, vA, bA] = a.split("|");
				const [opB, vB, bB] = b.split("|");
				if (opA !== opB) return opA.localeCompare(opB);
				return Number(vA || bA) - Number(vB || bB);
			});

			for (const k of sortedKeys) {
				const group = grouped.get(k)!;
				const fastestHz = Math.max(...group.map((g) => g.hz));
				const cells = LIBRARIES.map((lib) => {
					const r = group.find((g) => g.library === lib);
					const isFastest = !!r && r.hz === fastestHz;
					return formatCell(r, isFastest);
				});
				out.push(`| ${rowLabel(group[0])} | ${cells.join(" | ")} |`);
			}
			out.push("");
		}
	}

	out.push("---");
	out.push("");
	out.push("## Notes");
	out.push("");
	out.push("- `cache-manager` v6+ uses Keyv stores under the hood, so Redis/SQLite/Mongo/MySQL/Postgres results for cache-manager and keyv are expected to be very close, with cache-manager's overhead reflecting only the wrapping layer.");
	out.push("- `delete` benchmarks reuse a rotating key pool of 1000 keys; once exhausted, subsequent calls measure no-op delete throughput. We re-populate the pool before each cycle, but Benchmark.js may run many iterations per cycle — the absolute number reflects the average across populated and exhausted states. Relative comparison between libraries is still valid.");
	out.push("- `set` benchmarks similarly rotate through the key pool, so the workload is set-or-overwrite.");
	out.push("- Asterisks (`*`) on a cell mean the library does not natively implement the operation and was emulated; for example, keyv has no native `setMany`, so it is implemented as `Promise.all` of singles.");
	out.push("");
	return out.join("\n");
}

export function writeMarkdownReport(path: string, rows: ResultRow[]): void {
	writeFileSync(path, renderMarkdown(rows));
}
