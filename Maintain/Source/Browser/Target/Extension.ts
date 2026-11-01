import { connect } from "../Cdp/Client.ts";
import { evaluate } from "../Cdp/Command/Evaluate.ts";
import type { RawTarget } from "../../Model/Tab/Tab.ts";

/**
 * What the browser's own extensions know about targets.
 *
 * `attached` is the set of page targets a browser extension currently holds
 * `chrome.debugger` on. Driving one of those over CDP would detach the
 * extension, so they are never selected. `active` is the focused tab.
 */
export type ExtensionView = {
	attached: Set<string>;
	active: string | null;
};

type Probe = {
	activeTabId: number | null;
	attached: string[];
	tabMap: { id: string; tabId: number }[];
};

const PROBE = `(async () => {
	if (typeof chrome === "undefined") return null;
	const out = { activeTabId: null, attached: [], tabMap: [] };
	try {
		if (chrome.tabs && chrome.tabs.query) {
			const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
			if (tabs.length > 0 && typeof tabs[0].id === "number") out.activeTabId = tabs[0].id;
		}
	} catch (error) {}
	try {
		if (chrome.debugger && chrome.debugger.getTargets) {
			const targets = await chrome.debugger.getTargets();
			for (const target of targets) {
				if (target.type !== "page") continue;
				if (typeof target.tabId === "number") out.tabMap.push({ id: target.id, tabId: target.tabId });
				if (target.attached === true) out.attached.push(target.id);
			}
		}
	} catch (error) {}
	return out;
})()`;

/** Extension workers are the only place `chrome.*` is callable. */
function workers(rawTargets: readonly RawTarget[]): { id: string; url: string; webSocketDebuggerUrl: string }[] {
	const found: { id: string; url: string; webSocketDebuggerUrl: string }[] = [];
	for (const target of rawTargets) {
		const url = typeof target.url === "string" ? target.url : "";
		const id = typeof target.id === "string" ? target.id : "";
		const socket = typeof target.webSocketDebuggerUrl === "string" ? target.webSocketDebuggerUrl : "";
		if (!url.startsWith("chrome-extension://")) continue;
		if (target.type !== "service_worker" && target.type !== "background_page") continue;
		if (id === "" || socket === "") continue;
		found.push({ id, url, webSocketDebuggerUrl: socket });
	}
	return found;
}

/**
 * Ask every extension worker what it can see, best effort.
 *
 * An extension without the `debugger` permission still answers the active-tab
 * question; one without `tabs` still answers the attached one. A worker that
 * fails to answer is skipped, never fatal - the CLI degrades to "nothing is
 * attached" and says so on stderr.
 */
export async function inspect(
	rawTargets: readonly RawTarget[],
	options: { timeout?: number } = {},
): Promise<ExtensionView> {
	const view: ExtensionView = { attached: new Set(), active: null };
	const tabMap = new Map<number, string>();
	let activeTabId: number | null = null;
	let answered = 0;
	let failed = 0;

	for (const worker of workers(rawTargets)) {
		let client: Awaited<ReturnType<typeof connect>> | null = null;
		try {
			client = await connect(worker.webSocketDebuggerUrl, { timeout: options.timeout ?? 3000 });
			const probe = await evaluate<Probe | null>(client, PROBE);
			if (probe === null) continue;
			answered += 1;
			for (const id of probe.attached) view.attached.add(id);
			for (const entry of probe.tabMap) tabMap.set(entry.tabId, entry.id);
			if (activeTabId === null && probe.activeTabId !== null) activeTabId = probe.activeTabId;
		} catch {
			failed += 1;
		} finally {
			client?.close();
		}
	}

	if (answered === 0 && failed > 0) {
		process.stderr.write("maintain: no extension answered the target probe; assuming nothing is attached\n");
	}
	if (activeTabId !== null) view.active = tabMap.get(activeTabId) ?? null;
	return view;
}
