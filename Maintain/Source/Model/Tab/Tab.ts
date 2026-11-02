/** One page target, as the browser reports it over `/json/list`. */
export type Tab = {
	id: string;
	title: string;
	url: string;
	/** True when this is the tab the person is looking at right now. */
	active: boolean;
	/** True when a browser extension holds `chrome.debugger` on this tab. */
	attached: boolean;
	webSocketDebuggerUrl?: string;
};

/** The shape `/json/list` returns; only the fields this CLI trusts are read. */
export type RawTarget = {
	id?: unknown;
	title?: unknown;
	url?: unknown;
	type?: unknown;
	webSocketDebuggerUrl?: unknown;
};

export const Tab = {
	/** Keep pages with a real id; drop extension pages - they are never driven. */
	fromTarget(raw: RawTarget): Tab | null {
		if (raw.type !== "page") return null;
		if (typeof raw.id !== "string" || raw.id.length === 0) return null;
		const url = typeof raw.url === "string" ? raw.url : "";
		if (url.startsWith("chrome-extension://")) return null;
		const tab: Tab = {
			id: raw.id,
			title: typeof raw.title === "string" ? raw.title : "",
			url,
			active: false,
			attached: false,
		};
		if (typeof raw.webSocketDebuggerUrl === "string") {
			tab.webSocketDebuggerUrl = raw.webSocketDebuggerUrl;
		}
		return tab;
	},

	/** What URL matching compares: no query, no hash, no trailing slash. */
	key(url: string): string {
		const bare = url.split("#")[0]!.split("?")[0]!;
		return bare.endsWith("/") ? bare.slice(0, -1) : bare;
	},

	/** The four fields a tab is allowed to print. */
	summary(tab: Tab): { id: string; title: string; url: string; active: boolean } {
		return { id: tab.id, title: tab.title, url: tab.url, active: tab.active };
	},
};
