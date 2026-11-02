#!/usr/bin/env node
/**
 * The compatibility guard.
 *
 *   node Scripts/Compatibility.mjs
 *
 * Two checks, one of which can fail:
 *
 *   1. The Node floor. The floor is recorded once, in the root `package.json`
 *      under `engines.node`, and this file reads it from there rather than
 *      restating it - so the recorded number and the enforced number cannot
 *      drift. Running a Node below the floor fails here, with a message that
 *      names the version and the file, instead of failing inside Astro as a
 *      syntax error that names neither.
 *
 *   2. What is behind. `pnpm outdated --format json` is run and summarised, and
 *      a major that is available but not taken is *reported*, never failed:
 *      taking a major is a decision with its own record (RFC-0044), and a guard
 *      that turned every upstream release into a red build would force that
 *      decision on the day of the release rather than on the day of the review.
 *
 * Plain JavaScript, no dependencies, on purpose: the guard has to run - and
 * speak - on a Node old enough to be the thing it is complaining about.
 *
 * Exit 0 compatible, 1 the Node floor is not met or the floor is not recorded.
 * The dependency report never changes the exit code.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const Here = dirname(fileURLToPath(import.meta.url));
const Root = resolve(Here, "..");

/** The dependency report is bounded: a registry that does not answer is a warning, not a hang. */
const OutdatedTimeout = 180_000;

/**
 * `[major, minor, patch]` from anything that starts with a version - a range, a
 * tag, `process.versions.node`. `undefined` when the text holds no version.
 */
function ParseVersion(Text) {
	const Match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(Text ?? "").trim());

	if (Match === null) {
		return undefined;
	}

	return [Number(Match[1]), Number(Match[2] ?? 0), Number(Match[3] ?? 0)];
}

function Compare(Left, Right) {
	for (let Index = 0; Index < 3; Index += 1) {
		if (Left[Index] !== Right[Index]) {
			return Left[Index] < Right[Index] ? -1 : 1;
		}
	}

	return 0;
}

/**
 * The lowest version a range admits.
 *
 * Only the forms this repository records are understood - `>=X.Y.Z`, `^X.Y.Z`,
 * `~X.Y.Z`, a bare version, a bare major. An upper-bounded or unioned range has
 * no single floor to compare against, so it returns `undefined` and the caller
 * says UNKNOWN rather than guessing: a guard that silently passes an unfamiliar
 * range is worse than one that admits it cannot read it.
 */
function FloorOf(Range) {
	const Text = String(Range ?? "").trim();

	if (Text === "" || Text === "*" || Text === "latest") {
		return undefined;
	}

	if (Text.includes("||") || Text.startsWith("<")) {
		return undefined;
	}

	const Match = /^(?:>=|>|\^|~|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(Text);

	if (Match === null) {
		return undefined;
	}

	return [Number(Match[1]), Number(Match[2] ?? 0), Number(Match[3] ?? 0)];
}

function Format(Version) {
	return Version === undefined ? "UNKNOWN" : Version.join(".");
}

function Section(Name) {
	process.stdout.write(`== ${Name}\n`);
}

function Line(Level, Text) {
	process.stdout.write(`${Level} ${Text}\n`);
}

/** The floor, read from the manifest that records it. */
function ReadFloor() {
	let Manifest;

	try {
		Manifest = JSON.parse(readFileSync(resolve(Root, "package.json"), "utf8"));
	} catch (Error) {
		return { Failure: `package.json is unreadable: ${Error.message}` };
	}

	const Range = Manifest.engines === undefined ? undefined : Manifest.engines.node;

	if (Range === undefined) {
		return {
			Failure:
				"package.json records no `engines.node`, so there is no floor to check against. " +
				"The floor is written down once, there; Documentation/Reference/Compatibility.md " +
				"states it in prose and points back at the manifest.",
		};
	}

	return { Range, Floor: FloorOf(Range), Manifest };
}

function CheckNode(Range, Floor) {
	Section("node");

	const Running = ParseVersion(process.versions.node);

	if (Running === undefined) {
		Line(
			"WARN",
			`cannot read a version out of "${process.versions.node}"; the floor is not checked`,
		);
		return true;
	}

	if (Floor === undefined) {
		Line(
			"WARN",
			`the recorded floor "${Range}" is not a form this guard reads; the floor is not checked`,
		);
		return true;
	}

	if (Compare(Running, Floor) >= 0) {
		Line("PASS", `v${Format(Running)} satisfies ${Range} (package.json engines.node)`);
		return true;
	}

	Line(
		"FAIL",
		`Node v${Format(Running)} is below the floor ${Format(Floor)}, recorded as "${Range}".`,
	);
	process.stdout.write(
		[
			"",
			"     Astro refuses to build below this floor by name, but it is the only tool in the chain",
			"     that does: `pnpm run Build` (esbuild) and the tool layer's type-check both exit 0 on",
			"     the same interpreter. This is the one place the floor is stated before a build runs.",
			"",
			"     Put a supported Node first on PATH, then run the command again:",
			"       PATH=/path/to/supported/node/bin:$PATH pnpm run check",
			"",
			"     Supported lines: 22 from 22.23.4, 24, 26. See Documentation/Reference/Compatibility.md.",
			"",
			"",
		].join("\n"),
	);

	return false;
}

/**
 * The dependency report.
 *
 * `pnpm outdated` exits 1 when it finds anything outdated, which is its normal
 * answer and not a failure; a registry that cannot be reached, a pnpm that is
 * not installed, or output that is not JSON are warnings. None of them changes
 * the exit code, because this half of the guard reports.
 */
function CheckOutdated() {
	Section("dependencies behind");

	const Result = spawnSync(
		process.platform === "win32" ? "pnpm.cmd" : "pnpm",
		// `--silent` keeps pnpm's own warnings - including the unsupported-engine
		// warning this very floor provokes on an old Node - out of the payload.
		["outdated", "--format", "json", "--silent"],
		{
			cwd: Root,
			encoding: "utf8",
			timeout: OutdatedTimeout,
			maxBuffer: 16 * 1024 * 1024,
		},
	);

	if (Result.error !== undefined) {
		const Reason =
			Result.error.code === "ENOENT" ? "pnpm is not on PATH" : Result.error.message;
		Line("SKIP", `${Reason}; nothing is reported`);
		return;
	}

	if (Result.status !== 0 && Result.status !== 1) {
		Line("SKIP", `pnpm outdated exited ${Result.status}; the registry was not read`);
		return;
	}

	const Text = String(Result.stdout ?? "").trim();

	if (Text === "") {
		Line("PASS", "no dependency is behind");
		return;
	}

	let Report;

	try {
		Report = JSON.parse(Text);
	} catch {
		// pnpm writes its own warnings to the same stream - an unsupported
		// engine, a deprecated setting - so the payload is the block of lines
		// that starts with `{` and ends with `}`, not the output itself.
		const Lines = Text.split("\n");
		const Start = Lines.findIndex((Entry) => Entry.trimStart().startsWith("{"));
		let End = -1;

		for (let Index = Lines.length - 1; Index >= 0; Index -= 1) {
			if (Lines[Index].trimEnd().endsWith("}")) {
				End = Index;
				break;
			}
		}

		if (Start === -1 || End < Start) {
			Line("SKIP", "pnpm outdated did not answer with JSON; nothing is reported");
			return;
		}

		try {
			Report = JSON.parse(Lines.slice(Start, End + 1).join("\n"));
		} catch (Error) {
			Line(
				"SKIP",
				`pnpm outdated did not answer with JSON (${Error.message}); nothing is reported`,
			);
			return;
		}
	}

	const Behind = Object.entries(Report);

	if (Behind.length === 0) {
		Line("PASS", "no dependency is behind");
		return;
	}

	const Majors = [];
	const Within = [];

	for (const [Name, Entry] of Behind) {
		const Current = ParseVersion(Entry.current);
		const Latest = ParseVersion(Entry.latest);

		if (Current === undefined || Latest === undefined) {
			Within.push(`${Name} ${Entry.current ?? "?"} -> ${Entry.latest ?? "?"}`);
			continue;
		}

		if (Latest[0] > Current[0]) {
			Majors.push(
				`${Name} ${Format(Current)} -> ${Format(Latest)} (${Entry.dependencyType ?? "dependency"})`,
			);
		} else {
			Within.push(`${Name} ${Format(Current)} -> ${Format(Latest)}`);
		}
	}

	if (Majors.length === 0) {
		Line("PASS", "no dependency is behind a major release");
	} else {
		Line(
			"INFO",
			`${Majors.length} behind a major - reported, not failed; taking one is RFC-0044:`,
		);
		for (const Entry of Majors) {
			process.stdout.write(`       ${Entry}\n`);
		}
	}

	if (Within.length > 0) {
		Line("INFO", `${Within.length} behind within its major: ${Within.join(", ")}`);
	}
}

const { Range, Floor, Failure } = ReadFloor();

Section("record");
if (Failure !== undefined) {
	Line("FAIL", Failure);
} else {
	Line("PASS", `floor "${Range}" read from package.json engines.node`);
}

const NodeOk = Failure === undefined && CheckNode(Range, Floor);

if (Failure === undefined) {
	CheckOutdated();
}

process.stdout.write("---\n");
process.stdout.write(NodeOk ? "RESULT compatible\n" : "RESULT incompatible\n");
process.exit(NodeOk ? 0 : 1);
