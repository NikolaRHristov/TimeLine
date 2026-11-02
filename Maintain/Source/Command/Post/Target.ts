import { flag } from "../../CLI/Parser/Argument/Flag.ts";
import { option } from "../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../CLI/Parser/Output/Failure.ts";
import type { Values } from "../../CLI/Parser/Parser.ts";
import type { PostTarget } from "../../Transport/Transport.ts";

/**
 * The four post commands address a post the same way; they share this list.
 *
 * `--id` is the form the archive can answer, and the one a permalink is not
 * needed for. `--url` reuses a tab already showing that permalink; `--tab` with
 * `--index` drives a tab the person already has.
 */
export const targetOptions = [
	option("id", "string", "Status id of the post, as it appears in a permalink."),
	option("url", "string", "Permalink of the post to drive.", {
		format: "uri",
	}),
	option("tab", "string", "CDP target id from `tab list`, or its index."),
	option("index", "integer", "Zero-based article index on the page.", {
		default: 0,
	}),
];

export const dryRun = flag("dry-run", "Resolve the post and print it without touching it.");

/** `--id`, or `--url`, or `--tab` together with `--index`. */
export const targetAlternatives = [["id"], ["url"], ["tab", "index"]] as const;

/**
 * The one target the values name.
 *
 * Checked here rather than in the parser because `--index` has a default, so
 * "some target was given" is not something a required-option rule can say.
 * The failure is `usage`, like every other argument mistake.
 */
export function targetOf(values: Values): PostTarget {
	const id = values["id"];
	if (typeof id === "string" && id.length > 0) return { id };

	const url = values["url"];
	if (typeof url === "string" && url.length > 0) return { url };

	const tab = values["tab"];
	if (typeof tab === "string" && tab.length > 0) {
		return { tab, index: typeof values["index"] === "number" ? values["index"] : 0 };
	}

	throw fail("usage", "give --id, --url, or --tab with --index", {
		options: ["--id", "--url", "--tab", "--index"],
	});
}
