import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { Definition } from "../Command/Author/Classify/Rules.ts";
import { root } from "../Configuration/Load/Load.ts";
import { DEFAULT_RULES, load, validate, warn } from "../Configuration/Rules/Rules.ts";
import type { Author } from "../Model/Author/Author.ts";
import type { Decision, Rules } from "../Model/Author/Decision.ts";
import { classify, decide, score } from "../Model/Author/Decision.ts";
import type { DomainHit, Evidence, TermHits } from "../Model/Author/Evidence.ts";
import { totals } from "../Model/Author/Evidence.ts";
import type { Post } from "../Model/Post/Post.ts";
import { merge } from "../Store/Merge/Merge.ts";
import { open as openShadow } from "../Store/Shadow/Shadow.ts";

const roots: string[] = [];

function temporary(): string {
	const path = mkdtempSync(join(tmpdir(), "maintain-rules-"));
	roots.push(path);
	return path;
}

after(() => {
	for (const path of roots) rmSync(path, { recursive: true, force: true });
});

const AT = "2026-11-01T10:00:00.000Z";

type Output = {
	rules: string;
	threshold: { score: number; gap: number };
	counts: { authors: number; decided: number; ambiguous: number; manual: number };
	decisions: Decision[];
	ambiguous: { handle: string; list: null; score: number; gap: number; reason: string }[];
	preserved: { handle: string; list: string | null; reason: string }[];
};

/** The tracked rules file, as the command reads it. */
function tracked(): Rules {
	const previous = process.env["MAINTAIN_RULES"];
	delete process.env["MAINTAIN_RULES"];
	try {
		return load();
	} finally {
		if (previous !== undefined) process.env["MAINTAIN_RULES"] = previous;
	}
}

/** One evidence record with hand-written counts, so a test says what it means. */
function evidence(
	handle: string,
	terms: Record<string, Record<string, number>>,
	domains: DomainHit[] = [],
): Evidence {
	const counted: TermHits = { ...terms };
	return {
		handle,
		name: handle,
		verified: false,
		posts: 1,
		domains,
		keywords: totals(counted),
		terms: counted,
		excerpts: [],
	};
}

function authorOf(handle: string): Author {
	return { handle, name: handle.toUpperCase(), verified: false };
}

function reading(handle: string, id: string, text: string, links: string[] = []): Post {
	return {
		id,
		url: `https://x.com/${handle}/status/${id}`,
		author: authorOf(handle),
		text,
		postedAt: "2026-10-01T00:00:00.000Z",
		media: links.map((url) => ({ kind: "link", url })),
		metrics: { replies: 0, reposts: 0, likes: 0, views: 0 },
	};
}

/** An archive on disk, one bookmarked post per entry. */
function archive(entries: [handle: string, id: string, text: string, links?: string[]][]): string {
	const directory = temporary();
	const store = openShadow(directory);
	for (const [handle, id, text, links] of entries) {
		store.write(merge(null, reading(handle, id, text, links), { source: "bookmark", at: AT }).post);
	}
	return directory;
}

/** A content collection on disk holding one author record. */
function content(records: { handle: string; lists: string[]; by: string; reason: string }[]): string {
	const directory = temporary();
	mkdirSync(join(directory, "Author"), { recursive: true });
	for (const record of records) {
		writeFileSync(
			join(directory, "Author", `${record.handle}.json`),
			`${JSON.stringify(
				{
					handle: record.handle,
					name: record.handle,
					verified: false,
					firstSeenAt: AT,
					postCount: 1,
					lists: record.lists,
					decision: { by: record.by, confidence: 1, reason: record.reason },
				},
				null,
				"\t",
			)}\n`,
			"utf8",
		);
	}
	return directory;
}

/** Run the command with every path it reads pointed at a temporary directory. */
async function run(paths: { storage: string; content: string; rules?: string }): Promise<Output> {
	const keys = ["MAINTAIN_STORAGE", "MAINTAIN_CONTENT", "MAINTAIN_RULES"] as const;
	const previous = new Map(keys.map((key) => [key, process.env[key]]));

	process.env["MAINTAIN_STORAGE"] = paths.storage;
	process.env["MAINTAIN_CONTENT"] = paths.content;
	if (paths.rules === undefined) delete process.env["MAINTAIN_RULES"];
	else process.env["MAINTAIN_RULES"] = paths.rules;

	try {
		return (await Definition.run({})) as Output;
	} finally {
		for (const key of keys) {
			const value = previous.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

/** Whatever a piece of code writes to stderr, and whatever it returns. */
function capture<T>(work: () => T): { value: T; text: string } {
	const original = process.stderr.write.bind(process.stderr);
	let text = "";
	process.stderr.write = ((chunk: unknown) => {
		text += String(chunk);
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = work();
		return { value, text };
	} finally {
		process.stderr.write = original;
	}
}

test("a design portfolio is placed in UI", () => {
	const rules = tracked();
	const portfolio = evidence("designer", { UI: { figma: 2, typography: 1 } }, [
		{ domain: "dribbble.com", count: 1 },
	]);

	const outcome = decide(portfolio, rules);

	assert.equal(outcome.list, "UI");
	// figma 3×2 + typography 3×1 + dribbble.com 4×1
	assert.equal(outcome.score, 13);
	assert.equal(outcome.gap, 13);
});

test("a compiler account is placed in CODE", () => {
	const rules = tracked();
	const account = evidence("compilerdev", { CODE: { compiler: 2, rust: 1 } });

	const outcome = decide(account, rules);

	assert.equal(outcome.list, "CODE");
	assert.equal(outcome.score, 10);
});

test("a genuinely mixed account stays ambiguous, with no list assigned", () => {
	const rules = tracked();
	const mixed = evidence("mixed", { UI: { figma: 1, typography: 1 }, CODE: { compiler: 1 } });

	const outcome = decide(mixed, rules);

	assert.equal(outcome.list, null);
	assert.equal(outcome.score, 6);
	// UI 6 leads CODE 4 by 2, and the tracked threshold asks for 3.
	assert.equal(outcome.gap, 2);
	assert.match(outcome.reason, /gap 2 under 3/);
});

test("the threshold and the weights are read from the file, not from the code", () => {
	const rules = tracked();
	const onDisk = JSON.parse(
		readFileSync(join(root(), DEFAULT_RULES), "utf8"),
	) as { threshold: { score: number; gap: number } };

	assert.deepEqual(rules.threshold, onDisk.threshold);
	assert.deepEqual(Object.keys(rules.lists).sort(), ["AI", "CODE", "UI"]);

	const portfolio = evidence("designer", { UI: { figma: 2 } });
	assert.equal(decide(portfolio, rules).list, "UI");

	// A gap the file raises above the margin: the same author is ambiguous.
	assert.equal(decide(portfolio, { ...rules, threshold: { score: 3, gap: 99 } }).list, null);

	// A weight the file removes: the same author scores nothing for UI.
	const unwighted = { ...rules, lists: { ...rules.lists, UI: { keywords: { figma: 0 }, domains: {} } } };
	assert.equal(score(portfolio, unwighted).find((entry) => entry.list === "UI")?.score, 0);
});

test("a domain rule covers its subdomains and nothing that merely ends the same", () => {
	const rules = tracked();
	const links = evidence("links", {}, [
		{ domain: "blog.figma.com", count: 1 },
		{ domain: "notfigma.com", count: 9 },
	]);

	const ui = score(links, rules).find((entry) => entry.list === "UI");
	assert.equal(ui?.score, 4);
	assert.deepEqual(ui?.top.map((entry) => entry.name), ["blog.figma.com"]);
});

test("a manual decision is preserved, never re-decided, and never rewritten", async () => {
	const storage = archive([["alpha", "1", "figma figma figma typography"]]);
	const directory = content([{ handle: "alpha", lists: ["CODE"], by: "manual", reason: "I know this account" }]);
	const before = readFileSync(join(directory, "Author", "alpha.json"), "utf8");

	const output = await run({ storage, content: directory });

	assert.deepEqual(output.counts, { authors: 1, decided: 0, ambiguous: 0, manual: 1 });
	assert.deepEqual(output.decisions, []);
	assert.deepEqual(output.ambiguous, []);
	assert.deepEqual(output.preserved, [{ handle: "alpha", list: "CODE", reason: "I know this account" }]);
	// Untouched on disk: this command has no business writing there.
	assert.equal(readFileSync(join(directory, "Author", "alpha.json"), "utf8"), before);
});

test("a model decision is a previous guess, so the rules may supersede it", async () => {
	const storage = archive([["beta", "1", "figma figma figma typography"]]);
	const directory = content([{ handle: "beta", lists: ["CODE"], by: "model", reason: "a guess" }]);

	const output = await run({ storage, content: directory });

	assert.deepEqual(output.counts, { authors: 1, decided: 1, ambiguous: 0, manual: 0 });
	assert.equal(output.decisions[0]?.list, "UI");
	assert.deepEqual(output.preserved, []);
});

test("every decision carries a one-line reason, and the ambiguous ones are marked", async () => {
	const storage = archive([
		["designer", "1", "figma typography figma"],
		["mixed", "2", "figma typography compiler"],
		["quiet", "3", "the weather is fine"],
	]);
	const output = await run({ storage, content: temporary() });

	assert.equal(output.counts.authors, 3);
	assert.equal(output.decisions.length, 1);
	assert.equal(output.ambiguous.length, 2);

	for (const decision of [...output.decisions, ...output.ambiguous]) {
		assert.equal(typeof decision.reason, "string");
		assert.ok(decision.reason.length > 0, `${decision.handle} has no reason`);
		assert.doesNotMatch(decision.reason, /[\r\n]/, `${decision.handle} has a multi-line reason`);
		assert.equal(typeof decision.score, "number");
		assert.equal(typeof decision.gap, "number");
	}
	// The ambiguous entries say so by carrying no list at all.
	for (const entry of output.ambiguous) assert.equal(entry.list, null);
});

test("the classifier places the obvious cases from the archive and leaves the mixed one out", async () => {
	const storage = archive([
		["designer", "1", "figma figma typography typeface"],
		["compilerdev", "2", "compiler compiler rust refactor"],
		["mixed", "3", "figma compiler typography"],
	]);
	const output = await run({ storage, content: temporary() });

	const placed = Object.fromEntries(output.decisions.map((decision) => [decision.handle, decision.list]));
	assert.deepEqual(placed, { compilerdev: "CODE", designer: "UI" });
	assert.deepEqual(
		output.ambiguous.map((entry) => entry.handle),
		["mixed"],
	);
});

test("two runs on one archive print the same bytes", async () => {
	const storage = archive([["designer", "1", "figma figma typography"]]);
	const directory = temporary();

	const first = JSON.stringify(await run({ storage, content: directory }));
	const second = JSON.stringify(await run({ storage, content: directory }));

	assert.equal(first, second);
});

test("a bad weight is dropped with a warning, and the rest of the file still loads", () => {
	const source = "the test rules";
	const { value: rules, text: warned } = capture(() =>
		validate(
			{
				threshold: { score: 1, gap: 1 },
				lists: { UI: { keywords: { figma: "strong", ui: 2 }, domains: { "figma.com": -1 } } },
			},
			source,
		),
	);

	assert.deepEqual(rules.lists["UI"]?.keywords, { ui: 2 });
	assert.deepEqual(rules.lists["UI"]?.domains, {});
	assert.match(warned, /ignoring `lists\.UI\.keywords\.figma`/);
	assert.match(warned, /ignoring `lists\.UI\.domains\.figma\.com`/);
});

test("a weight naming a term the vocabulary never counts is reported, not silently kept", () => {
	const { text: warned } = capture(() =>
		warn(
			validate(
				{
					threshold: { score: 1, gap: 1 },
					lists: { UI: { keywords: { figma: 3, "design system": 3 }, domains: {} } },
				},
				"the test rules",
			),
			"the test rules",
		),
	);
	// `design system` is not in the vocabulary, so the rules loader is the only
	// place that can say the weight is inert.
	assert.match(warned, /weights terms the vocabulary does not count: UI:design system/);
});

test("a missing rules file is a named failure, not a crash", () => {
	const previous = process.env["MAINTAIN_RULES"];
	process.env["MAINTAIN_RULES"] = join(temporary(), "absent.json");
	try {
		assert.throws(
			() => load(),
			(error: unknown) =>
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				(error as { code: unknown }).code === "no-rules",
		);
	} finally {
		if (previous === undefined) delete process.env["MAINTAIN_RULES"];
		else process.env["MAINTAIN_RULES"] = previous;
	}
});

test("a threshold that is not in the file is a failure, never a default", () => {
	assert.throws(
		() => validate({ lists: { UI: { keywords: { figma: 3 } } } }, "the test rules"),
		(error: unknown) =>
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code: unknown }).code === "schema-invalid",
	);
});

test("classify() leaves the manual author out of both buckets", () => {
	const rules = tracked();
	const manual = new Map([["designer", { handle: "designer", list: "CODE", reason: "kept" }]]);
	const result = classify(
		[evidence("designer", { UI: { figma: 3 } }), evidence("compilerdev", { CODE: { compiler: 1 } })],
		rules,
		manual,
	);

	assert.deepEqual(
		result.decisions.map((decision) => decision.handle),
		["compilerdev"],
	);
	assert.deepEqual(result.preserved, [{ handle: "designer", list: "CODE", reason: "kept" }]);
});

test("a manual decision whose author left the archive is still reported", () => {
	const rules = tracked();
	const manual = new Map([["gone", { handle: "gone", list: "UI", reason: "kept" }]]);

	const result = classify([evidence("compilerdev", { CODE: { compiler: 1 } })], rules, manual);

	assert.deepEqual(result.preserved, [{ handle: "gone", list: "UI", reason: "kept" }]);
	assert.equal(result.decisions.length, 1);
});

test("the classifier imports no inference or transport module and calls no network", async () => {
	const sources = [
		"Command/Author/Classify/Rules.ts",
		"Model/Author/Decision.ts",
		"Configuration/Rules/Rules.ts",
		"Store/Author/Author.ts",
	];
	for (const relative of sources) {
		const source = readFileSync(join(root(), "Maintain", "Source", relative), "utf8");
		assert.doesNotMatch(
			source,
			/from\s+["'][^"']*(?:infer|openai|anthropic|node:https?|node:net|node:child_process)[^"']*["']/i,
			`${relative} imports an inference or transport module`,
		);
		assert.doesNotMatch(source, /\bfetch\s*\(/, `${relative} calls fetch`);
	}

	const original = globalThis.fetch;
	globalThis.fetch = (() => {
		throw new Error("the rules classifier made a network call");
	}) as typeof fetch;
	try {
		const output = await run({
			storage: archive([["designer", "1", "figma figma typography"]]),
			content: temporary(),
		});
		assert.equal(output.counts.authors, 1);
	} finally {
		globalThis.fetch = original;
	}
});
