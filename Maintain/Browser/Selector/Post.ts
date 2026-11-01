/**
 * Where a post's controls are, in one file.
 *
 * `inPage` never runs in Node: its source text is sent to the page, so every
 * selector, aria-label rule and metric regex lives here and nowhere else. A
 * site rename is a one-file diff.
 */

export type ControlName = "like" | "bookmark";

export type InPageRequest =
	| { op: "snapshot"; index: number; id?: string }
	| { op: "toggle"; index: number; control: ControlName; id?: string };

export type InPageControl = { present: boolean; active: boolean };

export type InPageSnapshot = {
	found: boolean;
	count: number;
	clicked: boolean;
	post?: {
		id: string;
		url: string;
		author: { handle: string; name: string; verified: boolean };
		text: string;
		postedAt: string | null;
		media: { kind: "image" | "video" | "gif" | "link"; url: string }[];
		metrics: { replies: number; reposts: number; likes: number; views: number };
	};
	controls?: Record<ControlName, InPageControl>;
};

function inPage(request: { op: "snapshot" | "toggle"; index: number; control?: string; id?: string }): unknown {
	/** "1.2K" -> 1200; "9 Likes. Like" -> 9; anything unreadable -> 0. */
	const count = (value: string | null): number => {
		if (!value) return 0;
		const match = /^([\d.]+)\s*([KMB])?/i.exec(String(value).replace(/,/g, "").trim());
		if (!match) return 0;
		const base = Number.parseFloat(match[1]);
		const suffix = (match[2] ?? "").toUpperCase();
		const factor = suffix === "K" ? 1000 : suffix === "M" ? 1000000 : suffix === "B" ? 1000000000 : 1;
		return Math.round(base * factor);
	};

	const label = (element: Element | null): string =>
		element === null ? "" : (element.getAttribute("aria-label") ?? "");

	/**
	 * One metric out of an aria-label. The action group labels all four at once
	 * ("1 reply, 1 repost, 1 like, 234 views"), so the keyword decides - with the
	 * first number as a fallback for a localized label.
	 */
	const metric = (text: string, keyword: string): number => {
		if (text === "") return 0;
		const match = new RegExp("([\\d.,]+\\s*[KMB]?)\\s*" + keyword, "i").exec(text);
		return count(match === null ? text : match[1]);
	};

	const articles = (): Element[] => Array.from(document.querySelectorAll("article"));

	/** An article by status id: the same post, read again after a reload. */
	const byId = (id: string): Element | null =>
		articles().find((candidate) =>
			Array.from(candidate.querySelectorAll('a[href*="/status/"]')).some((anchor) =>
				(anchor.getAttribute("href") ?? "").includes(`/status/${id}`),
			),
		) ?? null;

	const article = request.id !== undefined ? byId(request.id) : (articles()[request.index] ?? null);
	if (article === null) return { found: false, count: articles().length, clicked: false };

	/** State comes from `data-testid` first and the aria-label second. */
	const controls = (): Record<string, { present: boolean; active: boolean }> => {
		const like = article.querySelector('[data-testid="like"], [data-testid="unlike"]');
		const bookmark = article.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]');
		const likeLabel = label(like);
		const bookmarkLabel = label(bookmark);
		return {
			like: {
				present: like !== null,
				active:
					like !== null &&
					((like.getAttribute("data-testid") ?? "") === "unlike" ||
						/(^|\.\s*)(unlike|liked)\b/i.test(likeLabel)),
			},
			bookmark: {
				present: bookmark !== null,
				active:
					bookmark !== null &&
					((bookmark.getAttribute("data-testid") ?? "") === "removeBookmark" ||
						/remove bookmark/i.test(bookmarkLabel)),
			},
		};
	};

	const post = () => {
		const permalink =
			Array.from(article.querySelectorAll('a[href*="/status/"]'))
				.map((anchor) => anchor.getAttribute("href") ?? "")
				.find((href) => /^\/[^/?#]+\/status\/\d+$/.test(href)) ?? "";
		const idMatch = /\/status\/(\d+)/.exec(permalink);
		const id = idMatch === null ? "" : idMatch[1];

		const userBlock = article.querySelector('[data-testid="User-Name"]');
		const profileHref =
			userBlock === null
				? ""
				: (Array.from(userBlock.querySelectorAll("a[href]"))
						.map((anchor) => anchor.getAttribute("href") ?? "")
						.find((href) => /^\/[A-Za-z0-9_]{1,30}\/?$/.test(href)) ?? "");
		const handle = profileHref.replace(/\//g, "");
		const rawName = userBlock === null ? "" : (userBlock.textContent ?? "").trim();
		const name = rawName.split("@")[0].trim() || handle;
		const verified = userBlock !== null && userBlock.querySelector('[data-testid="icon-verified"]') !== null;

		const textNode = article.querySelector('[data-testid="tweetText"]');
		const text = textNode === null ? "" : (textNode.textContent ?? "").trim();

		const timeNode = article.querySelector("time[datetime]");
		const postedAt = timeNode === null ? null : timeNode.getAttribute("datetime");

		const media: { kind: string; url: string }[] = [];
		for (const image of Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img'))) {
			const url = image.getAttribute("src") ?? "";
			if (url !== "" && !url.startsWith("data:")) media.push({ kind: "image", url });
		}
		for (const video of Array.from(article.querySelectorAll("video"))) {
			const url = video.getAttribute("src") ?? video.getAttribute("poster") ?? "";
			if (url !== "") media.push({ kind: "video", url });
		}
		for (const link of Array.from(article.querySelectorAll('[data-testid="tweetText"] a[href]'))) {
			const url = link.getAttribute("href") ?? "";
			if (/^https?:\/\//i.test(url)) media.push({ kind: "link", url });
		}

		const reply = article.querySelector('[data-testid="reply"]');
		const repost = article.querySelector('[data-testid="retweet"]');
		const likeButton = article.querySelector('[data-testid="like"], [data-testid="unlike"]');
		const viewsNode = article.querySelector('[aria-label*="Views"], [aria-label*="views"]');

		return {
			id,
			url: permalink === "" ? "" : `https://x.com${permalink}`,
			author: { handle, name, verified },
			text,
			postedAt,
			media,
			metrics: {
				replies: metric(label(reply), "repl(y|ies)"),
				reposts: metric(label(repost), "reposts?"),
				likes: metric(label(likeButton), "likes?"),
				views: metric(label(viewsNode), "views?"),
			},
		};
	};

	if (request.op === "toggle") {
		const selector =
			request.control === "bookmark"
				? '[data-testid="bookmark"], [data-testid="removeBookmark"]'
				: '[data-testid="like"], [data-testid="unlike"]';
		const button = article.querySelector(selector) as HTMLElement | null;
		if (button === null) {
			return { found: true, count: articles().length, clicked: false, present: false };
		}
		button.click();
		return { found: true, count: articles().length, clicked: true, present: true };
	}

	return { found: true, count: articles().length, clicked: false, post: post(), controls: controls() };
}

/** The expression to evaluate for one request. */
export function expression(request: InPageRequest): string {
	return `(${inPage.toString()})(${JSON.stringify(request)})`;
}
