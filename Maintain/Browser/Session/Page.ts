import type { Tab } from "../../Model/Tab/Tab.ts";
import { connection } from "../../Configuration/Load/Load.ts";
import type { DiscoveryOptions } from "../Target/Discovery.ts";
import { discover } from "../Target/Discovery.ts";
import { close, open } from "../Target/Lifecycle.ts";
import { select, selectHandle } from "../Target/Select.ts";
import type { Session } from "./Session.ts";
import { attach } from "./Session.ts";

export type PageContext = { session: Session; tab: Tab; href: string };

export type PageOptions = {
	/** `--tab`: a target id from `tab list`, or its index. */
	tab?: unknown;
	/** Wait until this expression is true before handing the page over. */
	ready?: string;
	timeout?: number;
	/**
	 * Close the tab again when this run opened it. A command that is not
	 * showing the person a page (`store scrape`) leaves nothing behind; a tab
	 * that was already open is never closed, because it is theirs.
	 */
	close?: boolean;
};

/**
 * Show one URL and hand the attached page to `body`.
 *
 * A tab already showing the URL is reused (nothing is navigated); otherwise a
 * tab is opened.
 */
export async function withPage<T>(
	url: string,
	options: PageOptions,
	body: (context: PageContext) => Promise<T>,
): Promise<T> {
	const endpoint: DiscoveryOptions = connection();
	const tabs = await discover(endpoint);
	let tab: Tab;
	let navigate = true;
	let opened = false;

	if (typeof options.tab === "string" && options.tab.length > 0) {
		tab = selectHandle(tabs, options.tab);
	} else {
		let existing: Tab | null = null;
		try {
			existing = select(tabs, { url }, { exact: true });
		} catch {
			existing = null;
		}
		if (existing !== null) {
			tab = existing;
			navigate = false;
		} else {
			tab = await open(url, endpoint);
			opened = true;
		}
	}

	const session = await attach(tab, endpoint);
	try {
		if (navigate === true) await session.navigate(url);
		if (options.ready !== undefined) {
			await session.waitFor(options.ready, { timeout: options.timeout ?? 25_000 });
		}
		const href = await session.evaluate<string>("location.href").catch(() => url);
		return await body({ session, tab, href: typeof href === "string" ? href : url });
	} finally {
		session.close();
		if (opened === true && options.close === true) {
			try {
				await close(tab.id, endpoint);
			} catch {
				// The tab is already gone; nothing to clean up.
			}
		}
	}
}
