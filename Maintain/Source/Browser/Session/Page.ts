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
 * The browser operations one page run needs.
 *
 * A test supplies its own: the thing worth proving about this function is what
 * its cleanup does when `attach` fails, and a live tab cannot be made to fail
 * on request without leaving one behind.
 */
export type PageBrowser = {
	discover(options: DiscoveryOptions): Promise<Tab[]>;
	open(url: string, options: DiscoveryOptions): Promise<Tab>;
	attach(tab: Tab, options: DiscoveryOptions): Promise<Session>;
	close(id: string, options: DiscoveryOptions): Promise<void>;
};

/** The real browser, named so `withPage` can take a stand-in instead. */
export const Browser: PageBrowser = { discover, open, attach, close };

/** What went wrong, in the few words a warning line can carry. */
function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

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
	browser: PageBrowser = Browser,
): Promise<T> {
	const endpoint: DiscoveryOptions = connection();
	const tabs = await browser.discover(endpoint);
	let tab: Tab;
	let navigate = true;
	let opened = false;
	let session: Session | null = null;

	if (options.ephemeral === true) {
		// A scrape is not a page the person asked to look at: open a background
		// tab of our own and close it again, so their window never moves.
		tab = await browser.open(url, endpoint);
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
			tab = await browser.open(url, endpoint);
			opened = true;
		}
	}

	// `attach` belongs inside this `try`, not before it: it runs after the tab
	// may already have been opened, so a rejected attach has to reach the same
	// cleanup a failure in the body does. Outside it, the one failure that
	// leaves a tab with nothing attached to it was also the one failure that
	// skipped cleanup.
	try {
		session = await browser.attach(tab, endpoint);
		if (navigate === true) await session.navigate(url);
		if (options.ready !== undefined) {
			const timeout = options.timeout ?? 25_000;
			const ready = await session.waitFor(options.ready, { timeout });
			// `waitFor` answers a timeout with `false`; dropping that answer is
			// what let a page that never loaded run the body. A page it could not
			// ask at all throws instead, so that arrives here with its cause and
			// never as a `page-not-ready` about a page nobody read.
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
		session?.close();
		// A tab this run opened is closed when the caller asked for it - and
		// also when no session ever attached to it, because an unattached tab is
		// one no later layer can drive or describe. Leaving that one open is the
		// leak, not the courtesy of keeping a page the person did not ask for.
		const orphaned = session === null;
		if (opened === true && (options.close === true || options.ephemeral === true || orphaned)) {
			try {
				await browser.close(tab.id, endpoint);
			} catch (error) {
				// Cleanup never throws: the run's own failure is the one worth
				// reporting. The tab is named so it can be closed by hand, and the
				// reason is kept so a silent leak is not mistaken for a clean exit.
				process.stderr.write(
					`maintain: the tab this run opened (${tab.id}) could not be closed: ${reason(error)}\n`,
				);
			}
		}
	}
}
