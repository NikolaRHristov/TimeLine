import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fail, isFailure } from "../CLI/Parser/Output/Failure.ts";
import { parse } from "../CLI/Parser/Parser.ts";
import { schema } from "../CLI/Schema/Schema.ts";
import { Definition } from "../Command/Author/Distribute/Apply.ts";
import type { Rules } from "../Model/Author/Decision.ts";
import {
	apply,
	REPEAT_LIMIT,
	resolve,
	SPACING,
	type Add,
	type Applied,
	type Deps,
	type Planned,
} from "../Model/Author/Distribute.ts";
import { totals, type Evidence } from "../Model/Author/Evidence.ts";
import type { Post } from "../Model/Post/Post.ts";
import { open as openAuthors, type AuthorRecord } from "../Store/Author/Author.ts";
import { merge } from "../Store/Merge/Merge.ts";
import { open as openShadow } from "../Store/Shadow/Shadow.ts";

const AT = "2026-11-02T00:00:00.000Z";

const directories: string[] = [];

function temporary(): string {
	const path = mkdtempSync(join(tmpdir(), "maintain-distribute-"));
	directories.push(path);
	return path;
}

after(() => {
	for (const path of directories) rmSync(path, { recursive: true, force: true });
});

/** Two lists with one term each: `figma figma` is UI 4, `compiler` is CODE 3. */
const RULES: Rules = {
	version: 1,
	threshold: { score: 3, gap: 3 },
	lists: {
		UI: { keywords: { figma: 2 }, domains: {} },
		CODE: { keywords: { compiler: 3 }, domains: {} },
	},
};

const LISTS = ["UI", "CODE"];

/** One evidence record, built by hand so a test says what it means. */
function evidence(handle: string, terms: Record<string, Record<string, number>> = {}): Evidence {
	return {
		handle,
		name: handle,
		verified: false,
		posts: 1,
		domains: [],
		keywords: totals(terms),
		terms,
		excerpts: [],
	};
}

/** A record as the Author collection holds it. */
function stored(handle: string, lists: string[], by: string, reason = "on file"): AuthorRecord {
	return {
		handle,
		name: handle,
		verified: false,
		firstSeenAt: AT,
		postCount: 1,
		lists,
		decision: { by, confidence: 1, reason },
	};
}

/** A content collection on disk holding the given records; returns its root. */
function collection(records: readonly AuthorRecord[]): string {
	const directory = temporary();
	mkdirSync(join(directory, "Author"), { recursive: true });
	for (const entry of records) {
		writeFileSync(
			join(directory, "Author", `${entry.handle}.json`),
			`${JSON.stringify(entry, null, "\t")}\n`,
			"utf8",
		);
	}
	return directory;
}

/** A plan entry that needs no record: the sequencing tests are not about writing. */
function planned(handle: string, list = "UI", by: Planned["by"] = "rule"): Planned {
	return { handle, list, by, reason: "a reason", write: false };
}

function deps(store: Deps["store"], add: Add, pause: Deps["pause"] = async () => {}): Deps {
	return {
		apply: true,
		at: AT,
		store,
		evidence: (handle) => evidence(handle),
		add,
		pause,
	};
}

const codeOf = async (run: () => Promise<unknown>): Promise<string> => {
	try {
		await run();
	} catch (error) {
		if (isFailure(error)) return error.code;
		throw error;
	}
	return "none";
};

test("a rule decision is planned, and its record is the thing to write first", () => {
	const plan = resolve([evidence("alpha", { UI: { figma: 2 } })], RULES, LISTS, []);

	assert.deepEqual(
		plan.plan.map((entry) => [entry.handle, entry.list, entry.by, entry.write]),
		[["alpha", "UI", "rule", true]],
	);
	// The reason is the arithmetic that produced it: a decision nobody can
	// explain is a decision nobody can tune. The numbers travel with it, so the
	// record it writes keeps them.
	assert.match(plan.plan[0]?.reason ?? "", /figma/);
	assert.equal(plan.plan[0]?.score, 4);
	assert.equal(plan.plan[0]?.gap, 4);
	assert.deepEqual(plan.preserved, []);
	assert.deepEqual(plan.unresolved, []);
});

test("a cached model decision is planned from the record's lists and never rewritten", () => {
	const records = [stored("alpha", ["CODE"], "model", "the account writes compilers")];
	const plan = resolve([evidence("alpha")], RULES, LISTS, records);

	assert.deepEqual(
		plan.plan.map((entry) => [entry.handle, entry.list, entry.by, entry.write, entry.reason]),
		[["alpha", "CODE", "model", false, "the account writes compilers"]],
	);
	assert.deepEqual(plan.unresolved, []);
});

test("a manual decision is preserved, distributed, and marked as not to be written", () => {
	// The rules would place alpha in UI; the person said CODE. The person wins,
	// and the record is not this pass's to touch. A hand-edited reason can carry
	// a newline, so the one-line guarantee is made here rather than in the file.
	const records = [stored("alpha", ["CODE"], "manual", "I know this\naccount")];
	const plan = resolve([evidence("alpha", { UI: { figma: 2 } })], RULES, LISTS, records);

	assert.deepEqual(plan.preserved, [
		{ handle: "alpha", list: "CODE", reason: "I know this account" },
	]);
	assert.deepEqual(
		plan.plan.map((entry) => [entry.handle, entry.list, entry.by, entry.write, entry.reason]),
		[["alpha", "CODE", "manual", false, "I know this account"]],
	);
});

test("an ambiguous author with no decision on file is unresolved, not guessed at", () => {
	const plan = resolve([evidence("alpha")], RULES, LISTS, []);

	assert.deepEqual(plan.plan, []);
	assert.deepEqual(plan.unresolved, ["alpha"]);
});

test("a model decline is a decision: it is reported, not left unresolved", () => {
	const plan = resolve([evidence("alpha")], RULES, LISTS, [
		stored("alpha", [], "model", "nothing fits"),
	]);

	assert.deepEqual(plan.declined, ["alpha"]);
	assert.deepEqual(plan.unresolved, []);
	assert.deepEqual(plan.plan, []);
});

test("a list the identifier map does not declare is skipped, never applied", () => {
	const plan = resolve([evidence("alpha")], RULES, LISTS, [
		stored("alpha", ["SPORTS"], "model", "a list nobody configured"),
	]);

	assert.deepEqual(plan.plan, []);
	assert.deepEqual(plan.skipped, [
		{
			handle: "alpha",
			list: "SPORTS",
			reason: "the identifier map does not declare this list",
		},
	]);
});

test("without --apply nothing is written and no membership is attempted", async () => {
	const directory = temporary();
	const store = openAuthors(directory);
	const calls: string[] = [];

	const result = await apply([planned("alpha"), planned("beta")], {
		...deps(store, async (handle) => {
			calls.push(handle);
			return "added";
		}),
		apply: false,
	});

	assert.deepEqual(calls, []);
	assert.deepEqual(result.written, []);
	assert.deepEqual(result.added, []);
	assert.deepEqual(
		result.remaining.map((entry) => entry.handle),
		["alpha", "beta"],
	);
	// Nothing reached the content collection either: a dry run leaves no
	// Author directory behind, because it had no record to write.
	assert.equal(existsSync(join(directory, "Author")), false);
});

test("with --apply every record is on disk before the first membership is added", async () => {
	const store = openAuthors(collection([]));
	const plan = [planned("alpha"), planned("beta")].map((entry) => ({
		...entry,
		score: 4,
		gap: 4,
		write: true,
	}));
	const present: boolean[] = [];

	const result = await apply(
		plan,
		deps(store, async (handle) => {
			present.push(existsSync(join(store.directory, `${handle}.json`)));
			return "added";
		}),
	);

	assert.deepEqual(present, [true, true]);
	assert.deepEqual(result.written, ["alpha", "beta"]);

	const written = JSON.parse(readFileSync(join(store.directory, "alpha.json"), "utf8")) as {
		lists: string[];
		decision: {
			by: string;
			confidence: number;
			score?: number;
			gap?: number;
			reason: string;
		};
	};
	assert.deepEqual(written.lists, ["UI"]);
	assert.equal(written.decision.by, "rule");
	assert.equal(written.decision.reason, "a reason");
	// The arithmetic behind the decision is recorded, not only described.
	assert.equal(written.decision.score, 4);
	assert.equal(written.decision.gap, 4);
	assert.equal(written.decision.confidence, 4);
});

test("memberships are added one at a time, three seconds apart", async () => {
	const store = openAuthors(collection([]));
	const log: string[] = [];
	const pauses: number[] = [];

	const result = await apply([planned("alpha"), planned("beta"), planned("gamma")], {
		...deps(
			store,
			async (handle) => {
				log.push(`start:${handle}`);
				await Promise.resolve();
				log.push(`end:${handle}`);
				return "added";
			},
			async (ms) => {
				pauses.push(ms);
			},
		),
	});

	// Sequential: no add starts before the previous one ended.
	assert.deepEqual(log, [
		"start:alpha",
		"end:alpha",
		"start:beta",
		"end:beta",
		"start:gamma",
		"end:gamma",
	]);
	// Spaced: one wait between each pair, never before the first or after the last.
	assert.deepEqual(pauses, [SPACING, SPACING]);
	assert.equal(SPACING, 3_000);
	assert.deepEqual(
		result.added.map((entry) => entry.handle),
		["alpha", "beta", "gamma"],
	);
	assert.deepEqual(result.remaining, []);
});

test("a rate-limited answer stops the run and says how far it got", async () => {
	const store = openAuthors(collection([]));
	const pauses: number[] = [];
	const attempts: string[] = [];

	const result = await apply(
		[planned("alpha"), planned("beta"), planned("gamma"), planned("delta")],
		deps(
			store,
			async (handle) => {
				attempts.push(handle);
				if (handle === "gamma")
					throw fail(
						"rate-limited",
						"You are over the daily limit for adding people to Lists.",
					);
				return "added";
			},
			async (ms) => {
				pauses.push(ms);
			},
		),
	);

	assert.deepEqual(
		result.added.map((entry) => entry.handle),
		["alpha", "beta"],
	);
	assert.deepEqual(result.failed, []);
	assert.deepEqual(
		result.remaining.map((entry) => entry.handle),
		["delta"],
	);
	assert.deepEqual(attempts, ["alpha", "beta", "gamma"]);
	// No retry: the limited handle was attempted exactly once, and nothing was
	// added after it.
	assert.deepEqual(pauses, [SPACING, SPACING]);

	const stopped = result.stopped;
	assert.equal(stopped?.reason, "rate-limited");
	assert.equal(stopped?.handle, "gamma");
	assert.equal(stopped?.list, "UI");
	assert.equal(stopped?.attempted, 3);
	assert.match(stopped?.detail ?? "", /daily limit/);
});

test("the same failure for every handle stops the run instead of grinding on", async () => {
	const store = openAuthors(collection([]));
	const attempts: string[] = [];

	const result = await apply(
		["alpha", "beta", "gamma", "delta", "epsilon"].map((handle) => planned(handle)),
		deps(store, async (handle) => {
			attempts.push(handle);
			throw fail("no-list-menu", "no Add/remove from Lists control in the profile header");
		}),
	);

	assert.equal(REPEAT_LIMIT, 3);
	assert.deepEqual(attempts, ["alpha", "beta", "gamma"]);
	assert.equal(result.failed.length, REPEAT_LIMIT);
	assert.equal(result.stopped?.reason, "repeated-failure");
	assert.equal(result.stopped?.error, "no-list-menu");
	assert.deepEqual(
		result.remaining.map((entry) => entry.handle),
		["delta", "epsilon"],
	);
});

test("one failed handle does not end the run, and a success resets the streak", async () => {
	const store = openAuthors(collection([]));

	const result = await apply(
		["alpha", "beta", "gamma", "delta", "epsilon"].map((handle) => planned(handle)),
		deps(store, async (handle) => {
			if (handle === "beta" || handle === "delta" || handle === "epsilon") {
				throw fail("cdp-error", "the row did not flip to checked");
			}
			return "added";
		}),
	);

	// beta and delta are two in a row and epsilon a third, but gamma's success
	// between them is what keeps a coincidence from reading as a condition:
	// without the reset, this run would have stopped at epsilon.
	assert.equal(result.stopped, null);
	assert.deepEqual(
		result.failed.map((entry) => entry.handle),
		["beta", "delta", "epsilon"],
	);
	assert.deepEqual(
		result.added.map((entry) => entry.handle),
		["alpha", "gamma"],
	);
});

test("an already-member answer is reported as such, never as a write", async () => {
	const store = openAuthors(collection([]));

	const result = await apply(
		[planned("alpha"), planned("beta")],
		deps(store, async (handle) => (handle === "beta" ? "already" : "added")),
	);

	assert.deepEqual(
		result.added.map((entry) => entry.handle),
		["alpha"],
	);
	assert.deepEqual(
		result.already.map((entry) => entry.handle),
		["beta"],
	);
	assert.equal(result.stopped, null);
});

test("a manual record survives an apply run byte for byte", async () => {
	const directory = collection([stored("alpha", ["UI"], "manual", "I know this account")]);
	const before = readFileSync(join(directory, "Author", "alpha.json"), "utf8");
	const store = openAuthors(directory);
	const plan = resolve([evidence("alpha", { UI: { figma: 2 } })], RULES, LISTS, store.all()).plan;

	const result: Applied = await apply(
		plan,
		deps(store, async () => "added"),
	);

	assert.equal(readFileSync(join(directory, "Author", "alpha.json"), "utf8"), before);
	assert.deepEqual(result.written, []);
	// The filing is still carried out: a manual decision the pass ignored would
	// be one the person has to re-enter by hand.
	assert.deepEqual(
		result.added.map((entry) => [entry.handle, entry.list, entry.by]),
		[["alpha", "UI", "manual"]],
	);
});

/** One bookmarked post, as the archive stores it. */
function reading(handle: string, id: string, text: string): Post {
	return {
		id,
		url: `https://x.com/${handle}/status/${id}`,
		author: { handle, name: handle, verified: false },
		text,
		postedAt: "2026-10-01T00:00:00.000Z",
		media: [],
		metrics: { replies: 0, reposts: 0, likes: 0, views: 0 },
	};
}

/** A shadow archive on disk; returns its root. */
function archive(entries: readonly [string, string, string][]): string {
	const directory = temporary();
	const store = openShadow(directory);
	for (const [handle, id, text] of entries) {
		store.write(
			merge(null, reading(handle, id, text), {
				source: "bookmark",
				at: AT,
			}).post,
		);
	}
	return directory;
}

/** A JSON file, and its path. */
function json(name: string, value: unknown): string {
	const path = join(temporary(), name);
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
	return path;
}

const KEYS = [
	"MAINTAIN_CONFIG",
	"MAINTAIN_RULES",
	"MAINTAIN_VOCABULARY",
	"MAINTAIN_STORAGE",
	"MAINTAIN_CONTENT",
] as const;

/**
 * Run the command with every path it reads pointed at a temporary directory.
 *
 * `MAINTAIN_CONFIG` names a file that does not exist, which is how a machine
 * without an identifier map behaves: the command has to work there, because a
 * dry run only needs a vocabulary.
 */
async function run(
	paths: {
		storage: string;
		content: string;
		rules: string;
		vocabulary: string;
	},
	values: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
	const previous = new Map(KEYS.map((key) => [key, process.env[key]]));

	process.env["MAINTAIN_CONFIG"] = join(temporary(), "Configuration.local.json");
	process.env["MAINTAIN_RULES"] = paths.rules;
	process.env["MAINTAIN_VOCABULARY"] = paths.vocabulary;
	process.env["MAINTAIN_STORAGE"] = paths.storage;
	process.env["MAINTAIN_CONTENT"] = paths.content;

	try {
		return (await Definition.run(values)) as Record<string, unknown>;
	} finally {
		for (const key of KEYS) {
			const value = previous.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

test("the command's dry run changes nothing on disk", async () => {
	const rules = json("Rules.json", RULES);
	const vocabulary = json("Vocabulary.json", {
		UI: ["figma"],
		CODE: ["compiler"],
	});
	const storage = archive([
		["alpha", "1", "figma figma layout"],
		["beta", "2", "nothing in particular"],
	]);
	const content = collection([stored("beta", ["CODE"], "manual", "I know this account")]);
	const before = readFileSync(join(content, "Author", "beta.json"), "utf8");

	const output = await run({ storage, content, rules, vocabulary });
	const counts = output["counts"] as Record<string, number>;
	const plan = output["plan"] as {
		handle: string;
		list: string;
		by: string;
		reason: string;
	}[];

	assert.equal(output["dryRun"], true);
	assert.equal(output["apply"], false);
	// The rules placed alpha in UI; beta is the person's own CODE decision.
	assert.deepEqual(
		plan.map((entry) => [entry.handle, entry.list, entry.by]),
		[
			["alpha", "UI", "rule"],
			["beta", "CODE", "manual"],
		],
	);
	assert.match(plan[0]?.reason ?? "", /figma/);
	assert.deepEqual(output["preserved"], [
		{ handle: "beta", list: "CODE", reason: "I know this account" },
	]);
	assert.equal(counts["memberships"], 2);
	assert.equal(counts["handles"], 2);
	assert.equal(counts["records"], 0);
	assert.equal(counts["added"], 0);
	assert.deepEqual(output["written"], []);
	assert.deepEqual(output["added"], []);
	assert.deepEqual((output["remaining"] as unknown[]).length, 2);

	// Nothing changed: the manual record is byte-identical and no record was
	// created for the author the rules placed.
	assert.equal(readFileSync(join(content, "Author", "beta.json"), "utf8"), before);
	assert.equal(existsSync(join(content, "Author", "alpha.json")), false);
});

test("applying without an identifier map is a named failure, not a guessed list", async () => {
	const rules = json("Rules.json", RULES);
	const vocabulary = json("Vocabulary.json", {
		UI: ["figma"],
		CODE: ["compiler"],
	});
	const storage = archive([["alpha", "1", "figma figma layout"]]);
	const content = temporary();

	const code = await codeOf(() => run({ storage, content, rules, vocabulary }, { apply: true }));
	assert.equal(code, "no-config");
});

test("--apply and --dry-run together are refused rather than silently ordered", async () => {
	const code = await codeOf(() => Definition.run({ apply: true, "dry-run": true }));
	assert.equal(code, "usage");
});

test("the command documents --apply as a flag, and argv without it leaves the write unarmed", () => {
	const document = schema(Definition) as Record<string, unknown>;
	const properties = document["properties"] as Record<string, unknown>;
	for (const name of ["--apply", "--dry-run"]) {
		assert.ok(name in properties, `missing ${name}`);
		assert.equal((properties[name] as Record<string, unknown>)["type"], "boolean");
	}

	const quiet = parse(["author", "distribute", "apply"], [Definition]);
	assert.equal(quiet.values["apply"], undefined);

	const armed = parse(["author", "distribute", "apply", "--apply"], [Definition]);
	assert.equal(armed.values["apply"], true);
});
