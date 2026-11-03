/**
 * `event append`, through its command module, into a temporary content root.
 *
 * `Append` is a command module, so importing it evaluates `Content/Text.ts` -
 * the content index, which refuses by name until the defines the build bakes
 * are present. `Script/Test.ts` supplies them from `Content/**`, which is why
 * the suite runs through that runner and not `node --test Source/Test/*.test.ts`.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { Definition as Append } from "../Command/Event/Append/Append.ts";
import { fileName } from "../Model/Event/Event.ts";
import { open as openShadow } from "../Store/Shadow/Shadow.ts";
import { context } from "./Context.ts";

const roots: string[] = [];
let content = "";

function temporary(): string {
	const path = mkdtempSync(join(tmpdir(), "maintain-append-"));
	roots.push(path);
	return path;
}

/**
 * A content root per test, pointed at with `MAINTAIN_CONTENT` the way every
 * other content-writing command is tested: `event append` writes into the
 * collection the site builds from, so a test that used the real one would be
 * publishing fixtures.
 */
beforeEach(() => {
	content = join(temporary(), "Content");
	process.env["MAINTAIN_CONTENT"] = content;
});

after(() => {
	for (const path of roots) rmSync(path, { recursive: true, force: true });
	delete process.env["MAINTAIN_CONTENT"];
});

/** Append one event through the command and return the repository-relative path it reports. */
async function append(subject: string, payload: Record<string, unknown> = {}): Promise<string> {
	const written = (await Append.run(context({ kind: "bookmark.added", subject, payload }))) as {
		written: boolean;
		path: string;
	};

	assert.equal(written.written, true);
	return written.path;
}

test("two subjects that flatten to one slug are two files, not one", async () => {
	// The collision the digest exists to defeat: `a/b` and `a?b` share the slug
	// `a-b`, so a name built from the subject alone gives them one file and the
	// second append overwrites the first.
	const written = new Map<string, string>();
	for (const subject of ["a/b", "a?b"]) {
		written.set(subject, await append(subject, { which: subject }));
	}

	assert.equal(readdirSync(join(content, "Event")).length, 2);

	for (const [subject, path] of written) {
		const name = basename(path);
		const record = JSON.parse(readFileSync(join(content, "Event", name), "utf8")) as {
			at: string;
			kind: string;
			subject: string;
			payload: Record<string, unknown>;
		};

		// Each file holds its own subject, and its name is exactly what the one
		// naming function produces for that record.
		assert.equal(record.subject, subject);
		assert.equal(record.payload["which"], subject);
		assert.equal(name, fileName(record.at, record.kind, record.subject));
		// The readable half survives; the digest is the only part that differs.
		assert.match(name, /-a-b-[0-9a-f]{8}\.json$/);
	}

	assert.notEqual(basename(written.get("a/b")!), basename(written.get("a?b")!));
});

test("the event lands in the configured content root, not the tracked collection", async () => {
	const path = await append("a/b");

	// The command reports a repository-relative path, so a file written into
	// `Source/Content/Event` would say so.
	assert.ok(
		!path.startsWith(join("Source", "Content")),
		`wrote into the tracked collection: ${path}`,
	);
	assert.equal(existsSync(join(content, "Event", basename(path))), true);
});

test("the file the command writes is the file the trail query finds", async () => {
	await append("a/b", { which: "slash" });
	await append("a?b", { which: "query" });

	// `event tail` reads this same layout through `Shadow.events()`, so the name
	// the writer produces has to be one the reader looks for - and the record,
	// not the name, decides which subject a file belongs to.
	const slash = openShadow(content).events("a/b");
	assert.equal(slash.length, 1);
	assert.equal(slash[0]!.record.payload["which"], "slash");
	assert.equal(openShadow(content).events("a?b").length, 1);
});
