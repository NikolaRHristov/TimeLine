#!/usr/bin/env node
/**
 * Capture one research thread as Markdown, addressed by its id.
 *
 * Every other driver here takes a `ws` handle that a person copied out of
 * `/json/list`. A worker has no person to copy it: it has the thread id it was
 * told to read. This resolves the handle itself - the page target whose URL
 * contains the id - and hands it to `cdp-extract.mjs`, so the serialiser that
 * reads TeX from KaTeX's annotation and code from `pre` stays the only one in
 * the tree.
 *
 *   node research.mjs <thread-id> [--out <file>] [--cdp <url>]
 *
 * `--out` defaults to `./.hermes/research/<thread-id>.md`, and its directory is
 * created when absent. `--cdp` overrides `CDP`, default `http://127.0.0.1:9222`.
 *
 * Several page targets may carry the id; the first is used and the choice is
 * printed, because a silent pick is how the wrong thread is read. Exit `2` with
 * one `blocker:` line when the endpoint is unreachable, when no page target
 * holds the id, or when the extractor refuses; exit `1` when the extractor ran
 * and the page held no text, which leaves no file behind.
 *
 * It captures what is rendered now. Settle a streaming answer with
 * `cdp-read.mjs` first, or the file is a partial answer that reads as a whole
 * one.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolved beside this file, so the command works from any directory and from a
// clone that has never been built.
const Extractor = resolve(dirname(fileURLToPath(import.meta.url)), "cdp-extract.mjs");

const Usage = "usage: node research.mjs <thread-id> [--out file] [--cdp url]";

// A flag whose value is missing, or a flag this script does not know, is a
// mistake worth stopping on: falling back to a default would capture the right
// thread to a path the caller never asked for, and read as a success.
const Args = process.argv.slice(2);
const Options = { out: null, cdp: process.env["CDP"] ?? "http://127.0.0.1:9222" };
const Positional = [];

for (let Index = 0; Index < Args.length; Index++) {
	const Argument = Args[Index];
	if (Argument === "--out" || Argument === "--cdp") {
		const Value = Args[++Index];
		if (Value === undefined || Value.startsWith("--")) {
			console.error(`${Argument} needs a value\n${Usage}`);
			process.exit(2);
		}
		Options[Argument.slice(2)] = Value;
	} else if (Argument.startsWith("--")) {
		console.error(`unknown option ${Argument}\n${Usage}`);
		process.exit(2);
	} else {
		Positional.push(Argument);
	}
}

const ThreadId = Positional[0];
if (!ThreadId || Positional.length > 1) {
	console.error(Usage);
	process.exit(2);
}

const Cdp = Options.cdp;
const Out = resolve(Options.out ?? resolve(".hermes", "research", `${ThreadId}.md`));

const Refuse = (Reason) => {
	console.error(`blocker: ${Reason}`);
	process.exit(2);
};

process.on("unhandledRejection", (Error) => Refuse(Error?.message ?? Error));

let Targets;
try {
	Targets = await (await fetch(`${Cdp}/json/list`)).json();
} catch {
	Refuse(`no CDP endpoint on ${Cdp}; start a browser with --remote-debugging-port`);
}
if (!Array.isArray(Targets)) Refuse(`${Cdp}/json/list did not answer with a target list`);

// Only a rendered page holds an answer: a service worker, an iframe and a
// devtools target all carry a URL and none of them can be read as Markdown.
const Matches = Targets.filter(
	(Target) =>
		Target.type === "page" && typeof Target.url === "string" && Target.url.includes(ThreadId),
);
if (Matches.length === 0) Refuse(`no tab for thread ${ThreadId}`);

const Chosen = Matches[0];
mkdirSync(dirname(Out), { recursive: true });

// The extractor is spawned rather than imported: it is a CLI that runs its read
// at the top level, so importing it would execute it before this file had a
// handle to give it. Spawning is what keeps one serialiser in one file.
const Run = spawnSync(process.execPath, [Extractor, Chosen.webSocketDebuggerUrl, "--out", Out], {
	encoding: "utf8",
});
if (Run.error) Refuse(`cannot run ${Extractor}: ${Run.error.message}`);

const Report = (Run.stderr ?? "").trim();
if (Run.status !== 0) {
	// The extractor states its own refusal in one `blocker:` line; relaying it
	// keeps the reason it found rather than a second guess at it.
	if (Report.length > 0) console.error(Report);
	if (Run.status === 2) process.exit(2);
	process.exit(1);
}

let Markdown = "";
try {
	Markdown = readFileSync(Out, "utf8");
} catch {
	Markdown = "";
}

if (Markdown.trim().length === 0) {
	// A file of nothing but a newline at the printed path is worse than no file:
	// the next reader cannot tell an empty answer from a capture that worked.
	rmSync(Out, { force: true });
	console.error(`empty: the extract produced no text from thread ${ThreadId}`);
	process.exit(1);
}

if (Matches.length > 1) console.log(`note: ${Matches.length} tabs carry this id; using the first`);
console.log(`thread: ${ThreadId}`);
console.log(`tab: ${Chosen.id} ${Chosen.url}`);
if (Report.length > 0) console.error(Report);
console.log(`chars: ${Markdown.trim().length}`);
console.log(`path: ${Out}`);
