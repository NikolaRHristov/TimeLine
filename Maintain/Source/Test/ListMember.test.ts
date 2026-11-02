import assert from "node:assert/strict";
import { test } from "node:test";

import type { ListSurface } from "../Browser/Session/ListMember.ts";
import { execute } from "../Browser/Session/ListMember.ts";
import { isFailure } from "../Cli/Parser/Output/Failure.ts";
import { parse } from "../Cli/Parser/Parser.ts";
import { schema } from "../Cli/Schema/Schema.ts";
import { Definition as MemberAdd } from "../Command/Page/List/Member/Add.ts";
import type { ListRow, ListSurfaceState } from "../Model/List/Member.ts";
import { handle, rateLimit } from "../Model/List/Member.ts";

/**
 * The dialog as a scripted surface.
 *
 * `calls` is the point of the whole file: "nothing changed" is a claim about
 * which of these four methods ran, and a fake is the only place that claim can
 * be checked without writing to an account.
 */
function dialog(
	rows: ListRow[],
	options: { alerts?: string[]; saveAlerts?: string[]; saveRows?: ListRow[] } = {},
): { surface: ListSurface; calls: string[] } {
	const calls: string[] = [];
	const surface: ListSurface = {
		async open(): Promise<ListSurfaceState> {
			calls.push("open");
			return { rows, save: false, alerts: [] };
		},
		async pick(name: string): Promise<ListSurfaceState> {
			calls.push(`pick:${name}`);
			return {
				rows: rows.map((row) => (row.name === name ? { name: row.name, checked: true } : row)),
				save: true,
				alerts: options.alerts ?? [],
			};
		},
		async save(): Promise<ListSurfaceState> {
			calls.push("save");
			return { rows: options.saveRows ?? [], save: false, alerts: options.saveAlerts ?? [] };
		},
		async close(): Promise<void> {
			calls.push("close");
		},
	};
	return { surface, calls };
}

const rows = (...entries: [string, boolean][]): ListRow[] =>
	entries.map(([name, checked]) => ({ name, checked }));

const codeOf = async (run: () => Promise<unknown>): Promise<string> => {
	try {
		await run();
	} catch (error) {
		if (isFailure(error)) return error.code;
		throw error;
	}
	return "none";
};

test("a handle is letters, digits and underscore, with or without @", () => {
	assert.equal(handle("NikolaRHristov"), "NikolaRHristov");
	assert.equal(handle("@NikolaRHristov"), "NikolaRHristov");
	assert.equal(handle("  @some_one  "), "some_one");
	assert.equal(handle("a".repeat(15)), "a".repeat(15));
	// A handle goes into a URL path, so anything that could steer the path is
	// refused rather than escaped.
	assert.equal(handle("a".repeat(16)), null);
	assert.equal(handle("../etc/passwd"), null);
	assert.equal(handle("some one"), null);
	assert.equal(handle("some/one"), null);
	assert.equal(handle("@"), null);
	assert.equal(handle(""), null);
});

test("only the page's own limit wording reads as a limit", () => {
	assert.equal(rateLimit(["You are over the daily limit for adding people to Lists."]), "You are over the daily limit for adding people to Lists.");
	assert.equal(rateLimit(["Too many requests"]), "Too many requests");
	assert.equal(rateLimit(["Try again later."]), "Try again later.");
	assert.equal(rateLimit(["Saved"]), null);
	assert.equal(rateLimit(["Something went wrong"]), null);
	assert.equal(rateLimit([]), null);
});

test("without --apply nothing is staged: no row is clicked and Save is never pressed", async () => {
	const { surface, calls } = dialog(rows(["AI", false], ["UI", false]));
	const report = await execute(surface, { handle: "someone", name: "UI", apply: false });

	assert.deepEqual(report, {
		dryRun: true,
		action: "page list member add",
		handle: "someone",
		list: "UI",
		member: false,
		wouldAdd: true,
	});
	assert.deepEqual(calls, ["open"]);
});

test("with --apply exactly one row is picked and Save is pressed once", async () => {
	const { surface, calls } = dialog(rows(["AI", false], ["UI", false]));
	const report = await execute(surface, { handle: "someone", name: "UI", apply: true });

	assert.deepEqual(report, {
		dryRun: false,
		added: true,
		handle: "someone",
		list: "UI",
		was: false,
	});
	assert.deepEqual(calls, ["open", "pick:UI", "save"]);
});

test("a handle already on the list is a no-op in both modes", async () => {
	const dry = dialog(rows(["UI", true]));
	assert.deepEqual(await execute(dry.surface, { handle: "someone", name: "UI", apply: false }), {
		dryRun: true,
		action: "page list member add",
		handle: "someone",
		list: "UI",
		member: true,
		wouldAdd: false,
	});
	assert.deepEqual(dry.calls, ["open"]);

	const applied = dialog(rows(["UI", true]));
	assert.deepEqual(await execute(applied.surface, { handle: "someone", name: "UI", apply: true }), {
		dryRun: false,
		added: false,
		alreadyMember: true,
		handle: "someone",
		list: "UI",
		was: true,
	});
	assert.deepEqual(applied.calls, ["open"]);
});

test("a rate-limited Save is reported as `rate-limited`, not as a write", async () => {
	const { surface } = dialog(rows(["UI", false]), {
		saveAlerts: ["You are over the daily limit for adding people to Lists. Please try again later."],
	});
	const code = await codeOf(() => execute(surface, { handle: "someone", name: "UI", apply: true }));
	assert.equal(code, "rate-limited");
});

test("a limit raised while staging stops before Save is pressed", async () => {
	const { surface, calls } = dialog(rows(["UI", false]), { alerts: ["Too many requests"] });
	const code = await codeOf(() => execute(surface, { handle: "someone", name: "UI", apply: true }));
	assert.equal(code, "rate-limited");
	assert.deepEqual(calls, ["open", "pick:UI"]);
});

test("a list the dialog does not offer is `unknown-list`, never a guess", async () => {
	const { surface, calls } = dialog(rows(["AI", false], ["CODE", false]));
	const code = await codeOf(() => execute(surface, { handle: "someone", name: "UI", apply: true }));
	assert.equal(code, "unknown-list");
	assert.deepEqual(calls, ["open"]);
});

test("two lists with the same name are refused rather than picked arbitrarily", async () => {
	const { surface } = dialog(rows(["UI", false], ["UI", true]));
	const code = await codeOf(() => execute(surface, { handle: "someone", name: "UI", apply: true }));
	assert.equal(code, "unknown-list");
});

test("a dialog that renders no rows is `no-list-surface`", async () => {
	const { surface } = dialog([]);
	const code = await codeOf(() => execute(surface, { handle: "someone", name: "UI", apply: false }));
	assert.equal(code, "no-list-surface");
});

test("a row that does not flip to checked is a cdp-error, not a silent success", async () => {
	const surface: ListSurface = {
		async open() {
			return { rows: rows(["UI", false]), save: false, alerts: [] };
		},
		async pick() {
			return { rows: rows(["UI", false]), save: false, alerts: [] };
		},
		async save() {
			return { rows: [], save: false, alerts: [] };
		},
		async close() {
			/* nothing to clean up */
		},
	};
	const code = await codeOf(() => execute(surface, { handle: "someone", name: "UI", apply: true }));
	assert.equal(code, "cdp-error");
});

test("the command documents --apply as a flag and --name/--handle as required", () => {
	const document = schema(MemberAdd) as Record<string, unknown>;
	const properties = document["properties"] as Record<string, unknown>;
	for (const name of ["--name", "--handle", "--apply", "--dry-run"]) {
		assert.ok(name in properties, `missing ${name}`);
	}
	assert.equal((properties["--apply"] as Record<string, unknown>)["type"], "boolean");
	assert.equal((properties["--dry-run"] as Record<string, unknown>)["type"], "boolean");
	// A slug is configuration, not code: the schema cannot enumerate the set.
	assert.equal((properties["--name"] as Record<string, unknown>)["type"], "string");
	assert.deepEqual(document["required"], ["--name", "--handle"]);
});

test("argv without a flag leaves the write unarmed", () => {
	const quiet = parse(["page", "list", "member", "add", "--name", "UI", "--handle", "someone"], [MemberAdd]);
	assert.equal(quiet.values["apply"], undefined);
	assert.equal(quiet.values["dry-run"], undefined);

	const armed = parse(["page", "list", "member", "add", "--name", "UI", "--handle", "someone", "--apply"], [MemberAdd]);
	assert.equal(armed.values["apply"], true);
});
