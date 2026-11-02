/**
 * The workspace store's own assertions.
 *
 * These are the rules the store states, expressed as the smallest thing that can
 * fail: two islands reading one value, an adopted field that a later island does
 * not overwrite, a publish that lands on the next free seat, a record already on
 * the canvas that is opened rather than placed twice, a context the session does
 * not hold that cannot be selected, and a failed session read that keeps the
 * anonymous slot and says so once.
 *
 * The browser half - that the built page really mounts two islands and that a
 * press in one moves the other - is
 * `Documentation/Skill/Progressive-Enhancement/Reference/workspace-store-audit.mjs`,
 * because a rendered first paint is not something a unit test can see.
 *
 *     node --test Source/Test/Workspace.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Column } from "../Component/Workspace/DrawerColumn.tsx";
import type { Stage } from "../Component/Workspace/Provenance.tsx";
import { Own, Room } from "../Script/Session/Context.ts";
import { Seats, type Tile } from "../Script/Workspace/Seat.ts";
import { store, type WorkspaceStore } from "../Script/Workspace/Store.ts";

const Stages: Stage[] = [
	{ Key: "source", Label: "Source · 2 events", Tone: "var(--stage-source)", Events: 2 },
	{ Key: "ingestion", Label: "Ingestion · 1 event", Tone: "var(--stage-ingestion)", Events: 1 },
];

const Columns: Column[] = [
	{
		Key: "bookmark",
		Label: "Bookmarks",
		Tone: "var(--stage-source)",
		Ghost: "Drag to showcase ↓",
		Entries: [
			{ Id: "1", Title: "A saved post", Meta: "@someone · 12 likes", Kind: "text" },
			{ Id: "2", Title: "Another saved post", Meta: "@someone · 4 likes", Kind: "text" },
		],
	},
];

const Tiles: Tile[] = [{ ...Seats[0]!, Id: "curated-1", Title: "Already on the canvas" }];

const OwnContext = Own("My Files", "Showcase · Network");
const Work = Room("work", "Work", "Showcase · Work");

/** A store with no browser around it: every call makes its own instance. */
function fresh(): WorkspaceStore {
	return store();
}

test("a second island reads what the first one adopted", () => {
	// `store()` answers one instance per page only when there is a page; the
	// browser global is what the accessor keys on.
	const global_ = globalThis as { window?: unknown };
	global_.window = globalThis;

	try {
		const First = store();
		const Second = store();

		assert.equal(First, Second, "two islands must be handed one store");

		First.Adopt({ Stages, Columns, Tiles });
		Second.Select("ingestion");

		assert.equal(
			First.State.Stage,
			"ingestion",
			"a selection made through one island is the value the other reads",
		);
	} finally {
		delete global_.window;
	}
});

test("adopt seeds a field once and never overwrites it", () => {
	const Store = fresh();

	Store.Adopt({ Stages, Columns, Tiles });

	assert.equal(Store.State.Stage, "source");
	assert.equal(Store.State.Column, "bookmark");
	assert.deepEqual(Store.State.Published, Tiles);

	Store.Select("ingestion");
	Store.Adopt({ Stages, Columns, Tiles: [] });

	assert.equal(Store.State.Stage, "ingestion", "a second island must not reset the selection");
	assert.deepEqual(
		Store.State.Published,
		Tiles,
		"a second island must not empty a canvas that was already seeded",
	);
});

test("adopt takes the stage the page names over the first one it has", () => {
	const Store = fresh();

	Store.Adopt({ Stages, Stage: "ingestion" });

	assert.equal(Store.State.Stage, "ingestion");
});

test("publish places the open record on the first free seat", () => {
	const Store = fresh();

	Store.Adopt({ Stages, Columns, Tiles });
	Store.Open("2");
	Store.Publish(Columns[0]!, Columns[0]!.Entries[1]!);

	assert.equal(Store.State.Published.length, 2);
	assert.equal(Store.State.Published[1]!.Id, "2");
	assert.equal(
		Store.State.Published[1]!.Column,
		Seats[1]!.Column,
		"the second record takes the second seat",
	);
	assert.equal(Store.State.Published[1]!.Eyebrow, "Bookmarks");
	assert.equal(Store.State.Published[1]!.Title, "Another saved post");
});

test("a record already on the canvas is opened rather than placed twice", () => {
	const Store = fresh();

	Store.Adopt({ Stages, Columns, Tiles });
	Store.Open("2");
	Store.Publish(Columns[0]!, Columns[0]!.Entries[1]!);
	Store.Open(null);
	Store.Publish(Columns[0]!, Columns[0]!.Entries[1]!);

	assert.equal(Store.State.Published.length, 2, "the canvas must not hold the record twice");
	assert.equal(Store.State.Record, "2", "the second drop opens the record it found");
});

test("a full canvas places nothing", () => {
	const Store = fresh();

	const Full: Tile[] = Seats.map((Seat) => ({ ...Seat, Title: `Record ${Seat.Id}` }));

	Store.Adopt({ Stages, Columns, Tiles: Full });
	Store.Publish(Columns[0]!, Columns[0]!.Entries[0]!);

	assert.equal(
		Store.State.Published.length,
		Seats.length,
		"a full canvas must not stack records",
	);
});

test("a context the slot does not hold is not selectable", () => {
	const Store = fresh();

	Store.Adopt({ Stages, Columns, Tiles, Contexts: [OwnContext] });

	assert.equal(Store.State.Session?.Context.Kind, "own");

	Store.Switch(Work);

	assert.equal(
		Store.State.Session?.Context.Kind,
		"own",
		"a room the session holds no membership for cannot be selected",
	);
});

test("a failed session read keeps the anonymous slot and warns once", async () => {
	const global_ = globalThis as { document?: unknown };
	const warned: unknown[] = [];
	const original = console.warn;

	// `Resolve` reads the page, so the store needs one to exist; the reader is
	// passed explicitly, which is the seam a transport would arrive through.
	global_.document = { getElementById: () => null };
	console.warn = (...args: unknown[]) => {
		warned.push(args[0]);
	};

	try {
		const Store = fresh();

		Store.Adopt({ Stages, Columns, Tiles, Contexts: [OwnContext] });

		await Store.Resolve(() => Promise.reject(new Error("the seam is down")));
		await Store.Resolve(() => Promise.reject(new Error("the seam is down")));

		assert.equal(
			Store.State.Session?.Identity,
			null,
			"a failed read leaves the slot anonymous",
		);
		assert.equal(Store.State.Session?.State, "static", "a failed read keeps the build's view");
		assert.equal(warned.length, 1, "a failed read is said once, not once per island");
	} finally {
		console.warn = original;
		delete global_.document;
	}
});
