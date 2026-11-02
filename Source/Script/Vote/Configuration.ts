import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { complete, type FirebaseConfiguration } from "../Firebase.ts";

/**
 * Where the vote project comes from, at build time.
 *
 * Server-side only: this module reads the filesystem and `process.env`, and is
 * imported by page frontmatter - never by a `<script>`. What reaches the
 * browser is the serialised object the page chooses to embed, which is exactly
 * the public half of a Firebase project.
 *
 * Two sources, environment first:
 *
 * 1. `MAINTAIN_VOTE_FIREBASE_*` - the same names the CLI reads, so one export
 *    block configures `maintain vote sync` and the site.
 * 2. `Maintain/Configuration/Local/Vote.local.json` - gitignored, beside the
 *    identifier map, for a person who would rather not export eight variables
 *    in every shell.
 *
 * Nothing configured means `null`, which means the site builds with voting
 * absent. That is the default path, not an error path.
 */
export const ENVIRONMENT: Readonly<Record<keyof FirebaseConfiguration, string>> = {
	apiKey: "MAINTAIN_VOTE_FIREBASE_API_KEY",
	appId: "MAINTAIN_VOTE_FIREBASE_APP_ID",
	authDomain: "MAINTAIN_VOTE_FIREBASE_AUTH_DOMAIN",
	databaseURL: "MAINTAIN_VOTE_FIREBASE_DATABASE_URL",
	measurementId: "MAINTAIN_VOTE_FIREBASE_MEASUREMENT_ID",
	messagingSenderId: "MAINTAIN_VOTE_FIREBASE_MESSAGING_SENDER_ID",
	projectId: "MAINTAIN_VOTE_FIREBASE_PROJECT_ID",
	storageBucket: "MAINTAIN_VOTE_FIREBASE_STORAGE_BUCKET",
};

/** Gitignored, because it names one machine's project. */
export const LOCAL = "Maintain/Configuration/Local/Vote.local.json";

function record(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/**
 * The project for this build, or null.
 *
 * A missing file is silent - it is the normal case. A file that exists and is
 * not a JSON object is a typo somebody will spend an hour on, so it says so in
 * the build log and then degrades to the environment.
 */
export function read(
	environment: NodeJS.ProcessEnv = process.env,
	directory: string = process.cwd(),
): FirebaseConfiguration | null {
	const path = join(directory, LOCAL);
	let local: Record<string, unknown> = {};

	if (existsSync(path)) {
		try {
			const parsed = record(JSON.parse(readFileSync(path, "utf8")));
			if (parsed === null) {
				console.warn(`vote: ${LOCAL} is not a JSON object; ignoring it`);
			} else {
				local = parsed;
			}
		} catch (error) {
			console.warn(
				`vote: ${LOCAL} is not JSON (${error instanceof Error ? error.message : String(error)}); ignoring it`,
			);
		}
	}

	const value: Partial<FirebaseConfiguration> = {};
	for (const field of Object.keys(ENVIRONMENT) as (keyof FirebaseConfiguration)[]) {
		value[field] = text(environment[ENVIRONMENT[field]]) || text(local[field]);
	}

	return complete(value) ? value : null;
}
