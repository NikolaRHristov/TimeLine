import { execute, withListMember } from "../../../Browser/Session/ListMember.ts";
import { flag } from "../../../Cli/Parser/Argument/Flag.ts";
import { fail } from "../../../Cli/Parser/Output/Failure.ts";
import type { CommandDefinition, Values } from "../../../Cli/Parser/Parser.ts";
import { configurationPath, optional, requireList } from "../../../Configuration/Load/Load.ts";
import { load as loadRules, scope } from "../../../Configuration/Rules/Rules.ts";
import { SPACING, apply as applyPlan, resolve } from "../../../Model/Author/Distribute.ts";
import { handle as normalize } from "../../../Model/List/Member.ts";
import { open as openAuthors } from "../../../Store/Author/Author.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { collect } from "../Evidence/Collect.ts";

/** Wait, holding nothing: the only thing between two writes. */
function pause(ms: number): Promise<void> {
	return new Promise<void>((done) => setTimeout(done, ms));
}

/**
 * The last stage: turn the decisions into records, and records into memberships.
 *
 * The two halves are gated differently on purpose. A **record** is local and
 * reversible - it is the site's content, and the file is the decision this pass
 * made. A **membership** reaches X and cannot be undone by deleting a file, so
 * it is the half that needs `--apply`.
 *
 * Both halves are armed by the same flag, because acceptance is simple: without
 * `--apply` the command changes nothing at all, and a person reading the output
 * of a dry run is reading a plan, not a report of work. Within `--apply` the
 * order is fixed - every record first, then one membership at a time - so a run
 * that stops halfway leaves a plan on disk that the next run reads instead of
 * re-deriving, and every membership that exists is one a record explains.
 *
 * A manual decision is never written here. The record is the person's own
 * answer; this pass only carries out the filing it describes.
 */
export const Definition: CommandDefinition = {
	path: ["author", "distribute", "apply"],
	summary: "Write the resolved decisions, then add their memberships when --apply is passed.",
	options: [
		flag("apply", "Write the decision records and add the memberships. Without this flag nothing is written."),
		flag("dry-run", "Report the plan. This is the default; the flag only makes it explicit."),
	],
	async run(values: Values): Promise<unknown> {
		if (values["apply"] === true && values["dry-run"] === true) {
			throw fail("usage", "--apply and --dry-run ask for opposite things; pass one");
		}
		const apply = values["apply"] === true;

		// A membership is named by the map's slug, so the map is required to
		// write one - the same rule `page list member add` follows. A dry run
		// only needs a vocabulary, and `scope` degrades to the rules' own keys.
		const configuration = optional();
		if (apply && configuration === null) {
			throw fail("no-config", "adding memberships needs the identifier map; a dry run does not", {
				expected: configurationPath(),
				next: "maintain config init",
			});
		}

		const rules = scope(loadRules(), configuration);
		const store = openAuthors(contentDirectory());
		const collection = collect();
		const resolution = resolve(collection.authors, rules.rules, rules.slugs, store.all());

		const evidence = new Map(collection.authors.map((entry) => [entry.handle, entry]));
		const at = new Date().toISOString();

		const add = async (handle: string, list: string): Promise<"added" | "already"> => {
			const normalized = normalize(handle);
			if (normalized === null) {
				// A handle goes into a URL path, so it is validated before it
				// becomes one - the record is not a reason to trust it.
				throw fail("usage", `not a handle: ${handle}`, { handle });
			}
			if (configuration === null) {
				// Unreachable: `--apply` refused above without a map. Named
				// anyway, because a membership must never be attempted against a
				// list nothing declares.
				throw fail("no-config", "no identifier map, so there is no list name to add to", { handle, list });
			}

			const name = requireList(configuration, list).name;
			return withListMember(normalized, async ({ surface }) => {
				const report = await execute(surface, { handle: normalized, name, apply: true });
				return report.dryRun === false && report.added ? "added" : "already";
			});
		};

		const applied = await applyPlan(resolution.plan, {
			apply,
			at,
			store,
			evidence: (handle) => evidence.get(handle),
			add,
			pause,
		});

		if (applied.stopped !== null) {
			const stop = applied.stopped;
			process.stderr.write(
				`maintain: stopped (${stop.reason}: ${stop.error}) at @${stop.handle} \u2192 ${stop.list} after ${stop.attempted} of ${resolution.plan.length}; ${applied.remaining.length} membership(s) left\n`,
			);
		}

		return {
			dryRun: !apply,
			apply,
			lists: rules.slugs,
			spacing: SPACING,
			counts: {
				authors: collection.authors.length,
				handles: new Set(resolution.plan.map((entry) => entry.handle)).size,
				memberships: resolution.plan.length,
				manual: resolution.preserved.length,
				declined: resolution.declined.length,
				unresolved: resolution.unresolved.length,
				skipped: resolution.skipped.length,
				records: applied.written.length,
				added: applied.added.length,
				already: applied.already.length,
				failed: applied.failed.length,
				remaining: applied.remaining.length,
			},
			// The plan without its scheduling marker: a caller reads what would be
			// added and who decided it. The rules' numbers ride in the reason text
			// and in the record; `write` and the arithmetic stay internal.
			plan: resolution.plan.map((entry) => ({
				handle: entry.handle,
				list: entry.list,
				by: entry.by,
				reason: entry.reason,
			})),
			preserved: resolution.preserved,
			declined: resolution.declined,
			unresolved: resolution.unresolved,
			skipped: resolution.skipped,
			written: applied.written,
			added: applied.added,
			already: applied.already,
			failed: applied.failed,
			remaining: applied.remaining,
			stopped: applied.stopped,
		};
	},
};
