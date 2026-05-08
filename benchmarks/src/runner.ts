import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allBackends } from "./backends/index.js";
import { writeDocsPage } from "./reporters/docs-page.js";
import { writeJsonReport } from "./reporters/json.js";
import { writeMarkdownReport } from "./reporters/markdown.js";
import { runBatchSuite } from "./suites/batch.js";
import { runCrudSuite } from "./suites/crud.js";
import type { BackendName, Mode, ResultRow } from "./types.js";

interface CliArgs {
	backends?: Array<BackendName | "all">;
	suite: "crud" | "batch" | "all";
	mode: Mode | "both";
	docsOut?: string;
	skipDocs: boolean;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { suite: "all", mode: "both", skipDocs: false };
	for (const arg of argv.slice(2)) {
		const [k, v] = arg.replace(/^--/, "").split("=");
		switch (k) {
			case "backend":
				args.backends = v.split(",").map((s) => s.trim()) as Array<BackendName | "all">;
				break;
			case "suite":
				args.suite = v as CliArgs["suite"];
				break;
			case "mode":
				args.mode = v as CliArgs["mode"];
				break;
			case "docs-out":
				args.docsOut = v;
				break;
			case "skip-docs":
				args.skipDocs = true;
				break;
			default:
				console.warn(`Unknown arg: ${arg}`);
		}
	}
	return args;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv);
	const backends = allBackends.filter((b) => {
		if (!args.backends || args.backends.length === 0 || args.backends.includes("all")) return true;
		return args.backends.includes(b.name);
	});
	const suites: Array<"crud" | "batch"> =
		args.suite === "all" ? ["crud", "batch"] : [args.suite];
	const modes: Mode[] = args.mode === "both" ? ["defaults", "json"] : [args.mode];

	const allRows: ResultRow[] = [];
	const failures: Array<{ backend: string; mode: Mode; suite: string; error: string }> = [];

	const writeReports = () => {
		if (allRows.length === 0) {
			console.log("\nNo results collected.");
			return;
		}
		const here = dirname(fileURLToPath(import.meta.url));
		const resultsDir = join(here, "..", "results");
		mkdirSync(resultsDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		const jsonPath = join(resultsDir, `${stamp}.json`);
		const mdPath = join(resultsDir, `${stamp}.md`);
		writeJsonReport(jsonPath, allRows);
		writeMarkdownReport(mdPath, allRows);
		console.log(`\nWrote ${jsonPath}`);
		console.log(`Wrote ${mdPath}`);

		if (!args.skipDocs) {
			const defaultDocsOut = join(here, "..", "..", "website", "site", "docs", "benchmarks.md");
			const docsOut = args.docsOut ?? process.env.BENCH_DOCS_OUT ?? defaultDocsOut;
			writeDocsPage(docsOut, allRows);
			console.log(`Wrote ${docsOut}`);
		}

		if (failures.length > 0) {
			console.log(`\n${failures.length} (backend, mode, suite) combination(s) errored:`);
			for (const f of failures) {
				console.log(`  - ${f.backend}/${f.mode}/${f.suite}: ${f.error}`);
			}
		}
	};

	// Ensure reports are written even if the process is interrupted.
	const writeOnExit = () => {
		try {
			writeReports();
		} catch (err) {
			console.error("Failed to write reports on exit:", err);
		}
	};
	process.on("SIGINT", () => {
		writeOnExit();
		process.exit(130);
	});

	try {
		for (const backend of backends) {
			console.log(`\n=== Probing backend: ${backend.name} ===`);
			let ok = false;
			try {
				ok = await backend.available();
			} catch (err) {
				console.log(`  ${backend.name}: probe error: ${(err as Error).message}`);
			}
			if (!ok) {
				console.log(`  ${backend.name}: NOT AVAILABLE — skipping`);
				continue;
			}
			console.log(`  ${backend.name}: available`);

			for (const mode of modes) {
				console.log(`\n--- ${backend.name} / ${mode} ---`);
				let clients;
				try {
					clients = await backend.build(mode);
				} catch (err) {
					const msg = (err as Error).message;
					console.warn(`Failed to build clients for ${backend.name}/${mode}: ${msg}`);
					failures.push({ backend: backend.name, mode, suite: "build", error: msg });
					continue;
				}
				// Warm-up: hit each client once so connections are open before benchmarking.
				for (const client of clients) {
					try {
						await client.set("__warmup__", "x");
						await client.get("__warmup__");
						await client.delete("__warmup__");
					} catch (err) {
						console.warn(`Warm-up failed for ${client.name}: ${(err as Error).message}`);
					}
				}

				try {
					if (suites.includes("crud")) {
						try {
							allRows.push(...(await runCrudSuite({ backend: backend.name, mode, clients })));
						} catch (err) {
							const msg = (err as Error).message;
							console.warn(`crud suite failed on ${backend.name}/${mode}: ${msg}`);
							failures.push({ backend: backend.name, mode, suite: "crud", error: msg });
						}
					}
					if (suites.includes("batch")) {
						try {
							allRows.push(...(await runBatchSuite({ backend: backend.name, mode, clients })));
						} catch (err) {
							const msg = (err as Error).message;
							console.warn(`batch suite failed on ${backend.name}/${mode}: ${msg}`);
							failures.push({ backend: backend.name, mode, suite: "batch", error: msg });
						}
					}
				} finally {
					for (const client of clients) {
						try {
							await client.disconnect();
						} catch (err) {
							console.warn(`Disconnect failed for ${client.name}: ${(err as Error).message}`);
						}
					}
				}
			}
		}
	} finally {
		writeReports();
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
