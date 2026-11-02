/**
 * Where a list page's rows are, in one file.
 *
 * Same contract as `Selector/Post.ts`: `inPage` is the program, its source is
 * what runs in the page, and no other file names a list selector.
 */

export type ListInPageRequest = { op: "ready" } | { op: "members" };

export type ListInPageResult = { ready: boolean; members: string[] };

function inPage(request: { op: "ready" | "members" }): unknown {
	const rows = Array.from(
		document.querySelectorAll('[data-testid="UserCell"]'),
	);
	const header = document.querySelector(
		'[data-testid="ListHeader"], [data-testid="primaryColumn"] h2',
	);
	const members = rows
		.map((row) => {
			const anchor = row.querySelector('a[href^="/"]');
			const href =
				anchor === null ? "" : (anchor.getAttribute("href") ?? "");
			return href.replace(/\//g, "");
		})
		.filter((handle) => /^[A-Za-z0-9_]{1,30}$/.test(handle));

	if (request.op === "members")
		return { ready: header !== null || rows.length > 0, members };
	return { ready: header !== null || rows.length > 0, members: [] };
}

function call(request: ListInPageRequest): string {
	return `(${inPage.toString()})(${JSON.stringify(request)})`;
}

export function expression(request: ListInPageRequest): string {
	return call(request);
}

/** A wait-for expression: the list page has rendered its header or its rows. */
export function readyExpression(): string {
	return `${call({ op: "ready" })}.ready`;
}
