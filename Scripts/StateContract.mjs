#!/usr/bin/env node
/**
 * The state contract.
 *
 *   node Scripts/StateContract.mjs
 *
 * The two closed sets - a control's seven states (RFC-0049) and a read's six
 * (RFC-0050) - are declared in `Source/Library/` and enforced in three places.
 * `Documentation/Skill/Tool-Archive/Reference/TokenContract.mjs` enforces the
 * vocabulary statically: a sheet, a stylesheet or a component that names a
 * state outside the modules fails the build. This file enforces the behaviour:
 * the modules are imported and asked, so a rule that is only true in a comment
 * fails here.
 *
 * What it holds:
 *
 * - The set is the seven, in order, and each state names one channel. `rest`
 *   names none, because it is the baseline rather than a change.
 * - `active` and `selected` are on different channels, which is what makes a
 *   pressed row and a chosen row read differently without a second rule.
 * - No state is reachable by hover alone.
 * - A control is at rest until a fact says otherwise, and the facts are read in
 *   the documented order of precedence.
 * - `locked` carries its reason and refuses to exist without one. This is the
 *   prop contract: there is no other way to reach the state, so a component
 *   cannot render a forbidden control as a dead end.
 * - A read derives its state from what it read, `empty` names the command that
 *   fills it, `partial` states `N of M`, `stale` carries an absolute ISO time
 *   and `failed` carries the tool layer's own code plus a remedy.
 * - Every read has the one shape, with all six keys present.
 * - The site's failure codes are the CLI's codes, read from the CLI's own
 *   declaration rather than restated.
 *
 * Node imports the `.ts` modules directly (type stripping), so the test needs no
 * build step and no dependency. Exit 0 means the contract holds; a failed test
 * exits 1 with the assertion that failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	ComponentState,
	IsComponentState,
	StateChannel,
	StateContractError,
	StateGlyph,
	StateOf,
	StatePrecedence,
	StateReach,
} from "../Source/Library/ComponentState.ts";
import {
	DataContractError,
	DataState,
	FailureCode,
	Freshness,
	IsAbsolute,
	Iso,
	Pending,
	Ratio,
	Read,
} from "../Source/Library/DataState.ts";

const Root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The one shape every read has. A key added or dropped is a second model. */
const Shape = ["At", "Code", "Count", "Remedy", "State", "Total"];

/* ------------------------------------------------------- the component set */

test("the component set is the seven RFC-0049 names, in order", () => {
	assert.deepEqual(
		[...ComponentState],
		["rest", "hover", "focus", "active", "selected", "locked", "busy"],
	);
});

test("every state names one channel, and rest names none", () => {
	assert.deepEqual(Object.keys(StateChannel).sort(), [...ComponentState].sort());

	for (const Name of ComponentState) {
		assert.ok(
			["none", "face", "line", "ink"].includes(StateChannel[Name]),
			`${Name} names the channel "${StateChannel[Name]}"`,
		);
	}

	assert.equal(StateChannel.rest, "none");

	for (const Name of ComponentState.filter((Entry) => Entry !== "rest")) {
		assert.notEqual(StateChannel[Name], "none", `${Name} changes no channel`);
	}
});

test("active and selected move different channels", () => {
	assert.notEqual(StateChannel.active, StateChannel.selected);
	assert.equal(StateChannel.active, "face");
	assert.equal(StateChannel.selected, "line");
});

test("no state is reachable by hover alone", () => {
	assert.deepEqual(Object.keys(StateReach).sort(), [...ComponentState].sort());
	assert.equal(StateReach.hover, "focus");

	for (const Name of ComponentState.filter((Entry) => Entry !== "rest")) {
		assert.notEqual(StateReach[Name], "none", `${Name} is reachable by nothing`);
	}
});

test("only locked draws a glyph", () => {
	assert.equal(StateGlyph.locked, "lock");

	for (const Name of ComponentState.filter((Entry) => Entry !== "locked")) {
		assert.equal(StateGlyph[Name], null, `${Name} draws ${StateGlyph[Name]}`);
	}
});

test("the order of precedence names every state but rest, once", () => {
	assert.deepEqual(
		[...StatePrecedence].sort(),
		[...ComponentState].filter((Entry) => Entry !== "rest").sort(),
	);
});

test("a control with no facts is at rest", () => {
	assert.deepEqual(StateOf({}), { State: "rest", Reason: null, Glyph: null });
});

test("each fact derives its own state", () => {
	assert.equal(StateOf({ Hover: true }).State, "hover");
	assert.equal(StateOf({ Focus: true }).State, "focus");
	assert.equal(StateOf({ Active: true }).State, "active");
	assert.equal(StateOf({ Selected: true }).State, "selected");
	assert.equal(StateOf({ Busy: true }).State, "busy");
});

test("a pressed row outranks a chosen one", () => {
	assert.equal(StateOf({ Selected: true, Active: true }).State, "active");
	assert.equal(StateOf({ Selected: true, Hover: true }).State, "selected");
	assert.equal(StateOf({ Focus: true, Hover: true }).State, "focus");
	assert.equal(StateOf({ Busy: true, Selected: true }).State, "busy");
});

test("locked carries the reason it is locked", () => {
	const Locked = StateOf({ Locked: "  publishing needs an identity  " });

	assert.equal(Locked.State, "locked");
	assert.equal(Locked.Reason, "publishing needs an identity");
	assert.equal(Locked.Glyph, "lock");
});

test("locked outranks every other fact", () => {
	assert.equal(StateOf({ Locked: "no session", Busy: true, Selected: true }).State, "locked");
});

test("a locked control without a reason fails the contract", () => {
	assert.throws(() => StateOf({ Locked: "" }), StateContractError);
	assert.throws(() => StateOf({ Locked: "   " }), StateContractError);
});

test("locked takes a reason, not a flag", () => {
	assert.throws(() => StateOf({ Locked: true }), StateContractError);
	assert.throws(() => StateOf({ Locked: false }), StateContractError);
});

test("a fact that is not a boolean is refused", () => {
	assert.throws(() => StateOf({ Hover: "yes" }), StateContractError);
});

test("a state name outside the set is not a state", () => {
	assert.equal(IsComponentState("selected"), true);
	assert.equal(IsComponentState("pressed"), false);
	assert.equal(IsComponentState("disabled"), false);
	assert.equal(IsComponentState("dragging"), false);
	assert.equal(IsComponentState("loading"), false);
});

/* ------------------------------------------------------------ the data set */

test("the data set is the six RFC-0050 names, in order", () => {
	assert.deepEqual([...DataState], ["pending", "ready", "empty", "partial", "stale", "failed"]);
});

test("every read has the one shape, with all six keys", () => {
	for (const Data of [
		Pending(),
		Read({ Count: 3 }),
		Read({ Count: 0, Remedy: "pnpm run tool scrape" }),
		Read({ Count: 18, Total: 20 }),
		Read({ Count: 3, At: "2026-10-01T09:00:00Z", Now: "2026-11-02T09:00:00Z" }),
		Read({ Count: 0, Code: "no-config", Remedy: "pnpm run tool configure" }),
	]) {
		assert.deepEqual(Object.keys(Data).sort(), Shape);
	}
});

test("a read with records and no code is ready", () => {
	const Ready = Read({ Count: 4, At: "2026-11-02T08:00:00Z", Now: "2026-11-02T09:00:00Z" });

	assert.equal(Ready.State, "ready");
	assert.equal(Ready.Count, 4);
	assert.equal(Ready.Total, 4);
	assert.equal(Ready.Code, null);
	assert.equal(Ready.Remedy, null);
});

test("an empty read states the command that fills it", () => {
	const Empty = Read({ Count: 0, Remedy: "pnpm run tool scrape" });

	assert.equal(Empty.State, "empty");
	assert.equal(Empty.Remedy, "pnpm run tool scrape");
	assert.equal(Empty.At, null);
});

test("an empty read without a command fails the contract", () => {
	assert.throws(() => Read({ Count: 0 }), DataContractError);
	assert.throws(() => Read({ Count: 0, Remedy: "   " }), DataContractError);
});

test("a partial read states N of M and keeps what arrived", () => {
	const Partial = Read({ Count: 18, Total: 20 });

	assert.equal(Partial.State, "partial");
	assert.equal(Partial.Count, 18);
	assert.equal(Partial.Total, 20);
	assert.equal(Ratio(Partial), "18 of 20");
	assert.equal(Ratio(Read({ Count: 3 })), null);
});

test("a read cannot return more records than its set", () => {
	assert.throws(() => Read({ Count: 20, Total: 18 }), DataContractError);
	assert.throws(() => Read({ Count: -1 }), DataContractError);
	assert.throws(() => Read({ Count: 1.5 }), DataContractError);
});

test("a stale read carries an absolute ISO time", () => {
	const Stale = Read({
		Count: 3,
		At: "2026-10-01T09:00:00Z",
		Now: "2026-11-02T09:00:00Z",
	});

	assert.equal(Stale.State, "stale");
	assert.equal(Iso(Stale.At), "2026-10-01T09:00:00Z");
	assert.equal(Freshness, 24 * 60 * 60 * 1000);
});

test("data inside the freshness window is not stale", () => {
	assert.equal(
		Read({ Count: 3, At: "2026-11-02T08:00:00Z", Now: "2026-11-02T09:00:00Z" }).State,
		"ready",
	);
});

test("a relative timestamp is refused", () => {
	assert.equal(IsAbsolute("2 hours ago"), false);
	assert.equal(IsAbsolute("2026-11-02"), false);
	assert.throws(() => Read({ Count: 3, At: "2 hours ago" }), DataContractError);
	assert.throws(() => Iso(null), DataContractError);
});

test("a failed read carries the CLI's code and the remedy", () => {
	const Failed = Read({ Count: 0, Code: "no-post", Remedy: "pnpm run tool scrape --post 3" });

	assert.equal(Failed.State, "failed");
	assert.equal(Failed.Code, "no-post");
	assert.equal(Failed.Remedy, "pnpm run tool scrape --post 3");
});

test("a failed read without a remedy fails the contract", () => {
	assert.throws(() => Read({ Count: 0, Code: "no-config" }), DataContractError);
});

test("a code outside the tool layer's vocabulary is refused", () => {
	assert.throws(
		() => Read({ Count: 0, Code: "something-went-wrong", Remedy: "retry" }),
		DataContractError,
	);
});

test("a failure outranks the records that did arrive", () => {
	assert.equal(
		Read({ Count: 0, Code: "unknown-list", Remedy: "pnpm run tool configure" }).State,
		"failed",
	);
});

test("a pending read states nothing but the frame", () => {
	assert.deepEqual(Pending(), {
		State: "pending",
		Count: 0,
		Total: 0,
		At: null,
		Code: null,
		Remedy: null,
	});
});

/* -------------------------------------------------- the shared vocabulary */

test("the site's failure codes are the CLI's codes", () => {
	const Declaration = readFileSync(
		join(Root, "Maintain", "Source", "CLI", "Parser", "Output", "Failure.ts"),
		"utf8",
	);

	for (const Code of FailureCode) {
		assert.ok(
			Declaration.includes(`"${Code}"`),
			`${Code} is not declared in Maintain/Source/CLI/Parser/Output/Failure.ts`,
		);
	}
});
