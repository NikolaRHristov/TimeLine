import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { isFailure } from "../CLI/Parser/Output/Failure.ts";
import { Definition as Approve } from "../Command/Vote/Approve/Approve.ts";
import { Definition as Nominate } from "../Command/Vote/Nominate/Nominate.ts";
import { Definition as Queue } from "../Command/Vote/Queue/Queue.ts";
import { Definition as Rank } from "../Command/Vote/Rank/Rank.ts";
import { Definition as Reject } from "../Command/Vote/Reject/Reject.ts";
import { Definition as Sync } from "../Command/Vote/Sync/Sync.ts";
import { candidates, dense, order, place, totals, type CuratedEntry } from "../Model/Vote/Vote.ts";
import { open as openVote } from "../Store/Vote/Vote.ts";

const roots: string[] = [];
let content = "";
let votes = "";

function temporary(): string {
	const path = mkdtempSync(join(tmpdir(), "maintain-vote-"));
	roots.push(path);
	return path;
}

/**
 * A content root and a vote store per test, plus the environment that points
 * the commands at them. `MAINTAIN_VOTE_TRANSPORT=none` is deliberate: these
 * tests must never reach a real project, and the read-only path is the one the
 * default build uses.
 */
beforeEach(() => {
	const root = temporary();
	content = join(root, "Content");
	votes = join(root, "Vote");
	process.env["MAINTAIN_CONTENT"] = content;
	process.env["MAINTAIN_VOTE_STORAGE"] = votes;
	process.env["MAINTAIN_VOTE_TRANSPORT"] = "none";
});

after(() => {
	for (const path of roots) rmSync(path, { recursive: true, force: true });
	delete process.env["MAINTAIN_CONTENT"];
	delete process.env["MAINTAIN_VOTE_STORAGE"];
	delete process.env["MAINTAIN_VOTE_TRANSPORT"];
});

/** One curated row, as a fixture: only id and rank matter to the ordering. */
function curated(id: string, rank: number): CuratedEntry {
	return {
		id,
		rank,
		votes: 0,
		approvedAt: "2026-01-01T00:00:00.000Z",
		approvedBy: "manual",
	};
}

function codes(ranks: readonly CuratedEntry[]): number[] {
	return ranks.map((entry) => entry.rank);
}

async function nominate(id: string): Promise<void> {
	await Nominate.run({ url: `https://x.com/example/status/${id}` });
}

test("ranks are dense and unique after any sequence of place", () => {
	let index = dense([curated("a", 1), curated("b", 5), curated("c", 2)]);
	assert.deepEqual(
		index.map((entry) => entry.id),
		["a", "c", "b"],
	);
	assert.deepEqual(codes(index), [1, 2, 3]);

	index = place(index, curated("d", 0), 2);
	assert.deepEqual(
		index.map((entry) => entry.id),
		["a", "d", "c", "b"],
	);
	assert.deepEqual(codes(index), [1, 2, 3, 4]);

	// Out of range clamps instead of leaving a gap.
	index = place(index, curated("d", 0), 99);
	assert.deepEqual(codes(index), [1, 2, 3, 4]);
	assert.equal(index[index.length - 1]?.id, "d");

	index = place(index, curated("d", 0), -3);
	assert.equal(index[0]?.id, "d");
	assert.deepEqual(codes(index), [1, 2, 3, 4]);

	// Moving an entry never duplicates it.
	index = place(index, curated("b", 0), 1);
	assert.deepEqual(
		index.map((entry) => entry.id),
		["b", "d", "a", "c"],
	);
	assert.deepEqual(codes(index), [1, 2, 3, 4]);
	assert.equal(new Set(index.map((entry) => entry.id)).size, index.length);
});

test("a hand-edited duplicate rank still orders deterministically", () => {
	const index = dense([curated("z", 2), curated("a", 2), curated("m", 1)]);
	assert.deepEqual(
		index.map((entry) => entry.id),
		["m", "a", "z"],
	);
	assert.deepEqual(codes(index), [1, 2, 3]);
	assert.deepEqual(order([]), []);
});

test("the queue is candidates only, votes descending, then oldest first", async () => {
	const store = openVote(content);
	const base = {
		url: "https://x.com/example/status/1",
		author: { handle: "example", name: "Example", verified: false },
		lists: [],
		votedAt: "2026-01-01T00:00:00.000Z",
		nominatedAt: "2026-01-01T00:00:00.000Z",
	};
	store.writeVoted({ ...base, id: "1", votes: 1, status: "candidate" });
	store.writeVoted({ ...base, id: "2", votes: 9, status: "candidate" });
	store.writeVoted({ ...base, id: "3", votes: 1, status: "rejected" });
	store.writeVoted({
		...base,
		id: "4",
		votes: 100,
		status: "approved",
	});

	const all = store.votedAll();
	assert.deepEqual(
		candidates(all).map((entry) => entry.id),
		["2", "1"],
	);
	assert.deepEqual(totals(all), { candidate: 2, approved: 1, rejected: 1 });

	const queue = (await Queue.run({})) as {
		count: number;
		totals: Record<string, number>;
		entries: { id: string; age: number }[];
	};
	assert.equal(queue.count, 2);
	assert.equal(queue.totals["rejected"], 1);
	assert.equal(queue.entries[0]?.id, "2");
	// Age is whole days between the nomination and now: a number, never NaN.
	assert.equal(typeof queue.entries[0]?.age, "number");
	assert.ok((queue.entries[0]?.age ?? -1) >= 0);
});

test("an empty index is a normal state, not an error", async () => {
	assert.deepEqual(candidates([]), []);
	assert.deepEqual(order([]), []);
	assert.deepEqual(dense([]), []);
	assert.deepEqual(totals([]), { candidate: 0, approved: 0, rejected: 0 });
	assert.deepEqual(openVote(content).votedAll(), []);
	assert.deepEqual(openVote(content).curatedAll(), []);

	const queue = (await Queue.run({})) as { count: number; entries: unknown[] };
	assert.equal(queue.count, 0);
	assert.deepEqual(queue.entries, []);
});

test("nominate is idempotent and writes one candidate", async () => {
	await nominate("42");

	const again = (await Nominate.run({
		url: "https://x.com/example/status/42",
	})) as { nominated: boolean; unchanged: boolean; status: string };
	assert.equal(again.nominated, false);
	assert.equal(again.unchanged, true);
	assert.equal(again.status, "candidate");

	const store = openVote(content);
	assert.equal(store.voted("42")?.status, "candidate");
	assert.equal(store.voted("42")?.votes, 0);
	assert.equal(store.curatedAll().length, 0);
});

test("approve is idempotent and freezes rank, votes and timestamp", async () => {
	await nominate("7");

	const first = (await Approve.run({ id: "7" })) as {
		rank: number;
		unchanged: boolean;
	};
	assert.equal(first.rank, 1);
	assert.equal(first.unchanged, false);

	const file = join(content, "Curated", "7.json");
	const before = readFileSync(file, "utf8");

	const second = (await Approve.run({ id: "7" })) as {
		rank: number;
		unchanged: boolean;
	};
	assert.equal(second.unchanged, true);
	assert.equal(second.rank, 1);
	assert.equal(readFileSync(file, "utf8"), before);

	const store = openVote(content);
	assert.equal(store.voted("7")?.status, "approved");
	assert.equal(store.curated("7")?.approvedBy, "manual");
	assert.equal(store.curated("7")?.votes, 0);
});

test("approving three entries keeps ranks 1..3, and rank moves stay dense", async () => {
	for (const id of ["1", "2", "3"]) await nominate(id);
	for (const id of ["1", "2", "3"]) await Approve.run({ id });

	let index = openVote(content).curatedAll();
	assert.deepEqual(codes(dense(index)), [1, 2, 3]);
	assert.deepEqual(
		order(index).map((entry) => entry.id),
		["1", "2", "3"],
	);

	await Rank.run({ id: "3", rank: 1 });
	index = openVote(content).curatedAll();
	assert.deepEqual(
		order(index).map((entry) => entry.id),
		["3", "1", "2"],
	);
	assert.deepEqual(codes(dense(index)), [1, 2, 3]);

	// Re-ranking to the position it already holds changes nothing.
	const same = (await Rank.run({ id: "3", rank: 1 })) as {
		unchanged: boolean;
	};
	assert.equal(same.unchanged, true);
});

test("a rejected entry is a tombstone: no approve, no second nomination", async () => {
	await nominate("9");
	const rejected = (await Reject.run({ id: "9", reason: "off topic" })) as {
		status: string;
	};
	assert.equal(rejected.status, "rejected");

	await assert.rejects(
		() => Approve.run({ id: "9" }),
		(error: unknown) => isFailure(error) && error.code === "tombstone",
	);
	await assert.rejects(
		() => Nominate.run({ url: "https://x.com/example/status/9" }),
		(error: unknown) => isFailure(error) && error.code === "tombstone",
	);

	// The file is still there: the decision is kept, not deleted.
	assert.equal(openVote(content).voted("9")?.status, "rejected");
});

test("rejecting what is already curated is refused, not an unpublish", async () => {
	await nominate("11");
	await Approve.run({ id: "11" });

	await assert.rejects(
		() => Reject.run({ id: "11" }),
		(error: unknown) => isFailure(error) && error.code === "already-curated",
	);
	assert.equal(openVote(content).curated("11")?.rank, 1);
});

test("rejecting twice is a no-op", async () => {
	await nominate("12");
	await Reject.run({ id: "12" });
	const again = (await Reject.run({ id: "12" })) as { unchanged: boolean };
	assert.equal(again.unchanged, true);
});

test("unknown ids fail with a code and a next step", async () => {
	await assert.rejects(
		() => Approve.run({ id: "404" }),
		(error: unknown) => isFailure(error) && error.code === "no-entry",
	);
	await assert.rejects(
		() => Rank.run({ id: "404", rank: 1 }),
		(error: unknown) => isFailure(error) && error.code === "not-curated",
	);
	await assert.rejects(
		() => Nominate.run({}),
		(error: unknown) => isFailure(error) && error.code === "usage",
	);
});

test("sync without a transport fails no-transport and writes nothing", async () => {
	await nominate("21");
	const file = join(content, "Voted", "21.json");
	const before = readFileSync(file, "utf8");

	await assert.rejects(
		() => Sync.run({}),
		(error: unknown) => isFailure(error) && error.code === "no-transport",
	);

	assert.equal(readFileSync(file, "utf8"), before);
	assert.equal(existsSync(votes), false);
});
