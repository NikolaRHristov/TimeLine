#!/usr/bin/env node
/**
 * The skill contract: one directory per skill, one body, one index, one citation.
 *
 *   node Documentation/Skill/Skill-Authoring/Reference/SkillContract.mjs
 *
 * A skill is a directory under `Documentation/Skill/`, and six facts about it are
 * mechanical enough to check, so none of them is left to review:
 *
 *   - it carries a `SKILL.md` and a `Reference/Index.md`, because a directory with
 *     only prose has nowhere for the worked instance and a directory with only an
 *     index has no rules;
 *   - the frontmatter parses, and it states a `name` and a `description`, because
 *     those are the two fields a loader reads;
 *   - `name` is the directory lowercased, because a rename that misses one of the
 *     two leaves a skill nothing can address;
 *   - the root `AGENTS.md` cites `Documentation/Skill/<Name>/SKILL.md`, because a
 *     skill nobody is pointed at is not loaded;
 *   - every file in `Reference/` is named in that directory's `Index.md`, because
 *     an index that omits a file is a reader's dead end;
 *   - the body carries a claim → test table (`## Claim → test`, or `## Verification`
 *     under the same rule), because a rule whose test is unstated is intent wearing
 *     the shape of a settled fact.
 *
 * What it does NOT check is what only a person can: whether the claims are true,
 * whether the skill belongs in this repository rather than in an agent profile, and
 * whether the prose names a machine. The last one has a gate of its own -
 * `archive_tool.py --audit` for the skill tree and `Scripts/AuditLeaks.sh` for the
 * whole tracked tree - and this tool points at them rather than duplicating them.
 *
 * Exit 0 every skill agrees, 1 at least one disagrees, 2 the inputs are wrong (no
 * `Documentation/Skill/`, no `AGENTS.md`, a block that will not parse).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The one dependency beyond the standard library, and the one failure worth a
// sentence rather than a stack trace: a clone that has not run `pnpm install`
// should be told what to run.
let ParseYaml;
try {
	({ parse: ParseYaml } = await import("yaml"));
} catch {
	console.error("skill-contract: the `yaml` package is not installed; run `pnpm install` first");
	process.exit(2);
}

const Here = dirname(fileURLToPath(import.meta.url));
const Root = resolve(Here, "../../../..");

const Corpus = "Documentation/Skill";
const Index = "AGENTS.md";

const Fail = (message) => {
	console.error(`skill-contract: ${message}`);
	process.exit(2);
};

/** The skill directories, in the order a reader meets them. */
function Skills() {
	let entries;
	try {
		entries = readdirSync(resolve(Root, Corpus), { withFileTypes: true });
	} catch {
		Fail(`cannot read ${Corpus}; run this from inside the repository`);
	}
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

function Read(relative) {
	try {
		return readFileSync(resolve(Root, relative), "utf8");
	} catch {
		return null;
	}
}

/** The YAML block at the top of a file, and the body after it. */
function SplitFrontmatter(text) {
	if (!text.startsWith("---\n")) return { data: null, body: text, error: "no frontmatter block" };
	const end = text.indexOf("\n---\n", 3);
	if (end === -1) return { data: null, body: text, error: "the block is never closed" };
	let data;
	try {
		data = ParseYaml(text.slice(4, end + 1));
	} catch (error) {
		return { data: null, body: text, error: String(error.message ?? error) };
	}
	if (data === null || typeof data !== "object" || Array.isArray(data)) {
		return { data: null, body: text, error: "the block is not a mapping" };
	}
	return { data, body: text.slice(end + 5) };
}

/**
 * Whether the body states its claims as a table.
 *
 * Both headings are accepted because both are in the tree and both mean the same
 * thing: a rule paired with the command that settles it. The table itself must
 * follow - a heading with prose under it is the failure this check exists for.
 */
function Claims(body) {
	const marks = [...body.matchAll(/^## (Claim → test|Verification)$/gm)];
	for (const mark of marks) {
		const rest = body.slice(mark.index + mark[0].length);
		const next = rest.search(/^## /m);
		const section = next === -1 ? rest : rest.slice(0, next);
		if (/^\|.+\|\s*$/m.test(section)) return true;
	}
	return false;
}

/** Every file a `Reference/` holds, by name, excluding the index itself. */
function References(skill) {
	const directory = `${Corpus}/${skill}/Reference`;
	let entries;
	try {
		entries = readdirSync(resolve(Root, directory), { withFileTypes: true });
	} catch {
		return null;
	}
	return entries
		.filter((entry) => entry.isFile() || entry.isSymbolicLink())
		.map((entry) => entry.name)
		.filter((name) => name !== "Index.md")
		.sort();
}

const Pad = (text, width) => text.padEnd(width);

function main() {
	const index = Read(Index);
	if (index === null) Fail(`cannot read ${Index}; run this from inside the repository`);

	const skills = Skills();
	if (skills.length === 0) Fail(`${Corpus} holds no skill directory`);

	const problems = [];
	let cited = 0;
	let listed = 0;
	let claimed = 0;
	const rows = [];

	for (const skill of skills) {
		const relative = `${Corpus}/${skill}/SKILL.md`;
		const body = Read(relative);
		const notes = [];

		if (body === null) {
			problems.push(`${skill}: no SKILL.md`);
			rows.push(`${Pad(skill, 30)} no body`);
			continue;
		}

		const { data, body: prose, error } = SplitFrontmatter(body);
		if (error) problems.push(`${skill}: the frontmatter does not parse (${error})`);

		const name = data && typeof data.name === "string" ? data.name.trim() : null;
		if (!name) problems.push(`${skill}: the frontmatter has no name`);
		else if (name !== skill.toLowerCase()) {
			problems.push(
				`${skill}: name ${JSON.stringify(name)} is not ${JSON.stringify(skill.toLowerCase())}`,
			);
		} else {
			notes.push(`name=${name}`);
		}

		const description =
			data && typeof data.description === "string" ? data.description.trim() : "";
		if (!description) problems.push(`${skill}: the frontmatter has no description`);

		const references = References(skill);
		const referenceIndex = Read(`${Corpus}/${skill}/Reference/Index.md`);
		if (referenceIndex === null) {
			problems.push(`${skill}: no Reference/Index.md`);
		} else if (references === null) {
			problems.push(`${skill}: no Reference/ directory`);
		} else {
			const unlisted = references.filter((file) => !referenceIndex.includes(file));
			for (const file of unlisted) {
				problems.push(`${skill}: Reference/${file} is not listed in Reference/Index.md`);
			}
			if (unlisted.length === 0) listed += 1;
		}

		if (index.includes(relative)) cited += 1;
		else problems.push(`${skill}: ${Index} does not cite ${relative}`);

		if (Claims(prose)) claimed += 1;
		else problems.push(`${skill}: no ## Claim → test or ## Verification table`);

		rows.push(
			`${Pad(skill, 30)} ${Pad(name ?? "-", 30)} ${references?.length ?? 0} reference file(s)`,
		);
	}

	console.log(`skills: ${skills.length}`);
	for (const row of rows) console.log(`  ${row}`);
	console.log(
		`cited: ${cited}/${skills.length}   listed: ${listed}/${skills.length}   ` +
			`claims: ${claimed}/${skills.length}`,
	);
	console.log(
		`${problems.length ? "refused" : "ok"}: ${skills.length} skill(s), ${problems.length} problem(s)`,
	);

	for (const problem of problems) console.error(`  ${problem}`);
	console.log(
		"not checked here: whether the claims are true, whether the skill belongs in this repository, " +
			"and whether the prose names a machine (`archive_tool.py --audit`, `Scripts/AuditLeaks.sh`).",
	);

	if (problems.length) return 1;
	return existsSync(resolve(Root, Corpus)) ? 0 : 2;
}

process.exit(main());
