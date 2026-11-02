import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fail, isFailure } from "../../Cli/Parser/Output/Failure.ts";
import type { Configuration } from "../Schema/Schema.ts";
import { validate } from "../Schema/Schema.ts";

/** Where the identifier map lives, relative to the repository root. */
export const DEFAULT_CONFIGURATION = "Maintain/Configuration/Local/Configuration.local.json";

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

	process.stderr.write(`maintain: no ${ROOT_MARKER} above ${import.meta.dirname}; using ${process.cwd()}\n`);

	return process.cwd();
}

export function configurationPath(): string {
	const configured = process.env.MAINTAIN_CONFIG;
	if (configured === undefined || configured.length === 0) return join(root(), DEFAULT_CONFIGURATION);
	return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

/** Read and validate the map; a missing file is `no-config`, never a crash. */
export function load(): Configuration {
	const path = configurationPath();
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		throw fail("no-config", "the identifier map is missing", { expected: path });
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

	const fromEnvironment = process.env.MAINTAIN_CDP_PORT;
	const port =
		fromEnvironment !== undefined && /^\d+$/.test(fromEnvironment)
			? Number(fromEnvironment)
			: (configuration?.cdp.port ?? 9222);
	return { host: configuration?.cdp.host ?? "127.0.0.1", port };
}
