import type { ListSlug } from "../Model/List/List.ts";
import type { MemberReport } from "../Model/List/Member.ts";
import type { Post } from "../Model/Post/Post.ts";
import type { ScrapeOptions, ScrapeResult } from "../Model/Scrape/Scrape.ts";
import type { Tab } from "../Model/Tab/Tab.ts";

/** The two transports this tree has. A third is a value here and one factory. */
export type TransportName = "cdp" | "view";

/** Where a post's fields came from: the page itself, or the shadow archive. */
export type PostSource = "live" | "shadow";

/**
 * What a command needs from a transport.
 *
 * Declared on the command, never inferred from which method it happens to
 * call: the refusal has to land before the body runs, and a body that reads
 * its way to a write cannot be refused in time.
 *
 * - `read` - answers `post`. Both transports can.
 * - `write` - changes the live site. `view` refuses with `read-only-transport`.
 * - `browser` - lists, focuses, navigates, scrapes. `view` refuses with
 *   `unsupported-transport`, because there is no socket behind it at all.
 *
 * A command that declares nothing is filesystem-only and never resolves a
 * transport, which is what keeps `store status` working with the browser shut.
 */
export type Requirement = "read" | "write" | "browser";

/**
 * How a command addresses one post.
 *
 * Three forms, because the CLI already had two of them and the archive needs
 * the third. `url` reuses a tab already showing that permalink and otherwise
 * opens one; `tab`/`index` drives a tab the person already has; `id` looks for
 * a tab showing that status and otherwise opens the permalink.
 */
export type PostTarget =
	| { id: string }
	| { url: string }
	| { tab: string; index: number };

/** `dryRun` resolves the post and reports its state without touching it. */
export type WriteOptions = { dryRun?: boolean };

/** What one control flip answers: before, after, and which post it was. */
export type ControlOutcome = {
	was: boolean;
	now: boolean;
	post: { id: string; url: string };
};

/**
 * What a page must have painted before the body may run.
 *
 * A name, not an expression: a selector string in a command is the browser
 * leaking through the seam, and a site rename would then be a diff in every
 * command instead of one file.
 */
export type PageReadiness = "articles" | "list";

export type PageRequest = {
	/** `--tab`: a target id from `tab list`, or its index. */
	tab?: unknown;
	ready?: PageReadiness;
	timeout?: number;
	/** `fail` (the default) refuses a page that never arrived; `warn` continues. */
	onNotReady?: "fail" | "warn";
};

/** The page a command's body is handed: where it landed, and a way to read it. */
export type PageHandle = {
	tab: string;
	url: string;
	evaluate<T>(expression: string): Promise<T>;
};

export type ListMemberOptions = { apply?: boolean };

/** The membership report plus the profile URL it was read from. */
export type ListMemberResult = MemberReport & { url: string };

/**
 * The seam every command speaks through.
 *
 * `cdp` is the only transport allowed to mutate; `view` answers from the
 * shadow store with the same shapes. A command receives one of these and never
 * imports an implementation, so adding a third transport changes this file and
 * `Select.ts` and nothing else.
 */
export interface Transport {
	readonly name: TransportName;
	/** Where a post came from - printed by `post extract`, never branched on. */
	readonly source: PostSource;
	readonly mutable: boolean;
	/** Whether this transport can satisfy a requirement at all. */
	supports(requirement: Requirement): boolean;

	tabs(): Promise<Tab[]>;
	focus(id: string): Promise<{ focused: boolean; id: string }>;
	navigate(url: string, tab?: string): Promise<{ url: string }>;
	evaluate<T>(expression: string, tab?: string): Promise<T>;
	/** Open a URL, wait for it, hand it to `body`, and clean up. */
	page<T>(
		url: string,
		request: PageRequest,
		body: (page: PageHandle) => Promise<T>,
	): Promise<T>;

	post(target: PostTarget): Promise<Post>;
	setLike(
		target: PostTarget,
		value: boolean,
		options?: WriteOptions,
	): Promise<ControlOutcome>;
	setBookmark(
		target: PostTarget,
		value: boolean,
		options?: WriteOptions,
	): Promise<ControlOutcome>;
	listMember(
		slug: ListSlug,
		handle: string,
		options?: ListMemberOptions,
	): Promise<ListMemberResult>;
	scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;
}
