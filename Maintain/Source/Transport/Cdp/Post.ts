import type { ControlName } from "../../Browser/Selector/Post.ts";
import { snapshot, toggle, type PostContext } from "../../Browser/Session/Post.ts";
import { attach, type Session } from "../../Browser/Session/Session.ts";
import { discover, type DiscoveryOptions } from "../../Browser/Target/Discovery.ts";
import { close, open } from "../../Browser/Target/Lifecycle.ts";
import { select, selectHandle } from "../../Browser/Target/Select.ts";
import { fail } from "../../CLI/Parser/Output/Failure.ts";
import { connection } from "../../Configuration/Load/Load.ts";
import { Post as PostModel, type Post } from "../../Model/Post/Post.ts";
import type { Tab } from "../../Model/Tab/Tab.ts";
import type { ControlOutcome, PostTarget, WriteOptions } from "../Transport.ts";

/** A status id is digits; anything else is not a post and never becomes a URL. */
const STATUS_ID = /^\d{1,32}$/;

/** `/i/status/<id>` is the permalink that needs no handle; it redirects to the canonical one. */
function permalink(id: string): string {
	return `https://x.com/i/status/${id}`;
}

/**
 * Resolve one post, hand it to `body`, then clean up.
 *
 * `--url` reuses a tab already showing that permalink and otherwise opens a
 * temporary one that is closed afterwards - the person's own tabs are never
 * navigated away. `--tab`/`--index` drive a tab they already have. `--id`
 * reuses a tab already showing that status and otherwise opens its permalink,
 * which is the only form the archive can answer at all.
 */
export async function withTarget<T>(
	target: PostTarget,
	body: (context: PostContext) => Promise<T>,
): Promise<T> {
	const endpoint: DiscoveryOptions = connection();
	const index = "index" in target ? target.index : 0;
	const wanted = "id" in target ? target.id : undefined;
	let tab: Tab | null = null;
	let temporary = false;
	let session: Session | null = null;

	try {
		if ("url" in target) {
			if (PostModel.idFromHref(target.url) === null) {
				throw fail("usage", "--url is not a post permalink", {
					url: target.url,
				});
			}
			const tabs = await discover(endpoint);
			let existing: Tab | null = null;
			try {
				existing = select(tabs, { url: target.url }, { exact: true });
			} catch {
				existing = null;
			}
			if (existing !== null) {
				tab = existing;
			} else {
				tab = await open(target.url, endpoint);
				temporary = true;
			}
		} else if ("tab" in target) {
			const tabs = await discover(endpoint);
			tab = selectHandle(tabs, target.tab);
		} else {
			if (!STATUS_ID.test(target.id)) {
				throw fail("usage", "--id is not a status id", { id: target.id });
			}
			const tabs = await discover(endpoint);
			// A tab already showing the post is reused: it is the person's own
			// view of it, and nothing is navigated.
			const existing = tabs.find(
				(candidate) =>
					candidate.attached === false &&
					PostModel.idFromHref(candidate.url) === target.id,
			);
			if (existing !== undefined) {
				tab = existing;
			} else {
				tab = await open(permalink(target.id), endpoint);
				temporary = true;
			}
		}

		session = await attach(tab, endpoint);
		const ready = await session.waitFor('document.querySelectorAll("article").length > 0', {
			timeout: 25_000,
		});
		if (ready !== true) {
			throw fail("no-post", "the page showed no posts", {
				tab: tab.id,
				url: tab.url,
			});
		}

		const state = await snapshot(session, index, wanted);
		if (state.found !== true || state.post === undefined || state.controls === undefined) {
			throw fail(
				"no-post",
				wanted === undefined ? `no post at index ${index}` : "no post with that id",
				{
					...(wanted === undefined ? {} : { id: wanted }),
					count: state.count,
					tab: tab.id,
					url: tab.url,
				},
			);
		}

		return await body({
			session,
			tab,
			post: state.post,
			controls: state.controls,
			index,
			temporary,
		});
	} finally {
		session?.close();
		if (temporary === true && tab !== null) {
			try {
				await close(tab.id, endpoint);
			} catch {
				// The tab is already gone; nothing to clean up.
			}
		}
	}
}

/** One post, read from the page. */
export function read(target: PostTarget): Promise<Post> {
	return withTarget(target, async (context) => context.post);
}

/**
 * Flip one control, but only when it is not already in the wanted state.
 *
 * A dry run stops after the read, so the answer is the page's own state and
 * nothing has been clicked.
 */
export function flip(
	target: PostTarget,
	control: ControlName,
	value: boolean,
	options: WriteOptions = {},
): Promise<ControlOutcome> {
	return withTarget(target, async (context) => {
		const post = { id: context.post.id, url: context.post.url };
		if (options.dryRun === true) {
			const active = context.controls[control].active;
			return { was: active, now: active, post };
		}
		const outcome = await toggle(context, control, value ? "add" : "remove");
		return { was: outcome.was, now: outcome.now, post };
	});
}
