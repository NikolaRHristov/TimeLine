import { fail } from "../../CLI/Parser/Output/Failure.ts";

/** What a readiness wait that ran out of time means for the caller. */
export type ReadinessMode = "fail" | "warn";

export type Readiness = {
	/** The expression that never became true. */
	expression: string;
	/** How long it was given, in milliseconds. */
	timeout: number;
	/** The URL the page was asked to show. */
	url: string;
	/**
	 * `fail` stops the command with `page-not-ready`; `warn` says so on stderr
	 * and lets the body run against whatever did render.
	 */
	mode?: ReadinessMode | undefined;
};

/**
 * Turn `Session.waitFor`'s boolean into the decision it exists for.
 *
 * `waitFor` reports a timeout by returning `false` and never throws, so a
 * discarded result is the page saying "not yet" to nobody: the command runs
 * against a half-rendered page and reports whatever its own selectors happen to
 * see. Which answer is right is per caller, and the two cases are not close:
 * a membership write must not proceed on a profile that never arrived, while a
 * scrape of a timeline that is still painting has posts to read. `fail` is the
 * default because a wrong "done" is worse than an honest "not ready".
 */
export function assertReady(result: boolean, readiness: Readiness): void {
	if (result === true) return;
	const detail = `the page never became ready within ${readiness.timeout} ms: ${readiness.expression}`;
	if (readiness.mode === "warn") {
		process.stderr.write(`maintain: ${detail} (${readiness.url}); continuing\n`);
		return;
	}
	throw fail("page-not-ready", detail, {
		expression: readiness.expression,
		timeout: readiness.timeout,
		url: readiness.url,
	});
}
