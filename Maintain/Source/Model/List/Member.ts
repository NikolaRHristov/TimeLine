/**
 * One membership: the handle's shape, the page's limit vocabulary, and the
 * report a caller reads.
 *
 * Everything here is pure. The selector file owns where the page keeps these
 * facts; this file owns what a handle is and what an answer means, so the
 * decision can be tested without a browser.
 */

/**
 * A handle as X spells it: letters, digits and underscore, fifteen at most.
 *
 * The pattern is also the injection guard: a handle goes straight into a URL
 * path, so a value that could carry `/`, `?` or `..` never reaches the browser.
 */
export const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** `@Some_One` and `some_one` are the same handle; anything else is null. */
export function handle(raw: string): string | null {
	const trimmed = raw.trim().replace(/^@/, "");
	return HANDLE.test(trimmed) ? trimmed : null;
}

/**
 * The phrases the web client uses when the list-add cap is hit.
 *
 * X reports the daily limit in a toast, not an HTTP status this layer can see,
 * so the text is the only signal. These are best-effort: the list is the single
 * place to extend when the wording changes, and `rateLimit` is what a caller
 * stops on.
 */
const LIMITED: readonly RegExp[] = [
	/rate limit/i,
	/too many requests/i,
	/daily limit/i,
	/over the limit/i,
	/try again later/i,
];

/** The first page message that reads as a limit, or null. */
export function rateLimit(messages: readonly string[]): string | null {
	for (const message of messages) {
		if (LIMITED.some((pattern) => pattern.test(message))) return message;
	}
	return null;
}

/** One row of the "Pick a List" dialog. */
export type ListRow = { name: string; checked: boolean };

/** What the dialog says right now. */
export type ListSurfaceState = {
	/**
	 * The header's More caret and its "Add/remove from Lists" item were both
	 * found and clicked. False means the menu never appeared at all, which is a
	 * different failure from a dialog that opened with no rows: an account's
	 * own profile offers no such control, and only other profiles do.
	 */
	opened: boolean;
	rows: ListRow[];
	/** True when the Save button is enabled - something is staged. */
	save: boolean;
	/** Toasts and alerts on the page, verbatim. */
	alerts: string[];
};

/** What the command asks for. */
export type MemberRequest = {
	handle: string;
	/** The configured list name, matched against the dialog's row labels. */
	name: string;
	apply: boolean;
};

/**
 * What the command reports.
 *
 * A dry run answers "is this handle on that list"; an applied run answers "did
 * this run change anything". They are different questions, so they are
 * different shapes rather than one shape with holes.
 */
export type MemberReport =
	| { dryRun: true; action: "page list member add"; handle: string; list: string; member: false; wouldAdd: true }
	| { dryRun: true; action: "page list member add"; handle: string; list: string; member: true; wouldAdd: false }
	| { dryRun: false; added: true; handle: string; list: string; was: false }
	| { dryRun: false; added: false; alreadyMember: true; handle: string; list: string; was: true };
