/**
 * The history page's tab strip, in one file.
 *
 * `/i/history` is a container, not a feed: it presents `Bookmarks` and `Likes`
 * as tabs, and `/i/bookmarks` simply redirects here with the first one
 * selected. Reading the tabs' own `href`s is enough to walk them - clicking a
 * tab is a navigation this tool does not need to perform.
 */

export type InPageTab = { text: string; href: string; selected: boolean };

export type InPageHistory = { heading: string | null; tabs: InPageTab[] };

function inPage(): unknown {
	const absolute = (href: string): string => {
		try {
			return new URL(href, location.origin).toString();
		} catch {
			return "";
		}
	};

	const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map((node) => {
		const anchor = node.tagName === "A" ? node : node.querySelector("a[href]");
		const href = anchor === null ? "" : (anchor.getAttribute("href") ?? "");
		return {
			text: (node.textContent ?? "").trim(),
			href: href === "" ? "" : absolute(href),
			selected: node.getAttribute("aria-selected") === "true",
		};
	});

	const heading = document.querySelector('[data-testid="primaryColumn"] h2, [data-testid="primaryColumn"] h1');

	return {
		heading: heading === null ? null : (heading.textContent ?? "").trim(),
		tabs: tabs.filter((tab) => tab.href !== ""),
	};
}

/** The expression that reads the page's tab strip. */
export function tabsExpression(): string {
	return `(${inPage.toString()})()`;
}
