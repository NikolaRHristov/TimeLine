import { fail } from "../../Cli/Parser/Output/Failure.ts";
import type { Tab } from "../../Model/Tab/Tab.ts";
import { Tab as TabModel } from "../../Model/Tab/Tab.ts";

export type Criteria = { id?: string; url?: string; title?: string };

export type SelectOptions = {
	/** Allow a tab an extension holds. Default false - those are never driven. */
	includeAttached?: boolean;
	/** Only accept an exact URL match, never a prefix. Default false. */
	exact?: boolean;
};

/** What an error reports about a tab it could not use. */
export function summarize(tab: Tab): Record<string, unknown> {
	return { id: tab.id, url: tab.url, title: tab.title, active: tab.active, attached: tab.attached };
}

/**
 * Pick one tab: exact id, then exact url, then url prefix, then title substring.
 *
 * Tabs an extension currently holds are filtered out before matching, so an
 * attached tab is skipped and the next candidate wins - attaching to it would
 * detach the extension. When nothing is left, the failure lists every tab that
 * was seen, so the caller can retarget without a second query.
 */
export function select(tabs: readonly Tab[], criteria: Criteria, options: SelectOptions = {}): Tab {
	const seen = tabs.map(summarize);
	const eligible =
		options.includeAttached === true ? [...tabs] : tabs.filter((tab) => tab.attached === false);

	if (criteria.id !== undefined) {
		const match = eligible.find((tab) => tab.id === criteria.id);
		if (match !== undefined) return match;
		const attached = tabs.find((tab) => tab.id === criteria.id);
		throw fail(
			"no-tab",
			attached !== undefined ? "that tab is attached by a browser extension" : "no tab has that id",
			{ id: criteria.id, candidates: seen },
		);
	}

	if (criteria.url !== undefined) {
		const key = TabModel.key(criteria.url);
		const exact = eligible.find((tab) => TabModel.key(tab.url) === key);
		if (exact !== undefined) return exact;
		if (options.exact !== true) {
			const prefixed = eligible.filter((tab) => {
				const candidate = TabModel.key(tab.url);
				return candidate.startsWith(key) || key.startsWith(candidate);
			});
			if (prefixed.length === 1) return prefixed[0];
			if (prefixed.length > 1) {
				throw fail("no-tab", "the url prefix matched more than one tab", {
					url: criteria.url,
					matches: prefixed.map(summarize),
					candidates: seen,
				});
			}
		}
		const attached = tabs.find((tab) => TabModel.key(tab.url) === key);
		throw fail(
			"no-tab",
			attached !== undefined ? "the matching tab is attached by a browser extension" : "no tab matched the url",
			{ url: criteria.url, candidates: seen },
		);
	}

	if (criteria.title !== undefined) {
		const needle = criteria.title.toLowerCase();
		const match = eligible.find((tab) => tab.title.toLowerCase().includes(needle));
		if (match !== undefined) return match;
		throw fail("no-tab", "no tab matched the title", { title: criteria.title, candidates: seen });
	}

	throw fail("no-tab", "no selection criteria given", { candidates: seen });
}

/** `--tab` takes a target id from `tab list`, or a zero-based index into it. */
export function selectHandle(tabs: readonly Tab[], handle: string, options: SelectOptions = {}): Tab {
	if (/^\d+$/.test(handle)) {
		const eligible =
			options.includeAttached === true ? [...tabs] : tabs.filter((tab) => tab.attached === false);
		const index = Number(handle);
		const match = eligible[index];
		if (match === undefined) {
			throw fail("no-tab", `no tab at index ${index}`, {
				index,
				count: eligible.length,
				candidates: tabs.map(summarize),
			});
		}
		return match;
	}
	return select(tabs, { id: handle }, options);
}
