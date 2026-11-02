#!/usr/bin/env node
/**
 * The positioning guard.
 *
 *   node Scripts/Position.mjs
 *   node Scripts/Position.mjs --root <path-to-checkout>
 *
 * RFC-0055 states five rules about who the product is. Three of them are
 * countable, and this file counts them, because a rule that lives only in a
 * record is a rule that decays the first time someone writes a sentence in a
 * hurry.
 *
 *   1. The brand appears once. The company that carries the network signs the
 *      footer and is named nowhere else: the network is named by whoever runs
 *      it. The mention is counted across `Source/` and `Content/`, and the one
 *      allowed mention has to be the attribution string - a second mention in a
 *      component is advertising, and a mention that moved into code is a
 *      sentence that stopped being copy.
 *
 *   2. One word for the unit of action. `motion` is the product's word for what
 *      a participant raises, the network carries and the outcome settles. The
 *      copy does not use `request`, `job` or `action` for it, and a sentence
 *      that does is a second vocabulary - which is the defect RFC-0019 exists to
 *      catch. The schema keeps its own names; this check reads `Content/` only,
 *      because the rule binds the copy and not the tables.
 *
 *   3. A claim names its protocol or its record. A showcase claim is a
 *      capability a reader can check (RFC-0053, RFC-0046 rule 2), so every file
 *      under `Content/String/Claim/` names a record (`RFC-NNNN`), and a claim
 *      that talks about cryptography names the cipher suite as well. "Your
 *      content is unreadable to us" is not a claim until it says
 *      `AES-GCM-256`; `End-to-end encrypted` never is one.
 *
 * It also checks that every claim has a key in `Source/Library/Content.ts`, so a
 * claim file that no page can resolve fails here rather than at build time with
 * a missing define.
 *
 * Plain JavaScript, no dependencies, on purpose: this runs inside `pnpm run
 * check` before anything is compiled, and it has to speak on a tree that does
 * not compile yet.
 *
 * Exit 0 the position holds, 1 it does not.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const Here = dirname(fileURLToPath(import.meta.url));

/**
 * The tree to read. `--root` exists so the guard can be pointed at a fixture:
 * a check that has never failed is a check nobody has tested.
 */
const Flag = process.argv.indexOf("--root");

const Root = Flag === -1 ? resolve(Here, "..") : resolve(process.argv[Flag + 1] ?? process.cwd());

/** The one file allowed to name the company. */
const Attribution = "Content/String/Brand/Attribution.md";

/** The folder whose every file is a showcase claim. */
const Claim = "Content/String/Claim";

/**
 * Folders that are generated, installed or archived - never read as copy.
 *
 * `Generated` is the compiled mirror of `Content/`: every string in the copy
 * layer appears there by construction, so counting it would count the same
 * mention twice. It is reported separately, and the acceptance grep excludes it.
 */
const Skip = new Set([
	".git",
	".hermes",
	"Generated",
	"Local",
	"node_modules",
	"Storage",
	"Target",
	"dist",
]);

/** Files this guard reads. A binary is skipped rather than decoded. */
const Text = /\.(?:astro|css|json|md|mjs|scss|ts|tsx)$/;

/** The words the copy may not use for a unit of action. */
const Banned = /\b(requests?|jobs?|actions?)\b/gi;

/** Protocol names a cryptographic claim has to carry. */
const Protocols = [
	"AES-GCM-256",
	"AES-256-GCM",
	"AES-GCM",
	"ChaCha20-Poly1305",
	"Ed25519",
	"HKDF-SHA256",
	"HKDF",
	"SHA-256",
	"TLS",
	"X25519",
];

/** A record: the RFC a claim is decided by. */
const Record = /RFC-\d{4}/;

function Section(Name) {
	process.stdout.write(`== ${Name}\n`);
}

function Line(Level, Text) {
	process.stdout.write(`${Level} ${Text}\n`);
}

/** Every text file under a directory, as paths relative to the root. */
function Walk(Directory) {
	const Files = [];

	let Names;

	try {
		Names = readdirSync(join(Root, Directory), { recursive: true, withFileTypes: true });
	} catch (Error) {
		if (Error.code === "ENOENT") return Files;
		throw Error;
	}

	for (const Entry of Names) {
		if (Entry.isDirectory()) continue;
		if (!Text.test(Entry.name)) continue;

		const Path = relative(Root, join(Entry.parentPath ?? Entry.path, Entry.name));

		if (Path.split(/[/\\]/).some((Segment) => Skip.has(Segment))) continue;

		Files.push(Path.split(/[/\\]/).join("/"));
	}

	return Files.sort();
}

/** `Content/String/Claim/Cipher.md` -> `CONTENT_STRING_CLAIM_CIPHER`. */
function Key(File) {
	return File.replace(/\.[^./]+$/, "")
		.split("/")
		.map((Segment) =>
			Segment.replace(/[^A-Za-z0-9]+/g, "_")
				.replace(/^_+|_+$/g, "")
				.toUpperCase(),
		)
		.join("_");
}

function Read(File) {
	return readFileSync(join(Root, File), "utf8");
}

/**
 * Check 1 - the brand appears once.
 *
 * `Source/` is allowed zero mentions: the shell renders the attribution from
 * the copy layer, so a name typed into a component is a sentence that escaped
 * `Content/`. `Content/` is allowed exactly one, in the attribution file.
 */
function CheckBrand() {
	Section("brand");

	const Mentions = [];

	for (const File of [...Walk("Source"), ...Walk("Content")]) {
		const Hits = (Read(File).match(/\bDELO\b/g) ?? []).length;

		if (Hits > 0) Mentions.push({ File, Hits });
	}

	const InSource = Mentions.filter((Entry) => Entry.File.startsWith("Source/"));

	if (Mentions.length === 0) {
		Line(
			"FAIL",
			`the company is named nowhere; the shell's attribution is ${Attribution}, and RFC-0055 rule 3 asks for it there once`,
		);
		return false;
	}

	if (Mentions.length > 1 || Mentions[0].File !== Attribution) {
		for (const Entry of Mentions) {
			Line("FAIL", `${Entry.File}: ${Entry.Hits} mention(s)`);
		}
		process.stdout.write(
			[
				"",
				`     RFC-0055 rule 3: the company appears in ${Attribution} and nowhere else.`,
				"     The network is named by whoever runs it - `Content/String/Brand/Title.md` -",
				"     and a carrier that signs every surface is advertising at its users.",
				"",
				"",
			].join("\n"),
		);
		return false;
	}

	/**
	 * The compiled mirror, reported rather than counted.
	 *
	 * `Source/Generated/Content.ts` is written from `Content/` on every config
	 * load, so the attribution appears there by construction. Counting it would
	 * make one mention look like two; naming it here is what keeps the
	 * acceptance grep - which excludes the folder - from reading as a cover-up.
	 */
	const Mirror = "Source/Generated/Content.ts";

	try {
		const Compiled = (Read(Mirror).match(/\bDELO\b/g) ?? []).length;

		Line(
			"INFO",
			`${Mirror} carries it ${Compiled} time(s) - the same string, compiled; the count above is the copy`,
		);
	} catch {
		// No generated module yet: `astro` writes it on the next config load.
	}

	Line("PASS", `${Attribution} names it once, and Source/ names it ${InSource.length} times`);
	return true;
}

/**
 * Check 2 - one word for the unit of action.
 *
 * The banned words are matched whole and case-insensitively: `redaction` is not
 * `action`, and the check is about the noun the copy uses for a motion, not
 * about every word that contains the letters.
 */
function CheckVocabulary() {
	Section("vocabulary");

	const Offenders = [];

	for (const File of Walk("Content")) {
		const Lines = Read(File).split("\n");

		Lines.forEach((Line_, Index) => {
			Banned.lastIndex = 0;

			const Match = Banned.exec(Line_);

			if (Match !== null) {
				Offenders.push({ File, Line: Index + 1, Word: Match[0] });
			}
		});
	}

	if (Offenders.length === 0) {
		Line("PASS", "no copy calls a motion a request, a job or an action");
		return true;
	}

	for (const Entry of Offenders) {
		Line("FAIL", `${Entry.File}:${Entry.Line} uses "${Entry.Word}"`);
	}

	process.stdout.write(
		[
			"",
			"     RFC-0055 rule 2: the copy's word is `motion` - raised by a participant,",
			"     carried by the network, settled when its outcome is recorded. A record that",
			"     stores one keeps its own name (`Event`, `vote.cast`); the rule binds the copy.",
			"",
			"",
		].join("\n"),
	);

	return false;
}

/**
 * Check 3 - a claim names its protocol or its record.
 *
 * Every claim file has to name a record, because a claim nobody can trace is a
 * slogan. A claim that talks about cryptography has to name the suite as well,
 * which is the difference between a checkable statement and an adjective.
 */
function CheckClaims() {
	Section("claims");

	const Files = Walk(Claim);

	if (Files.length === 0) {
		Line("FAIL", `${Claim}/ holds no claim; a showcase page states capabilities (RFC-0053)`);
		return false;
	}

	const Content = (() => {
		try {
			return Read("Source/Library/Content.ts");
		} catch {
			// A tree with no content wrapper has no key to resolve: every claim
			// then reports the missing key, which is the honest answer.
			return "";
		}
	})();
	let Ok = true;

	for (const File of Files) {
		const Sentence = Read(File);
		const Name = File.slice(File.lastIndexOf("/") + 1, -3);

		const Problems = [];

		if (!Record.test(Sentence)) {
			Problems.push("names no record (RFC-NNNN)");
		}

		const Cryptographic = /\b(?:cipher\w*|decrypt\w*|encrypt\w*|keys?|seal\w*)\b/i.test(
			Sentence,
		);

		if (Cryptographic && !Protocols.some((Name_) => Sentence.includes(Name_))) {
			Problems.push(`names no cipher suite (one of ${Protocols.join(", ")})`);
		}

		if (!Content.includes(`CONTENT_STRING_CLAIM_${Key(File).split("CLAIM_")[1]}`)) {
			Problems.push(`has no key in Source/Library/Content.ts (Content.Claim.${Name})`);
		}

		if (Problems.length === 0) {
			Line("PASS", `${Name}: ${Record.exec(Sentence)[0]}`);
			continue;
		}

		Ok = false;

		for (const Problem of Problems) {
			Line("FAIL", `${File}: ${Problem}`);
		}
	}

	return Ok;
}

const BrandOk = CheckBrand();
const VocabularyOk = CheckVocabulary();
const ClaimOk = CheckClaims();

process.stdout.write("---\n");
process.stdout.write(
	BrandOk && VocabularyOk && ClaimOk ? "RESULT positioned\n" : "RESULT mispositioned\n",
);

process.exit(BrandOk && VocabularyOk && ClaimOk ? 0 : 1);
