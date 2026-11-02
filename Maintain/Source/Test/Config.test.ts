import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { isFailure } from "../CLI/Parser/Output/Failure.ts";
import { Definition as Init } from "../Command/Config/Init/Init.ts";
import { Definition as Show } from "../Command/Config/Show/Show.ts";
import { EXAMPLE_CONFIGURATION, load, root } from "../Configuration/Load/Load.ts";
import { context } from "./Context.ts";

/** One scratch root per process; every case gets its own map below it. */
const scratch = mkdtempSync(join(tmpdir(), "maintain-config-"));
const previous = process.env["MAINTAIN_CONFIG"];

after(() => {
	if (previous === undefined) delete process.env["MAINTAIN_CONFIG"];
	else process.env["MAINTAIN_CONFIG"] = previous;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Point the command at `<name>/Configuration.local.json` and return that path.
 *
 * The directory deliberately does not exist: creating the parent is part of
 * what `config init` promises.
 */
function at(name: string): string {
	const path = join(scratch, name, "nested", "Configuration.local.json");
	process.env["MAINTAIN_CONFIG"] = path;
	return path;
}

type Result = Record<string, unknown>;

async function run(definition: typeof Init, values: Record<string, unknown>): Promise<Result> {
	return (await definition.run(context(values as never))) as Result;
}

function caught(work: () => unknown): unknown {
	try {
		work();
	} catch (error) {
		return error;
	}
	return null;
}

/** A command's `run` is async, so a refusal arrives as a rejected promise. */
async function rejected(work: () => Promise<unknown>): Promise<unknown> {
	try {
		await work();
	} catch (error) {
		return error;
	}
	return null;
}

test("config init writes the tracked example, creating the parent directory", async () => {
	const path = at("fresh");

	const result = await run(Init, {});

	assert.equal(result["written"], path);
	assert.equal(result["overwritten"], false);
	assert.equal(result["profile"], "");
	assert.deepEqual(result["lists"], []);
	assert.equal(existsSync(path), true);
	assert.equal((result["next"] as string[]).length, 3);

	const written = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
	assert.equal(written["profile"], "");
	assert.deepEqual(written["lists"], []);
	// The map is the person's own: it is not world-readable.
	assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("config init refuses to replace an existing map without --force", async () => {
	const path = at("twice");
	await run(Init, { profile: "someone" });
	const before = readFileSync(path, "utf8");

	const failure = await rejected(() => Init.run(context({} as never)));

	assert.equal(isFailure(failure), true);
	if (!isFailure(failure)) return;
	assert.equal(failure.code, "config-exists");
	assert.equal(failure.toObject()["path"], path);
	assert.match(String(failure.toObject()["next"]), /--force/);
	assert.equal(readFileSync(path, "utf8"), before);
});

test("config init --force composes: a later step does not undo an earlier one", async () => {
	at("compose");
	await run(Init, {});
	await run(Init, { force: true, profile: "someone" });
	await run(Init, { force: true, list: ["reading=111"] });
	const result = await run(Init, {
		force: true,
		list: ["recipes=222"],
		"cdp-port": 9333,
	});

	// The onboarding sequence the command prints runs `init --force` once per
	// fact. Each run must build on the last, or the sequence is a trap.
	assert.equal(result["overwritten"], true);
	const written = load();
	assert.equal(written.profile, "someone");
	assert.deepEqual(
		written.lists.map((list) => list.slug),
		["reading", "recipes"],
	);
	assert.equal(written.cdp.port, 9333);
	assert.equal(written.routes.likes, "https://x.com/someone/likes");
});

test("config init --force re-points one slug without duplicating it", async () => {
	at("repoint");
	await run(Init, { list: ["reading=111", "recipes=222"] });
	await run(Init, { force: true, list: ["reading=999"] });

	const written = load();
	assert.deepEqual(
		written.lists.map((list) => `${list.slug}=${list.id}`),
		["reading=999", "recipes=222"],
	);
});

test("config show masks list ids, and --reveal prints them", async () => {
	at("show");
	await run(Init, { list: ["reading=111", "recipes=222"] });

	const masked = await run(Show, {});
	const maskedLists = masked["lists"] as { slug: string; id: string }[];
	assert.deepEqual(
		maskedLists.map((list) => list.slug),
		["reading", "recipes"],
	);
	assert.equal(maskedLists[0]?.id, "*11");
	assert.equal(masked["masked"], true);

	const revealed = await run(Show, { reveal: true });
	assert.equal((revealed["lists"] as { id: string }[])[0]?.id, "111");
	assert.equal(revealed["masked"], false);
});

test("a missing map names the absolute path and a copy command that runs", () => {
	const path = at("missing");
	const failure = caught(() => load());

	assert.equal(isFailure(failure), true);
	if (!isFailure(failure)) return;
	assert.equal(failure.code, "no-config");

	const extra = failure.toObject();
	assert.equal(extra["expected"], path);
	const copy = String(extra["copy"]);
	// Both paths are absolute, so the command works from anywhere - and it is
	// executed here, because a copy command that only looks right is useless.
	assert.match(copy, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.match(
		copy,
		new RegExp(join(root(), EXAMPLE_CONFIGURATION).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
	);

	execFileSync("sh", ["-c", copy], { stdio: "ignore" });
	assert.deepEqual(load().lists, []);
});
