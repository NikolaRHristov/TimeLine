/** Every failure this CLI can report. A code is a contract; a message is not. */
export type FailureCode =
	| "no-config"
	| "no-rules"
	| "no-model"
	| "model-error"
	| "model-reply"
	| "config-exists"
	| "unknown-list"
	| "no-list-menu"
	| "no-list-surface"
	| "no-tab"
	| "no-post"
	| "page-not-ready"
	| "rate-limited"
	| "schema-invalid"
	| "cdp-unreachable"
	| "cdp-error"
	| "spacetime-unreachable"
	| "spacetime-auth"
	| "spacetime-reducer"
	| "no-transport"
	| "read-only-transport"
	| "unsupported-transport"
	| "vote-unreachable"
	| "no-entry"
	| "not-curated"
	| "already-curated"
	| "tombstone"
	| "usage"
	| "io-error"
	| "internal";

/**
 * One failure, rendered as one JSON object with exit code 2.
 * Extra keys ride along so a caller gets the candidates or the expected path
 * in the same object instead of a second query.
 */
export class Failure extends Error {
	readonly code: FailureCode;
	readonly detail: string | undefined;
	readonly extra: Record<string, unknown>;

	constructor(code: FailureCode, detail?: string, extra: Record<string, unknown> = {}) {
		super(detail ?? code);
		this.name = "Failure";
		this.code = code;
		this.detail = detail;
		this.extra = extra;
	}

	/** The object printed on stdout. `error` is always first. */
	toObject(): Record<string, unknown> {
		const object: Record<string, unknown> = { error: this.code };
		if (this.detail !== undefined) object["detail"] = this.detail;
		return { ...object, ...this.extra };
	}
}

export function fail(
	code: FailureCode,
	detail?: string,
	extra: Record<string, unknown> = {},
): Failure {
	return new Failure(code, detail, extra);
}

export function isFailure(error: unknown): error is Failure {
	return error instanceof Failure;
}

/** Anything thrown that is not a Failure is still reported as one object. */
export function toFailure(error: unknown): Failure {
	if (isFailure(error)) return error;
	if (error instanceof Error) return new Failure("internal", error.message);
	return new Failure("internal", String(error));
}
