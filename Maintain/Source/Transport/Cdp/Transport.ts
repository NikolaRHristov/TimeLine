import { execute, withListMember } from "../../Browser/Session/ListMember.ts";
import { withPage, type PageOptions } from "../../Browser/Session/Page.ts";
import { readyExpression } from "../../Browser/Selector/List.ts";
import { scrape as scrapePage } from "../../Browser/Session/Scrape.ts";
import { attach } from "../../Browser/Session/Session.ts";
import { discover, type DiscoveryOptions } from "../../Browser/Target/Discovery.ts";
import { activate } from "../../Browser/Target/Lifecycle.ts";
import { select } from "../../Browser/Target/Select.ts";
import { fail } from "../../Cli/Parser/Output/Failure.ts";
import { connection, load, requireList } from "../../Configuration/Load/Load.ts";
import { handle as normalizeHandle } from "../../Model/List/Member.ts";
import type {
	PageHandle,
	PageReadiness,
	PageRequest,
	Transport,
} from "../Transport.ts";
import { flip, read } from "./Post.ts";

/** The two readiness names, as the expressions they stand for. */
function readiness(name: PageReadiness | undefined): string | undefined {
	if (name === undefined) return undefined;
	return name === "list"
		? readyExpression()
		: 'document.querySelectorAll("article").length > 0';
}

/**
 * The browser transport.
 *
 * Every method is a thin delegation to `Browser/`, which is where the CDP
 * client, the selectors and the session live. This file is the only place that
 * knows both halves, and it is what a command is allowed to see.
 */
export function cdp(): Transport {
	const endpoint = (): DiscoveryOptions => connection();

	return {
		name: "cdp",
		source: "live",
		mutable: true,
		supports: () => true,

		tabs() {
			return discover(endpoint());
		},

		async focus(id) {
			const tab = select(await discover(endpoint()), { id });
			await activate(tab.id, endpoint());
			return { focused: true, id: tab.id };
		},

		/**
		 * Navigate and detach. The tab is closed again when this call opened it:
		 * a navigation nobody asked to look at is not a page to leave behind.
		 */
		async navigate(url, tab) {
			return withPage(
				url,
				{ tab, ephemeral: tab === undefined, close: true },
				async (context) => ({ url: context.href }),
			);
		},

		async evaluate<T>(expression: string, tab?: string): Promise<T> {
			if (tab === undefined || tab.length === 0) {
				throw fail("no-tab", "evaluate needs a tab id", { expression });
			}
			const target = select(await discover(endpoint()), { id: tab });
			const session = await attach(target, endpoint());
			try {
				return await session.evaluate<T>(expression);
			} finally {
				session.close();
			}
		},

		page<T>(
			url: string,
			request: PageRequest,
			body: (page: PageHandle) => Promise<T>,
		): Promise<T> {
			const options: PageOptions = {};
			if (request.tab !== undefined) options.tab = request.tab;
			const expression = readiness(request.ready);
			if (expression !== undefined) options.ready = expression;
			if (request.timeout !== undefined) options.timeout = request.timeout;
			if (request.onNotReady !== undefined) options.onNotReady = request.onNotReady;
			return withPage(url, options, async (context) =>
				body({
					tab: context.tab.id,
					url: context.href,
					evaluate<TResult>(value: string): Promise<TResult> {
						return context.session.evaluate<TResult>(value);
					},
				}),
			);
		},

		post(target) {
			return read(target);
		},

		setLike(target, value, options) {
			return flip(target, "like", value, options);
		},

		setBookmark(target, value, options) {
			return flip(target, "bookmark", value, options);
		},

		async listMember(slug, handle, options = {}) {
			const list = requireList(load(), slug);
			const normalized = normalizeHandle(handle);
			if (normalized === null) {
				throw fail("usage", `not a handle: ${handle}`, {
					handle,
					expected: "letters, digits and underscore, 15 at most",
				});
			}
			return withListMember(normalized, async ({ surface, url }) => {
				const report = await execute(surface, {
					handle: normalized,
					name: list.name,
					apply: options.apply === true,
				});
				return { ...report, url };
			});
		},

		scrape(url, options = {}) {
			return scrapePage(url, options);
		},
	};
}
