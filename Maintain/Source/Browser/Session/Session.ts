import { fail, toFailure, type Failure } from "../../CLI/Parser/Output/Failure.ts";
import type { Tab } from "../../Model/Tab/Tab.ts";
import { connect, type CDPClient } from "../CDP/Client.ts";
import { evaluate } from "../CDP/Command/Evaluate.ts";

export type WaitOptions = { timeout?: number; interval?: number };

export type IdleOptions = { timeout?: number; quiet?: number };

/** One attached tab: evaluate, navigate, wait. Closed by the command that opened it. */
export type Session = {
	tab: Tab;
	client: CDPClient;
	evaluate<T>(expression: string): Promise<T>;
	navigate(url: string): Promise<boolean>;
	reload(): Promise<boolean>;
	/** True when the page made no network request for `quiet` milliseconds. */
	waitForIdle(options?: IdleOptions): Promise<boolean>;
	/**
	 * Poll a boolean expression; true when it held before the deadline, false
	 * when it never did. A page that cannot be asked at all throws instead.
	 */
	waitFor(expression: string, options?: WaitOptions): Promise<boolean>;
	close(): void;
};

const sleep = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * The errors Chromium raises when a navigation replaces the execution context
 * an expression was about to run in.
 *
 * This is the one case polling is right for: the frame moved on mid-call, the
 * expression is still valid, and the next attempt runs in the new context. It
 * is recognised by Chromium's own wording rather than by a code, because
 * `Runtime.evaluate` reports it as an ordinary `-32000` error - the same code
 * an invalid expression arrives with.
 */
const TRANSIENT = ["Execution context was destroyed", "Cannot find context with specified id"];

/** True when `error` is the navigation window rather than a permanent failure. */
function transient(error: unknown): boolean {
	const text = error instanceof Error ? error.message : String(error);
	return TRANSIENT.some((phrase) => text.includes(phrase));
}

/**
 * The failure a caller gets when the readiness question itself failed.
 *
 * The original code is kept - `cdp-unreachable` for a dead socket, `cdp-error`
 * for a page that threw - because those are different answers, and the detail
 * says the page was never asked, so a reader cannot mistake this for a page
 * that merely took too long.
 */
function unasked(error: unknown, expression: string): Failure {
	const failure = toFailure(error);
	return fail(
		failure.code,
		`the page could not be asked whether it was ready: ${failure.message}`,
		{
			...failure.extra,
			expression,
		},
	);
}

/**
 * Attach to one tab.
 *
 * A tab an extension holds is refused here as well as in `Select`: attaching
 * would detach the extension's own debugger, which is the one thing this tool
 * layer must never do.
 */
export async function attach(tab: Tab, options: { timeout?: number } = {}): Promise<Session> {
	if (tab.attached) {
		throw fail("no-tab", "that tab is attached by a browser extension", {
			id: tab.id,
			url: tab.url,
		});
	}
	if (tab.webSocketDebuggerUrl === undefined) {
		throw fail("cdp-unreachable", "the target exposes no websocket", {
			id: tab.id,
			url: tab.url,
		});
	}
	const client = await connect(
		tab.webSocketDebuggerUrl,
		options.timeout === undefined ? {} : { timeout: options.timeout },
	);

	return bind(client, tab);
}

/**
 * The session over an already-connected client.
 *
 * `attach` is the only production caller. A test binds a fake client, so the
 * polling rules run against a scripted protocol instead of a live tab - the
 * distinction between "not ready" and "could not ask" is exactly what a live
 * tab will not reliably reproduce.
 */
export async function bind(client: CDPClient, tab: Tab): Promise<Session> {
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
			return session.waitFor(`document.readyState === "complete"`, {
				timeout: 20_000,
				interval: 200,
			});
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
			return session.waitFor(`document.readyState === "complete"`, {
				timeout: 20_000,
				interval: 200,
			});
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
					if ((await evaluate<boolean>(client, `Boolean(${expression})`)) === true)
						return true;
				} catch (error) {
					// A navigation destroys the execution context for a moment and
					// polling again is right. Anything else means the page cannot be
					// asked at all, and reporting that as "not ready" would turn a
					// permanent cause into fifteen seconds of silence and a timeout.
					if (!transient(error)) throw unasked(error, expression);
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
