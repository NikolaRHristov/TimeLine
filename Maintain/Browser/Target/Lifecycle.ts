import { fail } from "../../Cli/Parser/Output/Failure.ts";
import type { RawTarget, Tab } from "../../Model/Tab/Tab.ts";
import { Tab as TabModel } from "../../Model/Tab/Tab.ts";
import { endpoint, getJson } from "./Discovery.ts";
import type { DiscoveryOptions } from "./Discovery.ts";

/**
 * Open a new tab at `url`.
 *
 * A fresh tab is never attached by an extension, which is what makes it the
 * safe place to drive a URL the person did not already have open.
 */
export async function open(url: string, options: DiscoveryOptions = {}): Promise<Tab> {
	const base = endpoint(options);
	const raw = await getJson<RawTarget>(`${base}/json/new?${encodeURIComponent(url)}`, options.timeout ?? 5000, "PUT");
	const tab = TabModel.fromTarget(raw);
	if (tab === null) {
		throw fail("cdp-unreachable", "the browser did not open a page target", { url });
	}
	return tab;
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

/** Focus one target. */
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
