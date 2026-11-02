import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fail } from "../../Cli/Parser/Output/Failure.ts";
import { configurationPath } from "../Load/Load.ts";
import type { Configuration } from "../Schema/Schema.ts";
import { document } from "../Schema/Schema.ts";

function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Write the identifier map atomically.
 *
 * The file is written beside its target and renamed into place, so a reader
 * never sees half a map. `--force` is the only way to replace an existing one:
 * the map holds list ids that cannot be rediscovered from the interface.
 *
 * No secret ever reaches this file - it carries a public handle, public list
 * ids and a port, and nothing else. Mode 0600 keeps it the person's own.
 */
export function save(configuration: Configuration, options: { force?: boolean } = {}): string {
	const path = configurationPath();
	if (existsSync(path) && options.force !== true) {
		throw fail("config-exists", "the identifier map already exists", {
			path,
			next: "pass --force to overwrite it, or run `maintain config show` to read it",
		});
	}

	const directory = dirname(path);
	try {
		mkdirSync(directory, { recursive: true });
	} catch (error) {
		throw fail("io-error", "could not create the configuration directory", {
			path: directory,
			reason: reason(error),
		});
	}

	const temporary = join(directory, `.${basename(path)}.${process.pid}.tmp`);
	try {
		writeFileSync(temporary, `${JSON.stringify(document(configuration), null, "\t")}\n`, { mode: 0o600 });
		renameSync(temporary, path);
	} catch (error) {
		try {
			rmSync(temporary, { force: true });
		} catch {
			// The temporary file is already gone; the real failure is below.
		}
		throw fail("io-error", "could not write the identifier map", { path, reason: reason(error) });
	}

	return path;
}
