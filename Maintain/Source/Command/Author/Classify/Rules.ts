import { relative } from "node:path";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { optional, root } from "../../../Configuration/Load/Load.ts";
import { load as loadRules, rulesPath } from "../../../Configuration/Rules/Rules.ts";
import type { Preserved } from "../../../Model/Author/Decision.ts";
import { classify } from "../../../Model/Author/Decision.ts";
import { open as openAuthors } from "../../../Store/Author/Author.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { collect } from "../Evidence/Collect.ts";

/** A path for the output: repository-relative when it is inside the repo. */
function shown(path: string): string {
	const relativePath = relative(root(), path);
	return relativePath.startsWith("..") ? path : relativePath;
}

/**
 * The decisions already on file that the rules may not replace.
 *
 * Only `decision.by:"manual"` counts. A `rule` or `model` answer is a previous
 * guess and this pass is allowed to supersede it; a manual one is the person's
 * own answer, so it is reported and never scored again.
 */
export function manual(content: string): Map<string, Preserved> {
	const held = new Map<string, Preserved>();

	for (const record of openAuthors(content).all()) {
		const decision = record.decision;
		if (decision === null || decision.by !== "manual") continue;
		held.set(record.handle, {
			handle: record.handle,
			list: record.lists[0] ?? null,
			reason: decision.reason ?? "manual decision on file",
		});
	}

	return held;
}

/**
 * The deterministic first pass: weighted rules, no model, no writes.
 *
 * Every author whose best list clears both the score and the gap threshold is
 * placed; everyone else is reported as ambiguous, with `list: null`, so the
 * model pass has exactly the work the rules could not do. Each entry carries a
 * one-line reason built from the arithmetic that produced it - a decision
 * nobody can explain is a decision nobody can tune.
 *
 * This command reads the shadow archive and the Author collection and writes
 * neither: distribution is a launch process, and a dry run has to stay dry.
 */
export const Definition: CommandDefinition = {
	path: ["author", "classify", "rules"],
	summary: "Place authors into lists with weighted rules; leave the ambiguous ones unassigned.",
	options: [],
	async run(): Promise<unknown> {
		const rules = loadRules();
		const collection = collect();
		const result = classify(collection.authors, rules, manual(contentDirectory()));

		// A rules list with no id in the identifier map can be decided but never
		// applied, which is worth saying before a distribute run discovers it.
		const configuration = optional();
		if (configuration !== null && configuration.lists.length > 0) {
			const configured = new Set(configuration.lists.map((entry) => entry.slug));
			const missing = Object.keys(rules.lists).filter((slug) => !configured.has(slug));
			if (missing.length > 0) {
				process.stderr.write(
					`maintain: no list id configured for ${missing.join(", ")}; those decisions cannot be applied\n`,
				);
			}
		}

		return {
			rules: shown(rulesPath()),
			threshold: rules.threshold,
			counts: {
				authors: collection.authors.length,
				decided: result.decisions.length,
				ambiguous: result.ambiguous.length,
				manual: result.preserved.length,
			},
			decisions: result.decisions,
			ambiguous: result.ambiguous,
			preserved: result.preserved,
		};
	},
};
