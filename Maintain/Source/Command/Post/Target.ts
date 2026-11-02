import { flag } from "../../Cli/Parser/Argument/Flag.ts";
import { option } from "../../Cli/Parser/Argument/Option.ts";

/** The four post commands address a post the same way; they share this list. */
export const targetOptions = [
	option("url", "string", "Permalink of the post to drive.", {
		format: "uri",
	}),
	option("tab", "string", "CDP target id from `tab list`, or its index."),
	option("index", "integer", "Zero-based article index on the page.", {
		default: 0,
	}),
];

export const dryRun = flag("dry-run", "Resolve the post and print it without touching it.");

/** `--url`, or `--tab` together with `--index`. */
export const targetAlternatives = [["url"], ["tab", "index"]] as const;
