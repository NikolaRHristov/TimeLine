import { fail } from "../../CLI/Parser/Output/Failure.ts";
import type { RawTarget, Tab } from "../../Model/Tab/Tab.ts";
import { Tab as TabModel } from "../../Model/Tab/Tab.ts";
import { inspect } from "./Extension.ts";

export type DiscoveryOptions = {
	host?: string;
	port?: number;
	timeout?: number;
	/** Skip the extension probe (no `active`/`attached` flags). Default false. */
	annotate?: boolean;
};

/** The browser's HTTP endpoint - the only thing needed before a websocket exists. */
export function endpoint(options: DiscoveryOptions = {}): string {
	const host = options.host ?? "127.0.0.1";
	const port = options.port ?? 9222;
	return `http://${host}:${port}`;
}

export async function getJson<T>(url: string, timeout = 5000, method = "GET"): Promise<T> {
	let response: Response;
	try {
		response = await fetch(url, { method, signal: AbortSignal.timeout(timeout) });
	} catch (error) {
		throw fail("cdp-unreachable", `GET ${url} failed`, {
			url,
			reason: error instanceof Error ? error.message : String(error),
		});
	}
	if (!response.ok) {
		throw fail("cdp-unreachable", `GET ${url} answered ${response.status}`, { url, status: response.status });
	}
	try {
		return (await response.json()) as T;
	} catch (error) {
		throw fail("cdp-unreachable", `GET ${url} did not answer JSON`, {
			url,
			reason: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Every page target the CLI may drive.
 *
 * Extension pages are dropped here, once, so no later layer has to remember
 * that rule. `active` and `attached` come from the browser's extensions.
 */
export async function discover(options: DiscoveryOptions = {}): Promise<Tab[]> {
	const base = endpoint(options);
	const raw = await getJson<RawTarget[]>(`${base}/json/list`, options.timeout ?? 5000);
	if (!Array.isArray(raw)) {
		throw fail("cdp-unreachable", "GET /json/list did not return a list", { url: base });
	}

	const tabs: Tab[] = [];
	for (const target of raw) {
		const tab = TabModel.fromTarget(target);
		if (tab !== null) tabs.push(tab);
	}
	if (options.annotate === false) return tabs;

	const view = await inspect(raw, { timeout: options.timeout ?? 3000 });
	for (const tab of tabs) {
		tab.active = view.active === tab.id;
		tab.attached = view.attached.has(tab.id);
	}
	return tabs;
}