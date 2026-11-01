import { fail } from "../../Cli/Parser/Output/Failure.ts";
import type { CdpClient } from "../Cdp/Client.ts";
import { connect } from "../Cdp/Client.ts";
import { evaluate } from "../Cdp/Command/Evaluate.ts";
import type { Tab } from "../../Model/Tab/Tab.ts";

export type WaitOptions = { timeout?: number; interval?: number };

export type IdleOptions = { timeout?: number; quiet?: number };

/** One attached tab: evaluate, navigate, wait. Closed by the command that opened it. */
export type Session = {
	tab: Tab;
	client: CdpClient;
	evaluate<T>(expression: string): Promise<T>;
	navigate(url: string): Promise<boolean>;
	reload(): Promise<boolean>;
	/** True when the page made no network request for `quiet` milliseconds. */
	waitForIdle(options?: IdleOptions): Promise<boolean>;
	/** Poll a boolean expression; true when it held before the deadline. */
	waitFor(expression: string, options?: WaitOptions): Promise<boolean>;
	close(): void;
};

const sleep = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Attach to one tab.
 *
 * A tab an extension holds is refused here as well as in `Select`: attaching
 * would detach the extension's own debugger, which is the one thing this tool
 * layer must never do.
 */
export async function attach(tab: Tab, options: { timeout?: number } = {}): Promise<Session> {
	if (tab.attached) {
		throw fail("no-tab", "that tab is attached by a browser extension", { id: tab.id, url: tab.url });
	}
	if (tab.webSocketDebuggerUrl === undefined) {
		throw fail("cdp-unreachable", "the target exposes no websocket", { id: tab.id, url: tab.url });
	}
	const client = await connect(tab.webSocketDebuggerUrl, { timeout: options.timeout });

	/**
	 * Load accounting, for `navigate` and `reload`. A navigation's URL is not
	 * the signal that it finished: `/i/bookmarks` redirects to `/i/history`, so
	 * waiting for the requested prefix would always time out. A load event is
	 * the page saying it has arrived, wherever it landed.
	 */
	let loads = 0;
	let pageDomain = false;
	try {
		await client.send("Page.enable");
		client.on("Page.loadEventFired", () => {
			loads += 1;
		});
		pageDomain = true;
	} catch {
		pageDomain = false;
	}

	/**
	 * Network activity, for `waitForIdle`. A click resolves in the DOM long
	 * before the request behind it has left the browser; closing the tab in
	 * between throws that request away.
	 */
	let lastActivity = Date.now();
	const note = (params: unknown): void => {
		const id = (params as { requestId?: unknown }).requestId;
		if (typeof id === "string") lastActivity = Date.now();
	};
	try {
		await client.send("Network.enable");
		client.on("Network.requestWillBeSent", note);
		client.on("Network.loadingFinished", note);
		client.on("Network.loadingFailed", note);
	} catch {
		// No Network domain on this target: `waitForIdle` degrades to the quiet window.
	}

	const session: Session = {
		tab,
		client,
		evaluate<T>(expression: string): Promise<T> {
			return evaluate<T>(client, expression);
		},
		async navigate(url: string): Promise<boolean> {
			const before = loads;
			await client.send("Page.navigate", { url });
			if (pageDomain === true) {
				const deadline = Date.now() + 20_000;
				while (Date.now() < deadline) {
					if (loads > before) return true;
					await sleep(100);
				}
				return false;
			}
			return session.waitFor(`document.readyState === "complete"`, { timeout: 20_000, interval: 200 });
		},
		async reload(): Promise<boolean> {
			lastActivity = Date.now();
			const before = loads;
			await client.send("Page.reload", { ignoreCache: false });
			if (pageDomain === true) {
				const deadline = Date.now() + 20_000;
				while (Date.now() < deadline) {
					if (loads > before) return true;
					await sleep(100);
				}
				return false;
			}
			return session.waitFor(`document.readyState === "complete"`, { timeout: 20_000, interval: 200 });
		},
		async waitForIdle(idleOptions: IdleOptions = {}): Promise<boolean> {
			const quiet = idleOptions.quiet ?? 600;
			const deadline = Date.now() + (idleOptions.timeout ?? 8000);
			while (Date.now() < deadline) {
				if (Date.now() - lastActivity >= quiet) return true;
				await sleep(100);
			}
			return false;
		},
		async waitFor(expression: string, waitOptions: WaitOptions = {}): Promise<boolean> {
			const deadline = Date.now() + (waitOptions.timeout ?? 15_000);
			const interval = waitOptions.interval ?? 150;
			while (Date.now() < deadline) {
				try {
					if ((await evaluate<boolean>(client, `Boolean(${expression})`)) === true) return true;
				} catch {
					// A navigation destroys the execution context for a moment; poll again.
				}
				await sleep(interval);
			}
			return false;
		},
		close(): void {
			client.close();
		},
	};

	return session;
}
