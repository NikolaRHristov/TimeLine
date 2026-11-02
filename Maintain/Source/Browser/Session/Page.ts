import { connection } from "../../Configuration/Load/Load.ts";
import type { Tab } from "../../Model/Tab/Tab.ts";
import { discover, type DiscoveryOptions } from "../Target/Discovery.ts";
import { close, open } from "../Target/Lifecycle.ts";
import { select, selectHandle } from "../Target/Select.ts";
import { assertReady, type ReadinessMode } from "./Ready.ts";
import { attach, type Session } from "./Session.ts";

export type PageContext = { session: Session; tab: Tab; href: string };

export type PageOptions = {
	/** `--tab`: a target id from `tab list`, or its index. */
	tab?: unknown;
	/** Wait until this expression is true before handing the page over. */
	ready?: string;
	timeout?: number;
	/**
	 * What a readiness timeout means. `fail` (the default) refuses to hand over
	 * a page that never arrived, so no command reports on a half-rendered one;
	 * `warn` says so on stderr and continues, for a caller that can still read
	 * what did render.
	 */
	onNotReady?: ReadinessMode;
	/**
	 * Close the tab again when this run opened it. A command that is not
	 * showing the person a page (`store scrape`) leaves nothing behind; a tab
	 * that was already open is never closed, because it is theirs.
	 */
	close?: boolean;
	/**
	 * Always open a fresh BACKGROUND tab and close it afterwards. Never reuse,
	 * never navigate, never focus: a scrape must not move the person's window.
	 */
	ephemeral?: boolean;
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

	if (options.ephemeral === true) {
		// A scrape is not a page the person asked to look at: open a background
		// tab of our own and close it again, so their window never moves.
		tab = await open(url, endpoint);
		opened = true;
	} else if (typeof options.tab === "string" && options.tab.length > 0) {
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
			const timeout = options.timeout ?? 25_000;
			const ready = await session.waitFor(options.ready, { timeout });
			// `waitFor` answers a timeout with `false` and never throws; dropping
			// that answer is what let a page that never loaded run the body.
			assertReady(ready, {
				expression: options.ready,
				timeout,
				url,
				mode: options.onNotReady,
			});
		}
		const href = await session.evaluate<string>("location.href").catch(() => url);
		return await body({
			session,
			tab,
			href: typeof href === "string" ? href : url,
		});
	} finally {
		session.close();
		if (opened === true && (options.close === true || options.ephemeral === true)) {
			try {
				await close(tab.id, endpoint);
			} catch {
				// The tab is already gone; nothing to clean up.
			}
		}
	}
}
