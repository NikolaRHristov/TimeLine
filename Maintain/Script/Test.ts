#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Content } from "../Configuration/Content.ts";

/**
 * @module Test
 *
 * Run every test under `Source/Test`, with the one thing those tests cannot
 * carry themselves: the content defines.
 *
 * `Source/Content/Text.ts` reads `process.env.CONTENT_*` and throws when a name
 * is absent, on purpose - a source run without `pnpm run Build` must name the
 * missing define instead of printing `undefined` in the middle of a sentence.
 * The build supplies those names as esbuild `define`s, so ten test files
 * (`Config`, `Distribute`, `Evidence`, `Infer`, `ListMember`, `Parser`, `Push`,
 * `Rules`, `Transport`, `Vote`) cannot even import before a build has run.
 *
 * Neither obvious gate is right. Globbing the source tests is red on every
 * fresh clone, and a red gate is turned off. Gating on `Target/Test/*.test.js`
 * makes `check` depend on `pnpm run Build`, which rewrites `Target/` under
 * whoever is running the CLI and still leaves a clone with nothing to run. So
 * this runner reads the same `Configuration/Content.ts` the build reads and
 * passes its values to the test process as the environment `Text.ts` already
 * reads: same bytes, same single source, no build, and no file excluded.
 *
 * The values are `Define()`'s own map, minus its `process.env.` prefix, so the
 * name a test sees cannot drift from the name the build bakes in.
 *
 * Arguments are forwarded to `node --test`, so a focused run stays possible:
 * `node Script/Test.ts --test-name-pattern="events"`.
 */

/** `Maintain/`, from this file's location rather than the working directory. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The directory the suite is discovered in. */
const DIRECTORY = join(ROOT, "Source", "Test");

/** The prefix `Define()` puts on every key, and the one thing stripped here. */
const PREFIX = "process.env.";

/**
 * A total environment above roughly 1 MiB makes `execve` fail with `E2BIG`,
 * which names neither the content tree nor this runner. The content is about
 * 23 KiB, so this limit is a guard against one runaway document, not a live
 * constraint - and it fails with a message that says which tree to look at.
 */
const LIMIT = 512 * 1024;

async function main(argv: readonly string[]): Promise<number> {
	const files = readdirSync(DIRECTORY, { recursive: true })
		.filter((Name) => Name.endsWith(".test.ts"))
		.sort()
		.map((Name) => join("Source", "Test", Name));

	if (files.length === 0) {
		process.stderr.write(`no *.test.ts under ${DIRECTORY}\n`);
		return 1;
	}

	const Layer = await Content();
	const Environment: NodeJS.ProcessEnv = { ...process.env };

	let Bytes = 0;

	for (const [Expression, Literal] of Object.entries(Layer.Define)) {
		if (!Expression.startsWith(PREFIX)) {
			process.stderr.write(`${Expression}: expected a define keyed ${PREFIX}<NAME>\n`);
			return 1;
		}

		const Name = Expression.slice(PREFIX.length);
		const Value = JSON.parse(Literal) as string;

		Environment[Name] = Value;
		Bytes += Buffer.byteLength(Name) + Buffer.byteLength(Value) + 2;
	}

	if (Bytes > LIMIT) {
		process.stderr.write(
			`the content defines are ${Bytes} bytes, over the ${LIMIT}-byte environment limit: ` +
				`Content/** holds a document too large to hand a test process, so split it or lower it\n`,
		);
		return 1;
	}

	// stderr, so stdout stays the test runner's own report.
	process.stderr.write(
		`test: ${files.length} files under Source/Test, ${Object.keys(Layer.Define).length} content defines from Content/**\n`,
	);

	const Result = spawnSync(process.execPath, ["--test", ...argv, ...files], {
		cwd: ROOT,
		env: Environment,
		stdio: "inherit",
	});

	if (Result.error !== undefined) {
		process.stderr.write(`node --test could not start: ${Result.error.message}\n`);
		return 1;
	}

	return Result.status ?? 1;
}

process.exitCode = await main(process.argv.slice(2));
