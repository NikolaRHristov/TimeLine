import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CdpClient } from "../Client.ts";

export type EvaluateOptions = {
	/** Wait for a returned promise before resolving. Default true. */
	awaitPromise?: boolean;
	/** Treat a `null`/`undefined` result as a failure. Default false. */
	required?: boolean;
};

type EvaluateResult = {
	result?: { type?: string; value?: unknown; description?: string };
	exceptionDetails?: {
		text?: string;
		exception?: { description?: string; value?: unknown };
	};
};

/**
 * Run one expression in the page and return its value.
 *
 * `returnByValue` means the caller gets plain JSON, never a remote object id -
 * the CLI never holds state in the page between calls.
 */
export async function evaluate<T = unknown>(
	client: CdpClient,
	expression: string,
	options: EvaluateOptions = {},
): Promise<T> {
	const response = await client.send<EvaluateResult>("Runtime.evaluate", {
		expression,
		awaitPromise: options.awaitPromise ?? true,
		returnByValue: true,
		userGesture: true,
	});

	if (response.exceptionDetails !== undefined) {
		const details = response.exceptionDetails;
		const description = details.exception?.description ?? details.text ?? "evaluate failed";
		throw fail("cdp-error", description.split("\n")[0], {
			expression: expression.slice(0, 200),
		});
	}

	const value = response.result?.value;
	if (value === undefined && options.required === true) {
		throw fail("cdp-error", "the page returned no value", {
			expression: expression.slice(0, 200),
			type: response.result?.type,
		});
	}
	return value as T;
}
