import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "../../CLI/Parser/Output/Failure.ts";
import { root } from "../../Configuration/Load/Load.ts";

/**
 * The Firebase web configuration, as a value.
 *
 * Every field is a public identifier except none of them: a Firebase web
 * `apiKey` names a project, it does not authorise anything, and the database
 * rules are what decide who may write. It still never lives in the tree - it
 * is this machine's project, not the repository's - so it comes from the
 * environment or from a gitignored local file.
 */
export type FirebaseConfiguration = {
	apiKey: string;
	authDomain: string;
	databaseURL: string;
	projectId: string;
	storageBucket: string;
	messagingSenderId: string;
	appId: string;
	measurementId: string;
};

/**
 * Where the CLI looks for the local file. `Maintain/Configuration/Local/` is
 * gitignored, so the file can sit beside the identifier map without a second
 * ignore rule.
 */
export const LOCAL_CONFIGURATION = "Maintain/Configuration/Local/Vote.local.json";

/**
 * The environment variable per field. The same names are read by the site at
 * build time, so one `export` block configures both halves.
 */
export const ENVIRONMENT: Readonly<Record<keyof FirebaseConfiguration, string>> = {
	apiKey: "MAINTAIN_VOTE_FIREBASE_API_KEY",
	authDomain: "MAINTAIN_VOTE_FIREBASE_AUTH_DOMAIN",
	databaseURL: "MAINTAIN_VOTE_FIREBASE_DATABASE_URL",
	projectId: "MAINTAIN_VOTE_FIREBASE_PROJECT_ID",
	storageBucket: "MAINTAIN_VOTE_FIREBASE_STORAGE_BUCKET",
	messagingSenderId: "MAINTAIN_VOTE_FIREBASE_MESSAGING_SENDER_ID",
	appId: "MAINTAIN_VOTE_FIREBASE_APP_ID",
	measurementId: "MAINTAIN_VOTE_FIREBASE_MEASUREMENT_ID",
};

/** An optional Realtime Database auth token, for a database that is not public-read. */
export const TOKEN_ENV = "MAINTAIN_VOTE_FIREBASE_TOKEN";

/** Seconds before one read is abandoned. */
const TIMEOUT = 10_000;

/** How much of an unreadable body a failure carries. */
const BODY_LIMIT = 300;

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

/**
 * The project this machine talks to, or null when it has none.
 *
 * A missing file, an unreadable file and an empty file all mean the same thing
 * to the caller - there is no project - so none of them is an exception. The
 * one case that is *not* silent is a file that exists and is not JSON: that is
 * somebody's typo, and it says so on stderr before degrading to the
 * environment, because silently ignoring a half-written file is how a person
 * spends an hour on a "wrong" vote count.
 */
export function configuration(
	environment: NodeJS.ProcessEnv = process.env,
): FirebaseConfiguration | null {
	const path = join(root(), LOCAL_CONFIGURATION);
	let local: Record<string, unknown> = {};

	if (existsSync(path)) {
		try {
			const parsed = record(JSON.parse(readFileSync(path, "utf8")));
			if (parsed === null) {
				process.stderr.write(
					`maintain: ${LOCAL_CONFIGURATION} is not a JSON object; ignoring it\n`,
				);
			} else {
				local = parsed;
			}
		} catch (error) {
			process.stderr.write(
				`maintain: ${LOCAL_CONFIGURATION} is not JSON (${
					error instanceof Error ? error.message : String(error)
				}); ignoring it\n`,
			);
		}
	}

	const value: FirebaseConfiguration = {
		apiKey: "",
		authDomain: "",
		databaseURL: "",
		projectId: "",
		storageBucket: "",
		messagingSenderId: "",
		appId: "",
		measurementId: "",
	};

	for (const field of Object.keys(ENVIRONMENT) as (keyof FirebaseConfiguration)[]) {
		value[field] = text(environment[ENVIRONMENT[field]]) || text(local[field]);
	}

	// The REST read needs the database URL and nothing else; the rest of the
	// fields only matter to the browser SDK. Requiring all eight would make a
	// `vote sync` fail over a field it never reads.
	return value.databaseURL === "" ? null : value;
}

function base(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Counts, read straight out of the Realtime Database's REST surface.
 *
 * `GET <databaseURL>/votes.json` answers one object keyed by entry id. The
 * read is unauthenticated by default, which is the same permission the site
 * itself needs; `MAINTAIN_VOTE_FIREBASE_TOKEN` adds `?auth=` for a database
 * whose rules require it.
 *
 * Everything that is not a usable answer is one named failure. A malformed
 * value is dropped rather than guessed at: a string where a number belongs is
 * somebody's other application sharing the database, not a vote.
 */
export async function counts(
	value: FirebaseConfiguration,
	ids: readonly string[],
	environment: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, number>> {
	const token = text(environment[TOKEN_ENV]);
	const endpoint = `${base(value.databaseURL)}/votes.json${
		token === "" ? "" : `?auth=${encodeURIComponent(token)}`
	}`;

	let response: Response;
	try {
		response = await fetch(endpoint, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(TIMEOUT),
		});
	} catch (error) {
		throw fail("vote-unreachable", "the vote database did not answer", {
			// The URL, not the token: the token is a credential and a failure
			// object is printed to a terminal and pasted into issues.
			url: base(value.databaseURL),
			reason: error instanceof Error ? error.message : String(error),
		});
	}

	const raw = await response.text().catch(() => "");
	if (!response.ok) {
		throw fail("vote-unreachable", "the vote database refused the read", {
			url: base(value.databaseURL),
			status: response.status,
			body: raw.slice(0, BODY_LIMIT),
			next:
				response.status === 401 || response.status === 403
					? "check the database rules, or set MAINTAIN_VOTE_FIREBASE_TOKEN"
					: "check MAINTAIN_VOTE_FIREBASE_DATABASE_URL",
		});
	}

	let payload: unknown;
	try {
		payload = raw.trim() === "" ? {} : JSON.parse(raw);
	} catch {
		throw fail("vote-unreachable", "the vote database did not answer with JSON", {
			url: base(value.databaseURL),
			body: raw.slice(0, BODY_LIMIT),
		});
	}

	const body = record(payload) ?? {};
	const found: Record<string, number> = {};
	for (const id of ids) {
		const value = body[id];
		if (typeof value !== "number" || !Number.isFinite(value)) continue;
		const whole = Math.trunc(value);
		if (whole >= 0) found[id] = whole;
	}
	return found;
}
