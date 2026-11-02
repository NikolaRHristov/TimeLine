import { fail } from "../../Cli/Parser/Output/Failure.ts";
import type { Values } from "../../Cli/Parser/Parser.ts";
import type { Post } from "../../Model/Post/Post.ts";
import { Post as PostModel } from "../../Model/Post/Post.ts";
import type { Tab } from "../../Model/Tab/Tab.ts";
import { connection } from "../../Configuration/Load/Load.ts";
import type { DiscoveryOptions } from "../Target/Discovery.ts";
import { discover } from "../Target/Discovery.ts";
import { close, open } from "../Target/Lifecycle.ts";
import { select, selectHandle } from "../Target/Select.ts";
import type { ControlName, InPageControl, InPageSnapshot } from "../Selector/Post.ts";
import { expression } from "../Selector/Post.ts";
import type { Session } from "./Session.ts";
import { attach } from "./Session.ts";

export type Controls = Record<ControlName, InPageControl>;

export type PostContext = {
	session: Session;
	tab: Tab;
	post: Post;
	controls: Controls;
	index: number;
	/** True when this run opened the tab and will close it again. */
	temporary: boolean;
};

const sleep = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function snapshot(session: Session, index: number, id?: string): Promise<InPageSnapshot> {
	return session.evaluate<InPageSnapshot>(
		id === undefined
			? expression({ op: "snapshot", index })
			: expression({ op: "snapshot", index, id }),
	);
}

function controlOf(state: InPageSnapshot, control: ControlName): InPageControl | undefined {
	if (state.controls === undefined) return undefined;
	return state.controls[control];
}

/** Poll until the control reads the wanted state; the page flips it before the request lands. */
async function settle(session: Session, index: number, control: ControlName, want: boolean): Promise<boolean> {
	const deadline = Date.now() + 6000;
	while (Date.now() < deadline) {
		const state = await snapshot(session, index);
		const entry = controlOf(state, control);
		if (entry !== undefined && entry.active === want) return true;
		await sleep(200);
	}
	return false;
}

/**
 * Read the state back from the server.
 *
 * A temporary tab is closed moments after the click, so the DOM's optimistic
 * flip is not evidence that the change was stored: reload and look again. A
 * mismatch gets exactly one more click on the reloaded page.
 */
async function persisted(
	context: PostContext,
	control: ControlName,
	want: boolean,
): Promise<boolean | null> {
	let observed: boolean | null = null;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await context.session.waitForIdle({ quiet: 600, timeout: 8000 });
		const reloaded = await context.session.reload();
		if (reloaded !== true) return observed;
		await context.session.waitFor('document.querySelectorAll("article").length > 0', { timeout: 20_000 });
		const state = await snapshot(context.session, context.index, context.post.id);
		const entry = controlOf(state, control);
		if (entry === undefined) return observed;
		observed = entry.active;
		if (entry.active === want) return observed;
		if (attempt === 0) {
			await context.session.evaluate(
				expression({ op: "toggle", index: context.index, control, id: context.post.id }),
			);
		}
	}
	return observed;
}

/**
 * Flip one control, but only when it is not already in the wanted state.
 *
 * The state is read before clicking, so `like` twice reports `was:true` the
 * second time instead of toggling the post back off.
 */
export async function toggle(
	context: PostContext,
	control: ControlName,
	action: "add" | "remove",
): Promise<{ was: boolean; now: boolean }> {
	const was = context.controls[control].active;
	const want = action === "add";
	if (was === want) return { was, now: was };

	const clicked = await context.session.evaluate<InPageSnapshot>(
		expression({ op: "toggle", index: context.index, control }),
	);
	if (clicked.found !== true) {
		throw fail("no-post", `no post at index ${context.index}`, { count: clicked.count });
	}
	if (clicked.clicked !== true) {
		throw fail("no-post", `the ${control} control is not on this post`, { id: context.post.id });
	}

	await settle(context.session, context.index, control, want);

	const after = await snapshot(context.session, context.index, context.post.id);
	const state = controlOf(after, control);
	let now = state === undefined ? want : state.active;

	if (context.temporary === true) {
		const verified = await persisted(context, control, want);
		if (verified !== null) now = verified;
	} else {
		await context.session.waitForIdle({ quiet: 600, timeout: 5000 });
	}

	return { was, now };
}

/**
 * Resolve one post, hand it to `body`, then clean up.
 *
 * `--url` reuses a tab already showing that permalink and otherwise opens a
 * temporary one that is closed afterwards - the person's own tabs are never
 * navigated away. `--tab`/`--index` drive a tab they already have.
 */
export async function withPost<T>(values: Values, body: (context: PostContext) => Promise<T>): Promise<T> {
	const endpoint: DiscoveryOptions = connection();
	const index = typeof values["index"] === "number" ? values["index"] : 0;
	let tab: Tab | null = null;
	let temporary = false;
	let session: Session | null = null;

	try {
		if (typeof values["url"] === "string" && values["url"].length > 0) {
			if (PostModel.idFromHref(values["url"]) === null) {
				throw fail("usage", "--url is not a post permalink", { url: values["url"] });
			}
			const tabs = await discover(endpoint);
			let existing: Tab | null = null;
			try {
				existing = select(tabs, { url: values["url"] }, { exact: true });
			} catch {
				existing = null;
			}
			if (existing !== null) {
				tab = existing;
			} else {
				tab = await open(values["url"], endpoint);
				temporary = true;
			}
		} else if (typeof values["tab"] === "string" && values["tab"].length > 0) {
			const tabs = await discover(endpoint);
			tab = selectHandle(tabs, values["tab"]);
		} else {
			throw fail("usage", "give --url, or --tab with --index");
		}

		session = await attach(tab, endpoint);
		const ready = await session.waitFor('document.querySelectorAll("article").length > 0', {
			timeout: 25_000,
		});
		if (ready !== true) {
			throw fail("no-post", "the page showed no posts", { tab: tab.id, url: tab.url });
		}

		const state = await snapshot(session, index);
		if (state.found !== true || state.post === undefined || state.controls === undefined) {
			throw fail("no-post", `no post at index ${index}`, {
				count: state.count,
				tab: tab.id,
				url: tab.url,
			});
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
