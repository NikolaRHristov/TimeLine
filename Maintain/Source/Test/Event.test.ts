import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileName } from "../Model/Event/Event.ts";
import { open as openShadow } from "../Store/Shadow/Shadow.ts";

const roots: string[] = [];

function temporary(): string {
	const path = mkdtempSync(join(tmpdir(), "maintain-event-"));
	roots.push(path);
	return path;
}

after(() => {
	for (const path of roots) rmSync(path, { recursive: true, force: true });
});

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

/** Write one event file under a name of the test's own choosing, as an old store would hold. */
function plant(directory: string, name: string, body: unknown): string {
	mkdirSync(join(directory, "Event"), { recursive: true });
	const path = join(directory, "Event", name);
	writeFileSync(path, `${JSON.stringify(body)}\n`, "utf8");
	return path;
}

const AT = "2026-11-01T10:00:00.000Z";

test("two subjects that flatten to one slug name two different files", () => {
	const slash = fileName(AT, "bookmark.added", "a/b");
	const query = fileName(AT, "bookmark.added", "a?b");

	assert.notEqual(slash, query);
	// The readable slug survives, so a person can still see what the file is
	// about; the digest is the only part that separates the two.
	assert.match(slash, /-a-b-[0-9a-f]{8}\.json$/);
	assert.match(query, /-a-b-[0-9a-f]{8}\.json$/);
	// The digest covers the subject alone, so a subject always names the same.
	assert.equal(fileName(AT, "scrape.finished", "a/b"), fileName(AT, "scrape.finished", "a/b"));
	assert.match(fileName(AT, "scrape.finished", "a/b"), /-a-b-[0-9a-f]{8}\.json$/);
});

test("events(subject) returns that subject's trail and never another's", () => {
	const directory = temporary();
	const store = openShadow(directory);

	store.event("bookmark.added", "a/b", { which: "slash" }, AT);
	store.event("bookmark.added", "a?b", { which: "query" }, "2026-11-01T10:00:01.000Z");

	// Two subjects are two events, so two files.
	assert.equal(readdirSync(join(directory, "Event")).length, 2);

	const slash = store.events("a/b");
	assert.equal(slash.length, 1);
	assert.equal(slash[0]!.record.subject, "a/b");
	assert.equal(slash[0]!.record.payload["which"], "slash");

	const query = store.events("a?b");
	assert.equal(query.length, 1);
	assert.equal(query[0]!.record.subject, "a?b");
	assert.equal(query[0]!.record.payload["which"], "query");

	// No argument still means every event, oldest first.
	const all = store.events();
	assert.equal(all.length, 2);
	assert.deepEqual(
		all.map((entry) => entry.record.subject),
		["a/b", "a?b"],
	);
});

test("two events of one kind and subject in one millisecond both stay in the trail", () => {
	const directory = temporary();
	const store = openShadow(directory);

	// The second write appends `-2` instead of overwriting the first, so the
	// pre-filter must not assume a subject's name ends where the digest does.
	store.event("bookmark.added", "a/b", { which: "first" }, AT);
	store.event("bookmark.added", "a/b", { which: "second" }, AT);

	assert.equal(readdirSync(join(directory, "Event")).length, 2);
	const trail = store.events("a/b");
	assert.equal(trail.length, 2);
	assert.deepEqual(trail.map((entry) => entry.record.payload["which"]).sort(), [
		"first",
		"second",
	]);
});

test("an event written under the old name is still found", () => {
	const directory = temporary();
	const store = openShadow(directory);
	// The shape written before the digest existed: `<ISO>-<kind>-<slug>.json`.
	const legacy = plant(directory, "2026-11-01T09-00-00-000Z-bookmark.added-a-b.json", {
		at: "2026-11-01T09:00:00.000Z",
		kind: "bookmark.added",
		subject: "a/b",
		payload: { which: "legacy" },
	});

	const trail = store.events("a/b");
	assert.equal(trail.length, 1);
	assert.equal(trail[0]!.file, legacy);
	assert.equal(trail[0]!.record.payload["which"], "legacy");
	// And it is still counted by the unfiltered read.
	assert.equal(store.events().length, 1);
});

test("a record whose own subject differs is never returned for another subject", () => {
	const directory = temporary();
	const store = openShadow(directory);
	// A file named for `a/b` that holds `a?b`: the name is not the identity, so
	// the query must go by the record.
	plant(directory, "2026-11-01T08-00-00-000Z-bookmark.added-a-b.json", {
		at: "2026-11-01T08:00:00.000Z",
		kind: "bookmark.added",
		subject: "a?b",
		payload: {},
	});

	assert.deepEqual(store.events("a/b"), []);
	assert.equal(store.events("a?b").length, 1);
});

test("a record without a subject string is never matched by a subject query", () => {
	const directory = temporary();
	const store = openShadow(directory);
	plant(directory, "2026-11-01T07-00-00-000Z-bookmark.added-a-b.json", {
		at: "2026-11-01T07:00:00.000Z",
		kind: "bookmark.added",
		payload: {},
	});

	assert.deepEqual(store.events("a/b"), []);
	// It is still a readable event, so the unfiltered read keeps it.
	assert.equal(store.events().length, 1);
});

test("an unreadable event file is skipped with a warning, not thrown", () => {
	const directory = temporary();
	const store = openShadow(directory);
	mkdirSync(join(directory, "Event"), { recursive: true });
	writeFileSync(
		join(directory, "Event", "2026-11-01T06-00-00-000Z-bookmark.added-a-b.json"),
		"{ truncated",
		"utf8",
	);
	store.event("bookmark.added", "a/b", {}, AT);

	const { value: trail, text } = capture(() => store.events("a/b"));

	assert.equal(trail.length, 1);
	assert.equal(trail[0]!.record.subject, "a/b");
	assert.match(
		text,
		/skipping unreadable event Event\/2026-11-01T06-00-00-000Z-bookmark\.added-a-b\.json/,
	);
});
