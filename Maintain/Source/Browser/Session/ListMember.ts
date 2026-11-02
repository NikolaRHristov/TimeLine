import { fail } from "../../Cli/Parser/Output/Failure.ts";
import { rateLimit } from "../../Model/List/Member.ts";
import type { ListSurfaceState, MemberReport, MemberRequest } from "../../Model/List/Member.ts";
import type { Tab } from "../../Model/Tab/Tab.ts";
import type { ListMemberResult } from "../Selector/ListMember.ts";
import { expression, readyExpression } from "../Selector/ListMember.ts";
import { withPage } from "./Page.ts";
import type { Session } from "./Session.ts";

/**
 * The four things the decision needs from the page, and nothing else.
 *
 * `execute` is written against this instead of a `Session`, so the whole
 * decision - dry run, no-op, one write, a limit - runs without a browser.
 */
export type ListSurface = {
	/** Open the "Pick a List" dialog and read it. Never stages anything. */
	open(): Promise<ListSurfaceState>;
	/** Click one row by list name. This is what stages the membership. */
	pick(name: string): Promise<ListSurfaceState>;
	/** Press Save. This is the only call that writes. */
	save(): Promise<ListSurfaceState>;
	close(): Promise<void>;
};

export type ListMemberContext = { session: Session; tab: Tab; url: string; surface: ListSurface };

function stateOf(result: ListMemberResult | undefined): ListSurfaceState {
	return {
		opened: result?.opened === true,
		rows: result?.rows ?? [],
		save: result?.save === true,
		alerts: result?.alerts ?? [],
	};
}

/** The dialog, as a surface the decision can drive. */
export function surfaceOf(session: Session): ListSurface {
	const ask = async (request: Parameters<typeof expression>[0]): Promise<ListSurfaceState> =>
		stateOf(await session.evaluate<ListMemberResult>(expression(request)));

	return {
		open: () => ask({ op: "open" }),
		pick: (name) => ask({ op: "pick", name }),
		save: () => ask({ op: "save" }),
		async close(): Promise<void> {
			try {
				await session.evaluate(expression({ op: "close" }));
			} catch {
				// The tab is already gone, or the page is mid-navigation; closing is
				// cleanup, and cleanup that fails must not replace the real answer.
			}
		},
	};
}

/**
 * Decide, then act only when asked.
 *
 * The order matters: the row is read before anything is clicked, so a handle
 * that is already a member costs one read and no write, and a dry run stops
 * before the click that would stage a change. A limit is reported as its own
 * failure code so a caller looping over handles stops instead of retrying.
 */
export async function execute(surface: ListSurface, request: MemberRequest): Promise<MemberReport> {
	const opened = await surface.open();
	if (opened.rows.length === 0) {
		// A menu that never appeared and a dialog that rendered empty are
		// different problems: the first is usually the account's own profile,
		// which offers no "Add/remove from Lists" at all, and the second is the
		// page failing to fetch the lists. Reporting them as one code sends the
		// caller looking in the wrong place.
		if (opened.opened !== true) {
			throw fail("no-list-menu", "no Add/remove from Lists control in the profile header", {
				handle: request.handle,
				list: request.name,
				alerts: opened.alerts,
				hint: "an account's own profile has no such control; only another account's profile does",
			});
		}
		throw fail("no-list-surface", "the list dialog rendered no rows", {
			handle: request.handle,
			list: request.name,
			alerts: opened.alerts,
		});
	}

	const matches = opened.rows.filter((row) => row.name === request.name);
	if (matches.length > 1) {
		throw fail("unknown-list", `more than one list is called ${request.name}`, {
			handle: request.handle,
			list: request.name,
			matches: matches.length,
		});
	}
	const row = matches[0];
	if (row === undefined) {
		throw fail("unknown-list", `no list named ${request.name} is offered for this handle`, {
			handle: request.handle,
			list: request.name,
			offered: opened.rows.map((candidate) => candidate.name),
		});
	}

	if (row.checked) {
		return request.apply
			? { dryRun: false, added: false, alreadyMember: true, handle: request.handle, list: request.name, was: true }
			: {
					dryRun: true,
					action: "page list member add",
					handle: request.handle,
					list: request.name,
					member: true,
					wouldAdd: false,
				};
	}

	if (!request.apply) {
		return {
			dryRun: true,
			action: "page list member add",
			handle: request.handle,
			list: request.name,
			member: false,
			wouldAdd: true,
		};
	}

	const picked = await surface.pick(request.name);
	const limited = rateLimit(picked.alerts);
	if (limited !== null) {
		throw fail("rate-limited", limited, { handle: request.handle, list: request.name, stage: "pick" });
	}
	const staged = picked.rows.find((candidate) => candidate.name === request.name);
	if (staged === undefined || staged.checked !== true) {
		throw fail("cdp-error", "the row did not flip to checked", {
			handle: request.handle,
			list: request.name,
			rows: picked.rows,
		});
	}

	const saved = await surface.save();
	const denied = rateLimit(saved.alerts);
	if (denied !== null) {
		throw fail("rate-limited", denied, { handle: request.handle, list: request.name, stage: "save" });
	}
	// A row that is back to unchecked while the dialog is still open means the
	// page reverted the staging: report that instead of claiming a write.
	const reverted = saved.rows.find((candidate) => candidate.name === request.name);
	if (saved.rows.length > 0 && reverted !== undefined && reverted.checked !== true) {
		throw fail("cdp-error", "the row reverted after Save", {
			handle: request.handle,
			list: request.name,
		});
	}

	return { dryRun: false, added: true, handle: request.handle, list: request.name, was: false };
}

/**
 * Keep a background tab awake.
 *
 * The dialog's rows are fetched by a component the client only mounts while the
 * page believes it is visible. A background tab is `hidden`, and the dialog
 * then renders as an empty shell - the same rows that appear instantly in a
 * foreground tab. Focus emulation makes the page think it is visible without
 * moving the person's window, which `Page.bringToFront` would.
 */
async function focus(session: Session): Promise<void> {
	const commands: [string, Record<string, unknown>][] = [
		["Emulation.setFocusEmulationEnabled", { enabled: true }],
		["Page.setWebLifecycleState", { state: "active" }],
	];
	for (const [method, params] of commands) {
		try {
			await session.client.send(method, params);
		} catch (error) {
			// Without this the dialog may render empty; say so and let the failure
			// surface as `no-list-surface` rather than as a silent no-op.
			process.stderr.write(
				`maintain: ${method} failed (${error instanceof Error ? error.message : String(error)}); the list dialog may not render\n`,
			);
		}
	}
}

/**
 * Show one handle's profile in a background tab and hand its list dialog over.
 *
 * The tab is this run's own and is closed afterwards: the profile of a handle
 * that is not on screen has no business taking over the person's window.
 */
export async function withListMember<T>(
	handle: string,
	body: (context: ListMemberContext) => Promise<T>,
): Promise<T> {
	const url = `https://x.com/${handle}`;
	// `fail`: a membership write must not proceed on a profile that never
	// arrived. `--dry-run` would otherwise report "not a member" for a page that
	// simply has not rendered yet, which reads as a green light to apply.
	return withPage(
		url,
		{ ready: readyExpression(), timeout: 15_000, ephemeral: true, onNotReady: "fail" },
		async (page) => {
			await focus(page.session);
			const surface = surfaceOf(page.session);
			try {
				return await body({ session: page.session, tab: page.tab, url: page.href, surface });
			} finally {
				await surface.close();
			}
		},
	);
}
