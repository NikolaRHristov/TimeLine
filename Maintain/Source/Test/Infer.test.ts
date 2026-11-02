import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { Definition } from "../Command/Author/Classify/Infer.ts";
import { root } from "../Configuration/Load/Load.ts";
import { DEFAULT_RULES } from "../Configuration/Rules/Rules.ts";
import type { Author } from "../Model/Author/Author.ts";
import type { Evidence } from "../Model/Author/Evidence.ts";
import type { ModelDecision } from "../Model/Author/Infer.ts";
import { BATCH_LIMIT, batches, parse, place, prompt } from "../Model/Author/Infer.ts";
import type { Post } from "../Model/Post/Post.ts";
import { merge } from "../Store/Merge/Merge.ts";
import { open as openShadow } from "../Store/Shadow/Shadow.ts";

const AT = "2026-11-01T10:00:00.000Z";

const directories: string[] = [];
const servers: (() => Promise<void>)[] = [];

function temporary(): string {
	const path = mkdtempSync(join(tmpdir(), "maintain-infer-"));
	directories.push(path);
	return path;
}

after(async () => {
	for (const close of servers) await close();
	for (const path of directories) rmSync(path, { recursive: true, force: true });
});

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

/** A content collection on disk holding the given author records. */
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

/** One evidence record, built by hand so a test says what it means. */
function evidence(handle: string, text: string, links: string[] = []): Evidence {
	const posts = [reading(handle, "1", text, links)];
	return {
		handle,
		name: handle,
		verified: false,
		posts: posts.length,
		domains: links.map((url) => ({ domain: new URL(url).hostname, count: 1 })),
		keywords: {},
		terms: {},
		excerpts: posts.map((post) => post.text),
	};
}

type Answer = { status?: number; content?: string };

type Stub = {
	url: string;
	/** Every request the server received, as the model saw it. */
	calls: { system: string; user: string }[];
	close: () => Promise<void>;
};

/**
 * An OpenAI-compatible endpoint on an ephemeral port.
 *
 * A real socket rather than a stubbed `fetch`, because the thing worth testing
 * is the whole path: the request body, the reply envelope, and what the command
 * does with a reply that is not JSON. `handler` sees the user message and the
 * call index, so a test can make the second batch misbehave.
 */
async function stub(handler: (user: string, index: number) => Answer): Promise<Stub> {
	const calls: { system: string; user: string }[] = [];

	const server = createServer((request, response) => {
		let body = "";
		request.setEncoding("utf8");
		request.on("data", (chunk: string) => {
			body += chunk;
		});
		request.on("end", () => {
			let messages: { role?: unknown; content?: unknown }[] = [];
			try {
				const parsed = JSON.parse(body) as { messages?: unknown };
				if (Array.isArray(parsed.messages)) messages = parsed.messages as { role?: unknown; content?: unknown }[];
			} catch {
				messages = [];
			}

			const field = (role: string): string => {
				const found = messages.find((entry) => entry.role === role);
				return typeof found?.content === "string" ? found.content : "";
			};

			calls.push({ system: field("system"), user: field("user") });

			const answer = handler(field("user"), calls.length - 1);
			response.writeHead(answer.status ?? 200, { "content-type": "application/json" });
			response.end(
				JSON.stringify({ choices: [{ message: { role: "assistant", content: answer.content ?? "" } }] }),
			);
		});
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as AddressInfo;

	const close = (): Promise<void> => new Promise<void>((resolve) => server.close(() => resolve()));
	servers.push(close);

	return { url: `http://127.0.0.1:${address.port}/v1/chat/completions`, calls, close };
}

type Output = {
	counts: {
		authors: number;
		ambiguous: number;
		asked: number;
		cached: number;
		manual: number;
		placed: number;
		declined: number;
		unanswered: number;
		rejected: number;
		failed: number;
		deferred: number;
	};
	batches: number;
	asked: string[];
	/** Only `--dry-run` carries the authors a real run would ask about. */
	planned?: string[];
	decisions: ModelDecision[];
	unanswered: string[];
	rejected: { handle: string | null; reason: string }[];
	failed: { handles: string[]; reason: string }[];
	preserved: { handle: string; list: string | null; reason: string }[];
};

const KEYS = [
	"MAINTAIN_STORAGE",
	"MAINTAIN_CONTENT",
	"MAINTAIN_MODEL_URL",
	"MAINTAIN_MODEL_KEY",
	"MAINTAIN_MODEL",
	"MAINTAIN_RULES",
] as const;

/** Run the command with every path it reads pointed at a temporary directory. */
async function run(
	paths: { storage: string; content: string; url?: string; rules?: string },
	values: Record<string, unknown> = {},
): Promise<Output> {
	const previous = new Map(KEYS.map((key) => [key, process.env[key]]));

	process.env["MAINTAIN_STORAGE"] = paths.storage;
	process.env["MAINTAIN_CONTENT"] = paths.content;
	process.env["MAINTAIN_MODEL_URL"] = paths.url ?? "";
	delete process.env["MAINTAIN_MODEL_KEY"];
	delete process.env["MAINTAIN_MODEL"];
	if (paths.rules === undefined) delete process.env["MAINTAIN_RULES"];
	else process.env["MAINTAIN_RULES"] = paths.rules;

	try {
		return (await Definition.run(values)) as Output;
	} finally {
		for (const key of KEYS) {
			const value = previous.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

/** Every handle a request asked about, in the order the prompt listed them. */
function asked(user: string): string[] {
	return [...user.matchAll(/^handle: (.+)$/gm)].map((match) => match[1] ?? "");
}

/** A well-formed reply for whatever the request asked about. */
function answer(user: string, list: string | null = "CODE"): string {
	return JSON.stringify({
		decisions: asked(user).map((handle) => ({
			handle,
			list,
			score: 6,
			gap: 3,
			reason: "the account keeps returning to one subject",
		})),
	});
}

/** An archive of `count` authors the rules leave ambiguous: UI 6, CODE 4. */
function ambiguous(count: number): [string, string, string][] {
	const entries: [string, string, string][] = [];
	for (let index = 1; index <= count; index += 1) {
		const handle = `alpha${String(index).padStart(2, "0")}`;
		entries.push([handle, String(index), "figma typography compiler"]);
	}
	return entries;
}

test("a batch never carries more than the limit, and the last one carries the rest", () => {
	const records = ambiguous(60).map(([handle]) => evidence(handle, "figma typography compiler"));
	const grouped = batches(records);

	assert.equal(BATCH_LIMIT, 25);
	assert.deepEqual(
		grouped.map((group) => group.length),
		[25, 25, 10],
	);
	assert.equal(
		grouped.flat().length,
		60,
	);
	// Order is preserved, so the same archive always asks the same questions.
	assert.deepEqual(
		grouped.flat().map((entry) => entry.handle),
		records.map((entry) => entry.handle),
	);
});

test("a batch limit below one is refused instead of looping", () => {
	assert.throws(
		() => batches([evidence("alpha", "figma")], 0),
		(error: unknown) =>
			typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "usage",
	);
});

test("the prompt is per author over aggregated evidence, not per post", () => {
	const posts = [
		reading("designer", "1", "figma typography", ["https://dribbble.com/shots"]),
		reading("designer", "2", "figma figma", ["https://dribbble.com/x"]),
	];
	const record: Evidence = {
		handle: "designer",
		name: "Designer",
		verified: true,
		posts: posts.length,
		domains: [{ domain: "dribbble.com", count: 2 }],
		keywords: { AI: 0, UI: 4, CODE: 0 },
		terms: { AI: {}, UI: { figma: 3, typography: 1 }, CODE: {} },
		excerpts: ["figma typography", "figma figma"],
	};

	const request = prompt([record], ["AI", "UI", "CODE"]);

	assert.match(request.system, /Reply with JSON only/);
	assert.match(request.system, /AI, UI, CODE/);
	// One block for one author: the handle is named once, with the aggregate.
	assert.equal(asked(request.user).length, 1);
	assert.match(request.user, /AUTHOR 1\/1/);
	assert.match(request.user, /domains: dribbble\.com\u00d72/);
	assert.match(request.user, /keyword hits: AI 0, UI 4, CODE 0/);
	assert.match(request.user, /bookmarked posts: 2/);
	assert.match(request.user, /- figma typography\n- figma figma/);
});

test("every answer is cached on disk with by:model, and the run says how many it asked", async () => {
	const storage = archive(ambiguous(30));
	const directory = temporary();
	const server = await stub((user) => ({ content: answer(user) }));

	const output = await run({ storage, content: directory, url: server.url });

	assert.equal(server.calls.length, 2);
	assert.deepEqual(
		server.calls.map((call) => asked(call.user).length),
		[25, 5],
	);
	assert.equal(output.counts.asked, 30);
	assert.equal(output.counts.placed, 30);
	assert.equal(output.counts.failed, 0);
	assert.equal(output.counts.deferred, 0);
	assert.equal(output.batches, 2);

	const record = JSON.parse(readFileSync(join(directory, "Author", "alpha07.json"), "utf8")) as {
		handle: string;
		lists: string[];
		decision: { by: string; confidence: number; reason: string; score?: number };
	};
	assert.equal(record.handle, "alpha07");
	assert.deepEqual(record.lists, ["CODE"]);
	assert.equal(record.decision.by, "model");
	assert.equal(record.decision.score, 6);
	assert.match(record.decision.reason, /one subject/);
});

test("a second run asks nothing at all and needs no endpoint", async () => {
	const storage = archive(ambiguous(30));
	const directory = temporary();
	const server = await stub((user) => ({ content: answer(user) }));

	const first = await run({ storage, content: directory, url: server.url });
	assert.equal(first.counts.asked, 30);

	const before = server.calls.length;
	// No URL: a fully cached run must not even look for one.
	const second = await run({ storage, content: directory, url: "" });

	assert.equal(server.calls.length, before);
	assert.equal(second.counts.asked, 0);
	assert.equal(second.counts.cached, 30);
	assert.deepEqual(second.decisions, []);
	assert.deepEqual(second.asked, []);
	assert.equal(second.batches, 0);
});

test("a reply that is not JSON fails the batch and writes nothing", async () => {
	const storage = archive(ambiguous(3));
	const directory = temporary();
	const server = await stub(() => ({ content: "Sure! Here is my classification: alpha01 looks like CODE." }));

	await assert.rejects(
		() => run({ storage, content: directory, url: server.url }),
		(error: unknown) =>
			typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "model-reply",
	);

	// Nothing was cached: the malformed answer left no trace to trust later.
	assert.equal(existsSync(join(directory, "Author")), false);
});

test("one bad batch does not take the run down, and the good batches stay cached", async () => {
	const storage = archive(ambiguous(30));
	const directory = temporary();
	const server = await stub((user, index) => ({
		content: index === 1 ? "not json at all" : answer(user),
	}));

	const output = await run({ storage, content: directory, url: server.url });

	// Both batches were answered - the second one with prose - so both were
	// paid for; only the first produced decisions.
	assert.equal(output.counts.asked, 30);
	assert.equal(output.counts.placed, 25);
	assert.equal(output.counts.failed, 1);
	assert.equal(output.failed[0]?.handles.length, 5);
	assert.match(output.failed[0]?.reason ?? "", /not JSON/);
	// `asked` names what the endpoint answered, so the count and the list agree.
	assert.equal(output.asked.length, output.counts.asked);

	// The failed batch's authors are exactly the ones with no record.
	assert.equal(existsSync(join(directory, "Author", "alpha01.json")), true);
	assert.equal(existsSync(join(directory, "Author", "alpha26.json")), false);
});

test("an entry that names an unknown author, an unknown list, or no reason is rejected", async () => {
	const storage = archive(ambiguous(3));
	const directory = temporary();
	const server = await stub(() => ({
		content: JSON.stringify({
			decisions: [
				{ handle: "alpha01", list: "CODE", reason: "compiler talk" },
				{ handle: "stranger", list: "CODE", reason: "not in this batch" },
				{ handle: "alpha02", list: "SPORTS", reason: "a list nobody configured" },
				{ handle: "alpha03", list: "CODE", reason: "   " },
			],
		}),
	}));

	const output = await run({ storage, content: directory, url: server.url });

	assert.equal(output.counts.placed, 1);
	assert.deepEqual(
		output.decisions.map((decision) => decision.handle),
		["alpha01"],
	);
	assert.equal(output.counts.rejected, 3);
	// Rejected entries are not cached, so they are still unanswered work.
	assert.deepEqual(output.unanswered, ["alpha02", "alpha03"]);
	assert.equal(existsSync(join(directory, "Author", "alpha02.json")), false);
	assert.equal(existsSync(join(directory, "Author", "stranger.json")), false);
});

test("a manual decision is never asked about and never rewritten", async () => {
	const storage = archive(ambiguous(2));
	const directory = content([{ handle: "alpha01", lists: ["UI"], by: "manual", reason: "I know this account" }]);
	const before = readFileSync(join(directory, "Author", "alpha01.json"), "utf8");
	const server = await stub((user) => ({ content: answer(user, "CODE") }));

	const output = await run({ storage, content: directory, url: server.url });

	assert.equal(output.counts.asked, 1);
	assert.deepEqual(server.calls.flatMap((call) => asked(call.user)), ["alpha02"]);
	assert.equal(readFileSync(join(directory, "Author", "alpha01.json"), "utf8"), before);
	assert.deepEqual(output.preserved, [{ handle: "alpha01", list: "UI", reason: "I know this account" }]);
});

test("a decline is a decision too: cached, list untouched, and not asked twice", async () => {
	const storage = archive(ambiguous(1));
	const directory = content([{ handle: "alpha01", lists: ["UI"], by: "rule", reason: "an earlier guess" }]);
	const server = await stub((user) => ({ content: answer(user, null) }));

	const first = await run({ storage, content: directory, url: server.url });
	assert.equal(first.counts.declined, 1);
	assert.equal(first.counts.placed, 0);

	const record = JSON.parse(readFileSync(join(directory, "Author", "alpha01.json"), "utf8")) as {
		lists: string[];
		decision: { by: string; confidence: number };
	};
	assert.equal(record.decision.by, "model");
	assert.equal(record.decision.confidence, 6);
	// The model placed nobody, so the person's own filing survives.
	assert.deepEqual(record.lists, ["UI"]);

	const second = await run({ storage, content: directory, url: "" });
	assert.equal(second.counts.asked, 0);
	assert.equal(second.counts.cached, 1);
});

test("--limit prices a partial run, and the rest is reported as deferred", async () => {
	const storage = archive(ambiguous(30));
	const directory = temporary();
	const server = await stub((user) => ({ content: answer(user) }));

	const output = await run({ storage, content: directory, url: server.url }, { limit: 10 });

	assert.equal(output.counts.asked, 10);
	assert.equal(output.counts.deferred, 20);
	assert.equal(server.calls.length, 1);
	assert.equal(asked(server.calls[0]?.user ?? "").length, 10);
});

test("--dry-run asks nothing and spends nothing", async () => {
	const storage = archive(ambiguous(30));
	const directory = temporary();
	const server = await stub((user) => ({ content: answer(user) }));

	const output = await run({ storage, content: directory, url: server.url }, { "dry-run": true });

	assert.equal(server.calls.length, 0);
	assert.equal(output.counts.asked, 0);
	assert.equal(output.counts.ambiguous, 30);
	assert.equal(output.batches, 2);
	assert.equal(output.planned?.length, 30);
});

test("a run with work to do and no endpoint configured is a named failure", async () => {
	const storage = archive(ambiguous(1));
	const directory = temporary();

	await assert.rejects(
		() => run({ storage, content: directory, url: "" }),
		(error: unknown) =>
			typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "no-model",
	);
});

test("an endpoint that refuses the request is a model-error, not a crash", async () => {
	const storage = archive(ambiguous(1));
	const directory = temporary();
	const server = await stub(() => ({ status: 401, content: '{"error":"bad key"}' }));

	await assert.rejects(
		() => run({ storage, content: directory, url: server.url }),
		(error: unknown) =>
			typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "model-error",
	);
});

test("a fenced reply is still JSON, and a bare array is accepted", () => {
	const handles = new Set(["alpha01"]);
	const lists = new Set(["AI", "UI", "CODE"]);

	const fenced = parse(
		'```json\n{"decisions":[{"handle":"alpha01","list":"UI","reason":"design work"}]}\n```',
		handles,
		lists,
	);
	assert.deepEqual(
		fenced.decisions.map((decision) => [decision.handle, decision.list, decision.by]),
		[["alpha01", "UI", "model"]],
	);
	assert.deepEqual(fenced.unanswered, []);

	const bare = parse('[{"handle":"alpha01","list":null,"reason":"nothing fits"}]', handles, lists);
	assert.equal(bare.decisions[0]?.list, null);
	// Optional numbers are carried when given and absent when not.
	assert.equal(bare.decisions[0]?.score, undefined);
});

test("place() keeps the history a classification must not rewrite", () => {
	const existing = {
		handle: "alpha01",
		name: "Alpha",
		verified: true,
		firstSeenAt: "2026-01-01T00:00:00.000Z",
		postCount: 9,
		lists: ["UI"],
		decision: { by: "rule", confidence: 1, reason: "an earlier guess" },
	};

	const placed = place(
		existing,
		evidence("alpha01", "figma"),
		{ handle: "alpha01", list: "CODE", reason: "compiler talk", by: "model", score: 4, gap: 2 },
		AT,
	);

	assert.equal(placed.firstSeenAt, "2026-01-01T00:00:00.000Z");
	assert.equal(placed.postCount, 9);
	assert.equal(placed.name, "Alpha");
	assert.deepEqual(placed.lists, ["CODE"]);
	assert.deepEqual(placed.decision, { by: "model", confidence: 4, reason: "compiler talk", score: 4, gap: 2 });
});

test("the model pass takes its notion of ambiguity from the rules file", async () => {
	// A threshold raised to an impossible height: every author must become
	// ambiguous, which can only happen if the command reads the file rather
	// than restating a cut-off in code.
	const rules = JSON.parse(readFileSync(join(root(), DEFAULT_RULES), "utf8")) as { threshold: unknown };
	rules.threshold = { score: 1000, gap: 1000 };
	const file = join(temporary(), "Rules.json");
	writeFileSync(file, JSON.stringify(rules), "utf8");

	const storage = archive(ambiguous(3));
	const directory = temporary();
	const server = await stub((user) => ({ content: answer(user) }));

	const output = await run({ storage, content: directory, url: server.url, rules: file });

	assert.equal(output.counts.ambiguous, 3);
	assert.equal(output.counts.asked, 3);
	assert.equal(output.counts.placed, 3);
});
