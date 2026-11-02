import type { Evidence } from "./Evidence.ts";

/**
 * The weighted rules, as `Configuration/Rules/Rules.json` declares them.
 *
 * Nothing here has a default: a weight or a threshold that is not in the file
 * does not exist, so tuning the classifier never means editing this module.
 */
export type ListRule = {
	/** Term to weight. A term the vocabulary does not count can never fire. */
	keywords?: Record<string, number>;
	/** Host to weight. A key also covers its subdomains. */
	domains?: Record<string, number>;
};

export type Rules = {
	version: number;
	threshold: { score: number; gap: number };
	lists: Record<string, ListRule>;
};

/** One weighted thing that scored for one list. */
export type Contribution = { name: string; count: number; weight: number; points: number };

/** What one list makes of one author. */
export type ListScore = {
	list: string;
	score: number;
	keywords: number;
	domains: number;
	/** The heaviest contributions, heaviest first - what the reason names. */
	top: Contribution[];
};

/** A confident placement: the score and the margin that earned it. */
export type Decision = {
	handle: string;
	list: string;
	score: number;
	gap: number;
	by: "rule";
	reason: string;
};

/**
 * An author no list cleared the threshold for.
 *
 * `list` is null rather than absent: a caller that filters on it cannot mistake
 * an unresolved author for a placed one, and the model pass reads this array.
 */
export type Ambiguous = {
	handle: string;
	list: null;
	score: number;
	gap: number;
	reason: string;
};

/** A decision already on file that the rules must not touch. */
export type Preserved = { handle: string; list: string | null; reason: string };

export type Classification = {
	decisions: Decision[];
	ambiguous: Ambiguous[];
	preserved: Preserved[];
};

/** Order by UTF-16 code unit: `localeCompare` depends on the machine's locale. */
function compare(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/** Two decimals: a score is read by a person, not accumulated. */
function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/** A number as a person writes it: `12`, not `12.00`. */
function points(value: number): string {
	return String(round(value));
}

/** `figma.com` covers `figma.com` and `blog.figma.com`, never `notfigma.com`. */
function covers(host: string, key: string): boolean {
	return host === key || host.endsWith(`.${key}`);
}

/**
 * The longest rule key that covers one host, or null.
 *
 * Longest, because `gist.github.com` is a better answer than `github.com` when
 * a rules file weights both, and a host must never score twice for one list.
 */
function mostSpecific(host: string, weights: Record<string, number>): string | null {
	let found: string | null = null;
	for (const key of Object.keys(weights)) {
		if (!covers(host, key)) continue;
		if (found === null || key.length > found.length) found = key;
	}
	return found;
}

/**
 * Score one author against every configured list.
 *
 * A keyword weight applies to the evidence bucket with the same name, and the
 * buckets are the loaded vocabulary's keys. A list with no bucket of its own
 * scores on domains only - which is why the rules loader warns about keyword
 * weights for a list the evidence cannot count.
 */
export function score(evidence: Evidence, rules: Rules): ListScore[] {
	const scored: ListScore[] = [];

	for (const [list, rule] of Object.entries(rules.lists)) {
		const counted = evidence.terms[list] ?? {};
		const domains = rule.domains ?? {};
		const contributions: Contribution[] = [];

		let keywordPoints = 0;
		for (const [term, weight] of Object.entries(rule.keywords ?? {})) {
			const count = counted[term] ?? 0;
			if (count === 0) continue;
			const earned = weight * count;
			keywordPoints += earned;
			contributions.push({ name: term, count, weight, points: round(earned) });
		}

		let domainPoints = 0;
		for (const hit of evidence.domains) {
			const key = mostSpecific(hit.domain, domains);
			if (key === null) continue;
			const weight = domains[key] ?? 0;
			const earned = weight * hit.count;
			domainPoints += earned;
			contributions.push({ name: hit.domain, count: hit.count, weight, points: round(earned) });
		}

		contributions.sort((left, right) => right.points - left.points || compare(left.name, right.name));
		scored.push({
			list,
			score: round(keywordPoints + domainPoints),
			keywords: round(keywordPoints),
			domains: round(domainPoints),
			top: contributions,
		});
	}

	return scored;
}

/** The arithmetic in one line, naming at most three contributions. */
function detail(scored: ListScore): string {
	if (scored.top.length === 0) return `${scored.list} scored 0`;
	const shown = scored.top.slice(0, 3).map((entry) => `${entry.name}×${entry.count}=${points(entry.points)}`);
	const rest = scored.top.length - shown.length;
	return `${scored.list} ${points(scored.score)} (${shown.join(", ")}${rest > 0 ? `, +${rest} more` : ""})`;
}

function runnerUpText(scored: ListScore | undefined): string {
	return scored === undefined ? "no other list" : `${scored.list} ${points(scored.score)}`;
}

/**
 * Decide one author - or refuse to.
 *
 * Two conditions, both from the rules file: the best list must reach
 * `threshold.score`, and it must lead the runner-up by `threshold.gap`. A list
 * that leads by a rounding error is not a decision; the model pass gets it.
 */
export function decide(evidence: Evidence, rules: Rules): Decision | Ambiguous {
	const ranked = score(evidence, rules).sort(
		(left, right) => right.score - left.score || compare(left.list, right.list),
	);
	const best = ranked[0];

	if (best === undefined) {
		return {
			handle: evidence.handle,
			list: null,
			score: 0,
			gap: 0,
			reason: "the rules name no lists, so nothing could be scored",
		};
	}

	const runnerUp = ranked[1];
	const gap = round(best.score - (runnerUp?.score ?? 0));
	const threshold = rules.threshold;

	if (best.score > 0 && best.score >= threshold.score && gap >= threshold.gap) {
		return {
			handle: evidence.handle,
			list: best.list,
			score: best.score,
			gap,
			by: "rule",
			reason: `${detail(best)}; runner-up ${runnerUpText(runnerUp)}; gap ${points(gap)} clears ${points(threshold.gap)}`,
		};
	}

	if (best.score === 0) {
		return {
			handle: evidence.handle,
			list: null,
			score: 0,
			gap: 0,
			reason: `no weighted keyword or domain matched any list; the ${points(threshold.score)} minimum is not reached`,
		};
	}

	const reason =
		best.score < threshold.score
			? `${detail(best)}; runner-up ${runnerUpText(runnerUp)}; below the ${points(threshold.score)} minimum`
			: `${detail(best)}; runner-up ${runnerUpText(runnerUp)}; gap ${points(gap)} under ${points(threshold.gap)}`;

	return { handle: evidence.handle, list: null, score: best.score, gap, reason };
}

/**
 * Classify a whole archive, leaving every decision already held aside.
 *
 * `manual` is keyed by handle and holds only the decisions the rules may not
 * replace. Every one of them is reported in `preserved`, including the ones
 * whose author no longer appears in the archive: a count that hid a manual
 * decision would make the person's own answer look like it had been dropped.
 * Nothing here writes, which is what keeps a dry run a dry run.
 */
export function classify(
	evidences: readonly Evidence[],
	rules: Rules,
	manual: ReadonlyMap<string, Preserved>,
): Classification {
	const decisions: Decision[] = [];
	const ambiguous: Ambiguous[] = [];
	const preserved: Preserved[] = [];

	for (const evidence of evidences) {
		const held = manual.get(evidence.handle);
		if (held !== undefined) {
			preserved.push(held);
			continue;
		}
		const outcome = decide(evidence, rules);
		if (outcome.list === null) ambiguous.push(outcome);
		else decisions.push(outcome);
	}

	const visited = new Set(preserved.map((entry) => entry.handle));
	for (const [handle, entry] of manual) {
		if (!visited.has(handle)) preserved.push(entry);
	}

	return { decisions, ambiguous, preserved };
}
