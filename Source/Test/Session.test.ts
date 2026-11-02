/**
 * The session layer's own assertions.
 *
 * These are the rules RFC-0043 states, expressed as the smallest thing that can
 * fail: a context switch that moves the drawer, a role that reaches an act it
 * should not, a named act that finds a way across the seam, a stale write that
 * overwrites, and a failed read that empties the page. The browser-side half -
 * that the built page mounts with an empty slot and renders the same HTML with
 * scripts off - is `Documentation/Skill/Tool-Archive/Reference/session-audit.mjs`,
 * because a rendered first paint is not something a unit test can see.
 *
 *     node --test Source/Test/Session.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Key, Own, Room, type Context } from "../Script/Session/Context.ts";
import { OwnerOf, Project, Settle } from "../Script/Session/Ownership.ts";
import { Allows, type Grant, type Role } from "../Script/Session/Role.ts";
import {
	ActWithoutCrossingTheSeam,
	CrossTheSeam,
	DrawerActs,
	IsCrossing,
	type Crossing,
} from "../Script/Session/Seam.ts";
import {
	Anonymous,
	Enter,
	MembershipOf,
	Resolve,
	Select,
	StandingOf,
	type Membership,
	type Slot,
} from "../Script/Session/Session.ts";

const AsOf = "2026-11-02T09:30:00.000Z";

const OwnContext = Own("My Files", "Showcase · Network");
const Work = Room("work", "Work", "Showcase · Work");

/** A drawer with a nesting and a multi-byte character, so "identical" means bytes. */
const Drawer = {
	Columns: [
		{
			Key: "bookmark",
			Entries: [
				{ Id: "1", Title: "A saved post - with an em dash", Meta: "@someone · 12 likes" },
			],
		},
		{
			Key: "voted",
			Entries: [{ Id: "2", Title: "A candidate", Meta: "candidate · 3 votes" }],
		},
	],
};

const Member: Membership = {
	Room: Work,
	Role: "member",
	Grants: ["author"],
	Wrapped: true,
	OpenVote: false,
};

const Session: Slot = {
	Identity: { Id: "did:key:me", Name: "Me", PublicKey: "z6Mk-me" },
	Memberships: [Member],
	Context: OwnContext,
	Contexts: [OwnContext, Work],
	State: "snapshot",
	AsOf,
};

/** What a caller's own store supplies. The session layer only reads the keys. */
const Supply = {
	Drawer,
	Canvases: {
		[Key(OwnContext)]: ["own-tile"],
		[Key(Work)]: ["work-tile-a", "work-tile-b"],
	},
	Built: ["built-tile"],
	Pending: [],
};

test("the slot starts empty, and the build's view is what it says it is", () => {
	const Empty = Anonymous([OwnContext], AsOf);

	assert.equal(Empty.Identity, null);
	assert.deepEqual(Empty.Memberships, []);
	assert.equal(Empty.State, "static");
	assert.equal(Empty.AsOf, AsOf);
	assert.deepEqual(
		Empty.Contexts.map((Entry) => Entry.Label),
		["My Files"],
	);

	const Standing = StandingOf(Empty);

	assert.equal(Standing.Role, "reader");
	assert.equal(Standing.Identity, null);
	assert.deepEqual(Standing.Grants, []);
});

test("switching context leaves the drawer byte-identical", () => {
	const Before = Enter(Select(Session, OwnContext), Supply);
	const After = Enter(Select(Session, Work), Supply);

	// The same value, not an equal one: the session layer never copied the
	// drawer, so there is nothing it could have altered.
	assert.equal(After.Drawer, Before.Drawer);

	// And the bytes, because "unchanged" is a claim about content rather than
	// about an object identity that a later refactor could satisfy by accident.
	const Left = Buffer.from(JSON.stringify(Before.Drawer), "utf8");
	const Right = Buffer.from(JSON.stringify(After.Drawer), "utf8");

	assert.ok(Left.equals(Right), "the drawer's records changed across a context switch");
	assert.ok(Left.length > 0, "the fixture drawer is empty, so the comparison proves nothing");
});

test("switching context changes the canvas and the publish destination", () => {
	const Before = Enter(Select(Session, OwnContext), Supply);
	const After = Enter(Select(Session, Work), Supply);

	assert.deepEqual(Before.Canvas, ["own-tile"]);
	assert.deepEqual(After.Canvas, ["work-tile-a", "work-tile-b"]);
	assert.equal(Before.Destination, "Showcase · Network");
	assert.equal(After.Destination, "Showcase · Work");
});

test("a room the session holds no membership for is not selectable", () => {
	const Elsewhere = Room("elsewhere", "Elsewhere", "Showcase · Elsewhere");
	const Next = Select(Session, Elsewhere);

	assert.equal(Next.Context, OwnContext);
	assert.equal(Next, Session);
});

test("a membership without its key epoch wrapped is joined, not an empty canvas", () => {
	const Joined: Slot = { ...Session, Memberships: [{ ...Member, Wrapped: false }] };
	const Contract = Enter(Select(Joined, Work), Supply);

	assert.equal(Contract.State, "joined");
	// The canvas is the build's, because "not readable" is not "empty".
	assert.deepEqual(Contract.Canvas, ["built-tile"]);
});

test("a context with no canvas of its own falls back to the build's", () => {
	const Contract = Enter(Session, { ...Supply, Canvases: {} });

	assert.deepEqual(Contract.Canvas, ["built-tile"]);
});

test("the three roles are held at once, one context at a time", () => {
	const Own_ = StandingOf(Session);
	const Room_ = StandingOf(Select(Session, Work));
	const Stranger = StandingOf({ ...Session, Identity: null });

	assert.equal(Own_.Role, "owner");
	assert.equal(Room_.Role, "member");
	assert.equal(Stranger.Role, "reader");
	assert.equal(MembershipOf(Session), undefined);
	assert.equal(MembershipOf(Select(Session, Work)), Member);
});

test("the permission matrix is §4 transcribed, cell by cell", () => {
	const Table: readonly {
		readonly Role: Role;
		readonly Grants: readonly Grant[];
		readonly OpenVote?: boolean;
		readonly Act: Parameters<typeof Allows>[1];
		readonly Subject?: { readonly Author: string };
		readonly Allowed: boolean;
	}[] = [
		// Read a canvas: every role, and visibility is not a role question.
		{ Role: "reader", Grants: [], Act: "read-canvas", Allowed: true },
		{ Role: "member", Grants: [], Act: "read-canvas", Allowed: true },
		{ Role: "owner", Grants: [], Act: "read-canvas", Allowed: true },

		// Read and write a drawer: the owner only. The drawer does not travel.
		{ Role: "reader", Grants: [], Act: "read-drawer", Allowed: false },
		{ Role: "member", Grants: ["author"], Act: "read-drawer", Allowed: false },
		{ Role: "owner", Grants: [], Act: "read-drawer", Allowed: true },
		{ Role: "member", Grants: ["author"], Act: "write-drawer", Allowed: false },
		{ Role: "owner", Grants: [], Act: "write-drawer", Allowed: true },

		// Publish into one's own canvas: the owner.
		{ Role: "member", Grants: ["author"], Act: "publish-own", Allowed: false },
		{ Role: "owner", Grants: [], Act: "publish-own", Allowed: true },

		// Publish into a room: the `author` grant, and an owner needs it too.
		{ Role: "member", Grants: ["author"], Act: "publish-into-room", Allowed: true },
		{ Role: "member", Grants: ["curator"], Act: "publish-into-room", Allowed: false },
		{ Role: "owner", Grants: [], Act: "publish-into-room", Allowed: false },
		{ Role: "reader", Grants: [], Act: "publish-into-room", Allowed: false },

		// Withdraw: a member's own records, any record in the owner's drawer.
		{
			Role: "member",
			Grants: ["author"],
			Act: "withdraw",
			Subject: { Author: "did:key:me" },
			Allowed: true,
		},
		{
			Role: "member",
			Grants: ["author"],
			Act: "withdraw",
			Subject: { Author: "did:key:other" },
			Allowed: false,
		},
		{ Role: "member", Grants: ["author"], Act: "withdraw", Allowed: false },
		{
			Role: "owner",
			Grants: [],
			Act: "withdraw",
			Subject: { Author: "did:key:other" },
			Allowed: true,
		},

		// Vote: members and owners, and a reader only under `open-vote`.
		{ Role: "reader", Grants: [], Act: "vote", Allowed: false },
		{ Role: "reader", Grants: [], OpenVote: true, Act: "vote", Allowed: true },
		{ Role: "member", Grants: [], Act: "vote", Allowed: true },

		// Select: the owner, or a member holding `curator`.
		{ Role: "member", Grants: [], Act: "select", Allowed: false },
		{ Role: "member", Grants: ["curator"], Act: "select", Allowed: true },
		{ Role: "owner", Grants: [], Act: "select", Allowed: true },

		// Arrange: every role, because the viewer is the only writer.
		{ Role: "reader", Grants: [], Act: "arrange", Allowed: true },
		{ Role: "member", Grants: [], Act: "arrange", Allowed: true },
		{ Role: "owner", Grants: [], Act: "arrange", Allowed: true },

		// Admit: the owner, or a member holding `authority`.
		{ Role: "member", Grants: [], Act: "admit", Allowed: false },
		{ Role: "member", Grants: ["authority"], Act: "admit", Allowed: true },
		{ Role: "owner", Grants: [], Act: "admit", Allowed: true },

		// Presence: members and owners. A reader is told nothing, not "offline".
		{ Role: "reader", Grants: [], Act: "read-presence", Allowed: false },
		{ Role: "member", Grants: [], Act: "read-presence", Allowed: true },
		{ Role: "owner", Grants: [], Act: "read-presence", Allowed: true },
	];

	for (const Row of Table) {
		const Standing = {
			Role: Row.Role,
			Grants: Row.Grants,
			Identity: "did:key:me",
			OpenVote: Row.OpenVote ?? false,
		};

		assert.equal(
			Allows(Standing, Row.Act, Row.Subject),
			Row.Allowed,
			`${Row.Role} ${Row.Act}: expected ${Row.Allowed}`,
		);
	}
});

test("publishing is the only verb the seam admits", () => {
	const Owner = StandingOf(Session);

	const Published = CrossTheSeam({
		Act: "publish",
		Context: OwnContext,
		Standing: Owner,
		Record: { Id: "1", Author: "did:key:me", Version: 3 },
	});

	assert.equal(Published.Crossed, true);
	assert.equal(Published.Crossed && Published.Audience, "public");
	assert.equal(Published.Crossed && Published.Visibility, "public");
	assert.deepEqual(Published.Crossed && Published.Owners, ["shadow", "room"]);

	// A vote is not a crossing, whatever the type says at the call site.
	const Voted = CrossTheSeam({
		Act: "vote" as unknown as Crossing,
		Context: OwnContext,
		Standing: Owner,
		Record: { Id: "1", Author: "did:key:me", Version: 3 },
	});

	assert.deepEqual(Voted, { Crossed: false, Reason: "not-a-crossing-act" });
	assert.equal(IsCrossing("curate"), false);
	assert.equal(IsCrossing("withdraw"), true);
});

test("a member cannot publish another member's record", () => {
	const Member_ = StandingOf(Select(Session, Work));

	const Result = CrossTheSeam({
		Act: "publish",
		Context: Work,
		Standing: Member_,
		Record: { Id: "9", Author: "did:key:other", Version: 1 },
	});

	assert.deepEqual(Result, { Crossed: false, Reason: "not-author" });
});

test("publishing into a room needs the author grant, even for its owner", () => {
	const OwnerOfRoom = {
		Role: "owner" as const,
		Grants: [] as readonly Grant[],
		Identity: "did:key:me",
		OpenVote: false,
	};

	const Result = CrossTheSeam({
		Act: "publish",
		Context: Work,
		Standing: OwnerOfRoom,
		Record: { Id: "1", Author: "did:key:me", Version: 1 },
	});

	assert.deepEqual(Result, { Crossed: false, Reason: "not-granted" });
});

test("a stale canvas copy is refused, naming the version it saw", () => {
	const Member_ = StandingOf(Select(Session, Work));

	const Result = CrossTheSeam({
		Act: "publish",
		Context: Work,
		Standing: Member_,
		Record: { Id: "1", Author: "did:key:me", Version: 2 },
		Published: { Value: "1", Version: 5 },
	});

	assert.deepEqual(Result, { Crossed: false, Reason: "stale-write" });
});

test("withdraw narrows the audience and deletes nothing", () => {
	const Owner = StandingOf(Session);

	const Result = CrossTheSeam({
		Act: "withdraw",
		Context: OwnContext,
		Standing: Owner,
		Record: { Id: "1", Author: "did:key:me", Version: 3 },
	});

	assert.equal(Result.Crossed, true);
	assert.equal(Result.Crossed && Result.Audience, "internal");
	assert.equal(Result.Crossed && Result.Visibility, "hidden");
	assert.equal(Result.Crossed && Result.Record, "1");
});

test("no session crosses the seam, and says so", () => {
	const Empty = StandingOf(Anonymous([OwnContext], AsOf));

	const Result = CrossTheSeam({
		Act: "publish",
		Context: OwnContext,
		Standing: Empty,
		Record: { Id: "1", Author: "did:key:me", Version: 1 },
	});

	assert.deepEqual(Result, { Crossed: false, Reason: "no-session" });
});

test("every named local act has one home, and none of them crosses", () => {
	const Homes = Object.fromEntries(
		DrawerActs.map((Act) => {
			const Local = ActWithoutCrossingTheSeam(Act);

			assert.equal(Local.Crosses, false);
			assert.equal(Local.Act, Act);

			return [Act, Local.Home];
		}),
	);

	assert.deepEqual(Homes, {
		read: "drawer",
		observe: "drawer",
		vote: "room",
		curate: "room",
		select: "room",
		comment: "room",
		nominate: "room",
		propagate: "room",
		arrange: "viewer",
	});

	// The crossing verbs are not in the set a caller may perform locally.
	for (const Act of ["publish", "withdraw"]) {
		assert.equal((DrawerActs as readonly string[]).includes(Act), false);
	}
});

test("a field has one owner, and a projection never writes back", () => {
	assert.equal(OwnerOf("visibility"), "shadow");
	assert.equal(OwnerOf("selection"), "room");
	assert.equal(OwnerOf("arrangement"), "viewer");

	// The drawer's field, written by the canvas: refused by name.
	const Wrong = Settle(
		"visibility",
		"room",
		{ Value: "hidden", Version: 9 },
		{ Value: "public", Version: 1 },
	);

	assert.deepEqual(Wrong, { Kind: "refused", Reason: "not-owner", Current: -1 });

	// Two votes are two rows, and both are correct.
	const Votes = Settle(
		"vote",
		"room",
		{ Value: "vote-b", Version: 1 },
		{ Value: "vote-a", Version: 1 },
	);

	assert.deepEqual(Votes, { Kind: "appended", Value: ["vote-a", "vote-b"] });

	// The viewer's own arrangement is the whole truth for that viewer.
	const Layout = Settle(
		"arrangement",
		"viewer",
		{ Value: "mine", Version: 1 },
		{ Value: "theirs", Version: 8 },
	);

	assert.deepEqual(Layout, { Kind: "merged", Value: "mine" });

	// A single-holder field whose copy is behind is refused, not overwritten.
	const Stale = Settle(
		"selection",
		"room",
		{ Value: "mine", Version: 2 },
		{ Value: "theirs", Version: 7 },
	);

	assert.deepEqual(Stale, { Kind: "refused", Reason: "stale-write", Current: 7 });

	const Fresh = Settle(
		"selection",
		"room",
		{ Value: "mine", Version: 7 },
		{ Value: "theirs", Version: 7 },
	);

	assert.deepEqual(Fresh, { Kind: "kept", Value: "mine", Owner: "room" });

	const Projected = Project("shadow", Drawer);

	assert.equal(Projected.Writable, false);
	assert.equal(Projected.Source, "shadow");
	assert.equal(Projected.Value, Drawer);
});

test("an absent session keeps the build's view and logs one warning", async () => {
	const Empty = Anonymous([OwnContext], AsOf);
	const Warnings = Capture(() => Resolve(Empty));

	const Resolved = await Warnings.Result;

	assert.equal(Warnings.Seen.length, 1);
	assert.match(Warnings.Seen[0] ?? "", /no local transport seam/);
	assert.equal(Resolved, Empty);
	assert.equal(Resolved.State, "static");
});

test("a refused session keeps the build's view and logs one warning", async () => {
	const Empty = Anonymous([OwnContext], AsOf);
	const Warnings = Capture(() =>
		Resolve(Empty, () => Promise.reject(new Error("socket closed"))),
	);

	const Resolved = await Warnings.Result;

	assert.equal(Warnings.Seen.length, 1);
	assert.match(Warnings.Seen[0] ?? "", /refused the session read/);
	assert.equal(Resolved, Empty);
});

test("a payload this client cannot use keeps the build's view", async () => {
	const Empty = Anonymous([OwnContext], AsOf);
	const Warnings = Capture(() => Resolve(Empty, () => Promise.resolve({ Identity: "nope" })));

	const Resolved = await Warnings.Result;

	assert.equal(Warnings.Seen.length, 1);
	assert.match(Warnings.Seen[0] ?? "", /does not recognise/);
	assert.equal(Resolved, Empty);
});

test("a session that resolves is a snapshot, and adds its rooms as contexts", async () => {
	const Empty = Anonymous([OwnContext], AsOf);
	const Warnings = Capture(() =>
		Resolve(Empty, () =>
			Promise.resolve({
				Identity: { Id: "did:key:me", Name: "Me", PublicKey: "z6Mk-me" },
				Memberships: [Member],
			}),
		),
	);

	const Resolved = await Warnings.Result;

	assert.deepEqual(Warnings.Seen, []);
	assert.equal(Resolved.State, "snapshot");
	assert.equal(Resolved.Identity?.Id, "did:key:me");
	assert.deepEqual(
		Resolved.Contexts.map((Entry) => Entry.Label),
		["My Files", "Work"],
	);
	assert.equal(Resolved.Context, OwnContext);

	// The selected context survives a read that does not name it, and a room
	// selection survives a read that does.
	const Selected = Select(Resolved, Work as Context);
	const Again = await Resolve(Selected, () =>
		Promise.resolve({
			Identity: { Id: "did:key:me", Name: "Me", PublicKey: "z6Mk-me" },
			Memberships: [Member],
		}),
	);

	assert.equal(Again.Context, Work);
});

/** Run a promise-returning call and collect the warnings it logs. */
function Capture(Run: () => Promise<unknown>): { Result: Promise<Slot>; Seen: string[] } {
	const Seen: string[] = [];
	const Original = console.warn;

	console.warn = (...Argument: unknown[]) => {
		Seen.push(Argument.map((Entry) => String(Entry)).join(" "));
	};

	const Result = Run().then(
		(Value) => Value as Slot,
		(Error: unknown) => {
			throw Error;
		},
	);

	return {
		Result: Result.finally(() => {
			console.warn = Original;
		}),
		Seen,
	};
}
