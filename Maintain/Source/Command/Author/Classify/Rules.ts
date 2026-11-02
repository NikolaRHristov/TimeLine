import { relative } from "node:path";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { optional, root } from "../../../Configuration/Load/Load.ts";
import { load as loadRules, rulesPath, scope } from "../../../Configuration/Rules/Rules.ts";
import * as Text from "../../../Content/Text.ts";
import { classify, type Preserved } from "../../../Model/Author/Decision.ts";
import { open as openAuthors } from "../../../Store/Author/Author.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import type { CommandContext } from "../../Context/Context.ts";
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
	summary: Text.CommandAuthorClassifyRulesSummary,
	options: [],
	async run(_context: CommandContext): Promise<unknown> {
		// The identifier map decides which lists exist; the rules file only says
		// how to weigh them. Scoring against the rules' own keys would let the
		// weights file decide the taxonomy, so the rules are narrowed first.
		const scoped = scope(loadRules(), optional());
		const collection = collect();
		const result = classify(collection.authors, scoped.rules, manual(contentDirectory()));

		return {
			rules: shown(rulesPath()),
			threshold: scoped.rules.threshold,
			lists: scoped.slugs,
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
