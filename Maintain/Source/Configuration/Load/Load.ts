import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fail, isFailure } from "../../CLI/Parser/Output/Failure.ts";
import type { List } from "../../Model/List/List.ts";
import { empty, validate, type Configuration } from "../Schema/Schema.ts";

/** Where the identifier map lives, relative to the repository root. */
export const DEFAULT_CONFIGURATION = "Maintain/Configuration/Local/Configuration.local.json";

/** The tracked example a fresh clone copies (or `config init` writes from). */
export const EXAMPLE_CONFIGURATION = "Maintain/Configuration/Example/Configuration.example.json";

/** The marker that names the repository root: the workspace file. */
const ROOT_MARKER = "pnpm-workspace.yaml";

/**
 * The repository root.
 *
 * Found by walking up from this module, never by counting `..`: the same file
 * runs from two depths. From source it is `Maintain/Source/Configuration/Load`;
 * compiled it is `Maintain/Target/Configuration/Load`, one level shallower
 * because the build drops `Source`. A fixed number of `..` is right in one
 * place and wrong in the other, and being wrong means reading the identifier
 * map - and writing the shadow store - in the wrong directory.
 *
 * A tree without the marker falls back to the working directory and says so:
 * guessing quietly would be worse than a warning.
 */
export function root(): string {
	let directory = import.meta.dirname;

	for (;;) {
		if (existsSync(join(directory, ROOT_MARKER))) return directory;

		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}

	process.stderr.write(
		`maintain: no ${ROOT_MARKER} above ${import.meta.dirname}; using ${process.cwd()}\n`,
	);

	return process.cwd();
}

export function configurationPath(): string {
	const configured = process.env["MAINTAIN_CONFIG"];
	if (configured === undefined || configured.length === 0)
		return join(root(), DEFAULT_CONFIGURATION);
	return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

/** Read and validate the map; a missing file is `no-config`, never a crash. */
export function load(): Configuration {
	const path = configurationPath();
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		// Both halves of the fix are absolute: the caller may be anywhere, and a
		// relative copy command only works from the repository root. Quoted so a
		// path with a space still pastes.
		const examplePath = join(root(), EXAMPLE_CONFIGURATION);
		throw fail("no-config", "the identifier map is missing", {
			expected: path,
			// The exact commands, run from any directory: a failure that only
			// names a path leaves the caller guessing at the next step.
			copy: `mkdir -p "${dirname(path)}" && cp "${examplePath}" "${path}"`,
			next: "maintain config init",
		});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw fail("schema-invalid", "the identifier map is not JSON", {
			path,
			reason: error instanceof Error ? error.message : String(error),
		});
	}
	return validate(parsed, path);
}

/** The map when it exists; null when only the file is missing. */
export function optional(): Configuration | null {
	try {
		return load();
	} catch (error) {
		if (isFailure(error) && error.code === "no-config") return null;
		throw error;
	}
}

/**
 * The tracked example, validated.
 *
 * `config init` starts from this file so the written map carries the same
 * defaults the documentation describes. A broken example degrades to the
 * built-in defaults with a warning - onboarding must not die because someone
 * edited the example by hand.
 */
export function example(): Configuration {
	const path = join(root(), EXAMPLE_CONFIGURATION);
	try {
		return validate(JSON.parse(readFileSync(path, "utf8")), path);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`maintain: ${EXAMPLE_CONFIGURATION} is unreadable (${detail}); using built-in defaults\n`,
		);
		return empty();
	}
}

/**
 * The one list a slug names, or `unknown-list` naming the configured set.
 *
 * This is the only place a slug becomes an id, so a command cannot invent a
 * list the map does not declare.
 */
export function requireList(configuration: Configuration, slug: string): List {
	const found = configuration.lists.find((entry) => entry.slug === slug);
	if (found !== undefined) return found;

	// The message names the configured set, not only the miss: a caller reading
	// one line of output has to learn what it could have asked for. An empty map
	// says `none` rather than trailing off into an empty list.
	const configured = configuration.lists.map((entry) => entry.slug);
	throw fail(
		"unknown-list",
		`${JSON.stringify(slug)} is not configured; configured lists: ${configured.length === 0 ? "none" : configured.join(", ")}`,
		{
			slug,
			configured,
			expected: configurationPath(),
			next: `add it with: maintain config init --force --list ${slug}=<id>`,
		},
	);
}

/**
 * Where the browser listens.
 *
 * Commands that only touch the browser (`tab list`, `post extract`) work
 * without an identifier map: the env var wins, then the map, then 9222.
 */
export function connection(): { host: string; port: number } {
	let configuration: Configuration | null = null;
	try {
		configuration = load();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		process.stderr.write(`maintain: using the default CDP endpoint (${detail})\n`);
	}

	const fromEnvironment = process.env["MAINTAIN_CDP_PORT"];
	const port =
		fromEnvironment !== undefined && /^\d+$/.test(fromEnvironment)
			? Number(fromEnvironment)
			: (configuration?.cdp.port ?? 9222);
	return { host: configuration?.cdp.host ?? "127.0.0.1", port };
}
