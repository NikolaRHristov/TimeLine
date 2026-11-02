#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compare, explain } from "../Source/Model/Schema/Compare.ts";
import { render } from "../Source/Model/Schema/Render.ts";

/**
 * Write the schema artifacts, or fail when they are stale.
 *
 * `--write` rewrites all three. Without it the command only compares, and a
 * difference is exit 1 with the field lists printed - which is what `pnpm run
 * check` runs, so a model change that was never regenerated cannot pass.
 *
 * This lives outside `Maintain/Source` on purpose: it is a build step, not
 * something the CLI links against.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function main(argv: readonly string[]): number {
	const write = argv.includes("--write");

	if (write) {
		for (const artifact of render()) {
			const path = join(ROOT, artifact.path);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, artifact.content, "utf8");
			process.stdout.write(`wrote ${artifact.path}\n`);
		}
		return 0;
	}

	const report = compare(ROOT);
	if (report.ok === false) {
		process.stderr.write(`${explain(report)}\n`);
		return 1;
	}
	process.stdout.write(`schema: ${render().length} artifacts current\n`);
	return 0;
}

process.exitCode = main(process.argv.slice(2));
