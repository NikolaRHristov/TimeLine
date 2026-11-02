import { tabsExpression } from "../../../../Browser/Selector/History.ts";
import { expression, type InPageSnapshot } from "../../../../Browser/Selector/Post.ts";
import { withPage } from "../../../../Browser/Session/Page.ts";
import { assertReady } from "../../../../Browser/Session/Ready.ts";
import type { Session } from "../../../../Browser/Session/Session.ts";
import { fail } from "../../../../CLI/Parser/Output/Failure.ts";
import type { Post } from "../../../../Model/Post/Post.ts";

export type ScrapeOptions = {
	/** `--tab`: a CDP target id, or its index in `tab list`. */
	tab?: unknown;
	/** Stop once this many distinct posts have been read. */
	limit?: number | undefined;
	/** Stop after this many scrolls in a row that produced nothing new. */
	maxIdle?: number | undefined;
	/** How long one scroll may take to produce a new id, in milliseconds. */
	wait?: number;
	/** Walk every tab the page presents - `/i/history` holds Bookmarks and Likes. */
	followTabs?: boolean;
};

export type ScrapeResult = {
	/** Every distinct post seen, in the order the page first showed it. */
	posts: Post[];
	/** The pages actually walked, after redirects. */
	pages: string[];
	rounds: number;
	stopped: "limit" | "idle";
};

const READY = 'document.querySelectorAll("article").length > 0';

const sleep = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readAll(session: Session): Promise<Post[]> {
	const state = await session.evaluate<InPageSnapshot>(expression({ op: "all" }));
	return state.posts ?? [];
}

async function idsOnPage(session: Session): Promise<string[]> {
	const state = await session.evaluate<InPageSnapshot>(expression({ op: "ids" }));
	return state.ids ?? [];
}

/**
 * After a scroll the page appends posts a moment later.
 *
 * Waiting for an id that was not there before is the only signal that the
 * scroll produced anything: the article count stays flat, because the page
 * drops the posts leaving the window at the same rate it adds new ones.
 */
async function waitForNewId(session: Session, known: Set<string>, wait: number): Promise<boolean> {
	const deadline = Date.now() + wait;
	while (Date.now() < deadline) {
		const ids = await idsOnPage(session);
		if (ids.some((id) => !known.has(id))) return true;
		await sleep(250);
	}
	return false;
}

/**
 * Walk one page until it stops growing.
 *
 * Every round reads what is in the DOM and folds it into `into` by status id,
 * so a post that scrolls out of the window and back is still one record. The
 * loop ends on the limit, or after `maxIdle` scrolls that produced no new id -
 * the ceiling is only a guard against a page that keeps producing ids forever
 * without ever reaching the limit.
 */
async function walk(
	session: Session,
	into: Map<string, Post>,
	options: { limit: number; maxIdle: number; wait: number },
): Promise<{ rounds: number; stopped: "limit" | "idle" }> {
	let idle = 0;
	let rounds = 0;
	const ceiling = options.maxIdle * 8 + Math.min(options.limit, 500) + 16;

	while (rounds < ceiling) {
		rounds += 1;
		for (const post of await readAll(session)) {
			if (post.id !== "") into.set(post.id, post);
		}
		if (into.size >= options.limit) return { rounds, stopped: "limit" };

		await session.evaluate(expression({ op: "scroll" }));
		if (await waitForNewId(session, new Set(into.keys()), options.wait)) {
			idle = 0;
			continue;
		}
		idle += 1;
		if (idle >= options.maxIdle) return { rounds, stopped: "idle" };
	}

	return { rounds, stopped: "idle" };
}

/**
 * Read every post a source shows.
 *
 * The tab is opened only when the person does not already have that page open,
 * and is closed again when this run opened it - a scrape is not a page they
 * asked to look at.
 */
export async function scrape(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
	const limit = options.limit ?? 200;
	const maxIdle = options.maxIdle ?? 3;
	const wait = options.wait ?? 3000;
	const seen = new Map<string, Post>();
	const pages: string[] = [];
	let rounds = 0;
	let stopped: "limit" | "idle" = "idle";

	// `--tab` is an explicit request to use that tab; without it, take a
	// background tab of our own so the person's window never moves.
	//
	// A scrape is the one caller that warns instead of failing: a timeline that
	// is still painting still has posts in the DOM, and reading them is the job.
	// If nothing rendered at all the run ends as `no-post` anyway, so the warning
	// is the difference between a partial answer and a lie about a full one.
	const ephemeral = options.tab === undefined;
	await withPage(
		url,
		{
			tab: options.tab,
			ready: READY,
			timeout: 25_000,
			close: true,
			ephemeral,
			onNotReady: "warn",
		},
		async (context) => {
			const queue = [context.href];
			if (options.followTabs === true) {
				const state = await context.session.evaluate<{
					tabs: { href: string }[];
				}>(tabsExpression());
				for (const tab of state.tabs ?? []) {
					if (tab.href !== "" && !queue.includes(tab.href)) queue.push(tab.href);
				}
			}

			for (let index = 0; index < queue.length; index += 1) {
				if (index > 0) {
					await context.session.navigate(queue[index]!);
					const ready = await context.session.waitFor(READY, {
						timeout: 20_000,
					});
					assertReady(ready, {
						expression: READY,
						timeout: 20_000,
						url: queue[index]!,
						mode: "warn",
					});
				}
				pages.push(queue[index]!);
				const result = await walk(context.session, seen, {
					limit,
					maxIdle,
					wait,
				});
				rounds += result.rounds;
				stopped = result.stopped;
				if (seen.size >= limit) break;
			}
		},
	);

	const posts = [...seen.values()].slice(0, limit);
	if (posts.length === 0) {
		throw fail("no-post", "the source showed no posts", { url, pages });
	}
	return { posts, pages, rounds, stopped };
}
