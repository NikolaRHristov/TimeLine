import { fail } from "../../CLI/Parser/Output/Failure.ts";
import type { RawTarget, Tab } from "../../Model/Tab/Tab.ts";
import { connect } from "../CDP/Client.ts";
import { discover, endpoint, getJson } from "./Discovery.ts";
import type { DiscoveryOptions } from "./Discovery.ts";

type BrowserVersion = { webSocketDebuggerUrl?: string };

/**
 * Open a background tab at `url`.
 *
 * Two rules, both learned the hard way:
 *
 * 1. A fresh tab is never attached by an extension, which makes it the safe
 *    place to drive a URL the person did not already have open.
 * 2. It must open in the BACKGROUND. `PUT /json/new` creates a tab and lets the
 *    browser bring it forward, which steals the window from whatever the person
 *    is typing into. `Target.createTarget` with `background: true` creates the
 *    tab without touching focus - that is the whole reason this function talks
 *    to the browser-level websocket instead of the HTTP endpoint.
 */
export async function open(url: string, options: DiscoveryOptions = {}): Promise<Tab> {
	const base = endpoint(options);
	const timeout = options.timeout ?? 5000;

	const version = await getJson<BrowserVersion>(`${base}/json/version`, timeout);
	if (typeof version.webSocketDebuggerUrl !== "string") {
		throw fail("cdp-unreachable", "the browser did not expose a browser websocket", { url: base });
	}

	const client = await connect(version.webSocketDebuggerUrl, { timeout });
	let targetId: string;
	try {
		const created = await client.send<{ targetId?: string }>("Target.createTarget", {
			url,
			background: true,
		});
		if (typeof created.targetId !== "string") {
			throw fail("cdp-unreachable", "Target.createTarget returned no target id", { url });
		}
		targetId = created.targetId;
	} finally {
		client.close();
	}

	// The target shows up in /json/list a moment after creation, not instantly.
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const tabs = await discover({ ...options, annotate: false });
		const found = tabs.find((tab) => tab.id === targetId);
		if (found !== undefined) return found;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw fail("no-tab", "the background tab never appeared in /json/list", { url, targetId });
}

/** Close one target; the browser answers with text, not JSON. */
export async function close(id: string, options: DiscoveryOptions = {}): Promise<void> {
	const base = endpoint(options);
	try {
		await fetch(`${base}/json/close/${id}`, { signal: AbortSignal.timeout(options.timeout ?? 5000) });
	} catch (error) {
		throw fail("cdp-unreachable", "could not close the target", {
			id,
			reason: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Focus one target.
 *
 * Only `tab focus` may call this. Everything else drives a background tab,
 * because bringing a window forward interrupts the person mid-sentence.
 */
export async function activate(id: string, options: DiscoveryOptions = {}): Promise<void> {
	const base = endpoint(options);
	let response: Response;
	try {
		response = await fetch(`${base}/json/activate/${id}`, { signal: AbortSignal.timeout(options.timeout ?? 5000) });
	} catch (error) {
		throw fail("cdp-unreachable", "could not focus the target", {
			id,
			reason: error instanceof Error ? error.message : String(error),
		});
	}
	if (!response.ok) {
		throw fail("no-tab", "the browser refused to focus that target", { id, status: response.status });
	}
}

export type { RawTarget };