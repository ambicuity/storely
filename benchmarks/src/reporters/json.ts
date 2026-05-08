import { writeFileSync } from "node:fs";
import type { ResultRow } from "../types.js";

export interface JsonReport {
	generatedAt: string;
	rows: ResultRow[];
}

export function writeJsonReport(path: string, rows: ResultRow[]): void {
	const report: JsonReport = {
		generatedAt: new Date().toISOString(),
		rows,
	};
	writeFileSync(path, JSON.stringify(report, null, 2));
}
