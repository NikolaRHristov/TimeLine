/**
 * @module DataState
 *
 * The six states a surface that reads a collection can be in, and the one shape
 * that carries them.
 *
 * RFC-0050 fixes the set - `pending`, `ready`, `empty`, `partial`, `stale`,
 * `failed` - and the object it arrives in: `{ State, Count, Total, At, Code,
 * Remedy }`. This module is the only place either is declared: a surface does
 * not invent a seventh state, and it does not reach for a boolean instead.
 *
 * The reason the state is an object rather than a flag: a boolean cannot carry
 * the ratio, the timestamp or the error code, so every surface that took one
 * had to be told the rest separately, and the ones that were not said less than
 * the truth. `Count` and `Total` say `18 of 20`; `At` says when; `Code` and
 * `Remedy` say what failed and what fixes it.
 *
 * Every key is always present and `null` where the state has no value for it.
 * A caller that has to test for a missing key has been handed a second state
 * model, and the point of this one is that there is a single shape to read.
 *
 * The module is dependency-free and renders nothing, so a page and an island
 * read the same derivation.
 */

/**
 * The closed set, in the order a surface passes through it.
 *
 * `pending` is the read in flight, `ready` the ordinary case, and the other
 * four are the ordinary cases too - an archive with nothing in it, a peer that
 * did not answer, a copy older than the build, and a read that failed. A
 * surface that can only render `ready` is not finished.
 */
export const DataState = ["pending", "ready", "empty", "partial", "stale", "failed"] as const;

/** One of the six. A surface takes this type, never a bare string. */
export type DataStateName = (typeof DataState)[number];

/**
 * The failure codes the site is allowed to print.
 *
 * These are the tool layer's own codes, not a second vocabulary:
 * `Maintain/Source/CLI/Parser/Output/Failure.ts` declares the full set and this
 * one names the three a page can honestly show. A reader who sees `no-post` on
 * the page and in the terminal sees one fact stated twice rather than two facts
 * that happen to look alike, and the token contract fails when a code here is
 * not in the CLI's list.
 *
 * The site never imports the tool layer (the build must not depend on it), so
 * the list is stated here and checked there.
 */
export const FailureCode = ["no-config", "no-post", "unknown-list"] as const;

/** One of the three codes a surface may print. */
export type FailureCodeName = (typeof FailureCode)[number];

/**
 * The attribute a surface publishes its read state on.
 *
 * Deliberately not `data-state`: a control's state (RFC-0049) and a
 * collection's state are two closed sets that appear in the same tree, and one
 * attribute carrying both would make `locked` and `failed` look like members of
 * one vocabulary.
 */
export const ReadAttribute = "data-read";

/** One read, in the one shape every surface renders. */
export interface DataRead {
	/** Which of the six this read is in. */
	readonly State: DataStateName;
	/** How many records arrived. */
	readonly Count: number;
	/** How many the read was for. Equal to `Count` unless the read was partial. */
	readonly Total: number;
	/** The newest record's absolute ISO time, or `null` when nothing arrived. */
	readonly At: string | null;
	/** The tool layer's code for a failure, or `null`. */
	readonly Code: FailureCodeName | null;
	/** The command that fills an empty surface or fixes a failed one, or `null`. */
	readonly Remedy: string | null;
}

/**
 * What a surface knows after reading.
 *
 * `Total` is the size of the set the read was for, which is only different from
 * `Count` when some records did not arrive. `Now` is the clock the staleness is
 * measured against - the build's own clock unless a caller pins it, so two
 * surfaces built together agree about how old the archive is.
 */
export interface ReadInput {
	readonly Count: number;
	readonly Total?: number;
	readonly At?: string | null;
	readonly Now?: string;
	readonly Code?: FailureCodeName;
	readonly Remedy?: string;
}

/**
 * How old a record may be before the surface calls itself stale.
 *
 * One day. RFC-0050 rule 3 says data older than the build is a state with a
 * timestamp rather than a silent value, and a build is a daily event; a shorter
 * window would make every surface stale between two builds, and a longer one
 * would let a fortnight-old archive present itself as current. The state always
 * carries the absolute time, so a reader is never asked to trust the window.
 */
export const Freshness = 24 * 60 * 60 * 1000;

/**
 * Raised when a read does not describe itself honestly.
 *
 * These are build failures rather than warnings: an `empty` with no command is
 * a blank region, a `failed` with no code is "something went wrong", and a
 * `stale` with a relative time is a claim about now on a page that may be read
 * tomorrow.
 */
export class DataContractError extends Error {
	constructor(Message: string) {
		super(Message);
		this.name = "DataContractError";
	}
}

/** An absolute timestamp: a date, a time, and a zone. Nothing else. */
const Absolute = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Whether a string is an absolute ISO time. `2 hours ago` is not. */
export function IsAbsolute(Value: string): boolean {
	return Absolute.test(Value) && !Number.isNaN(Date.parse(Value));
}

/**
 * The timestamp, validated.
 *
 * A relative phrase is refused rather than converted: `2 hours ago` is a
 * statement about the moment the page was built, and a cached page repeats it
 * tomorrow as a false one.
 */
export function Iso(Value: string | null): string {
	if (Value === null) {
		throw new DataContractError(
			"the state carries no timestamp - a stale or ready surface states its age, so pass the newest record's absolute ISO time.",
		);
	}

	if (!IsAbsolute(Value)) {
		throw new DataContractError(
			`"${Value}" is not an absolute ISO time - write 2026-11-02T09:41:00Z rather than a relative phrase, because the page outlives the sentence.`,
		);
	}

	return Value;
}

const Whole = (Name: string, Value: number): number => {
	if (!Number.isInteger(Value) || Value < 0) {
		throw new DataContractError(
			`${Name} is ${Value} - a count of records is a whole number and cannot be negative.`,
		);
	}

	return Value;
};

const Command = (State: DataStateName, Remedy: string | undefined): string => {
	const Text = (Remedy ?? "").trim();

	if (Text === "") {
		throw new DataContractError(
			State === "empty"
				? "empty was given no remedy - an empty surface states what would fill it and names the command that does, or a reader cannot tell it from a broken one (RFC-0050 rule 1)."
				: 'failed was given no remedy - a failure states the code the tool layer reported and what fixes it, or it is the "something went wrong" the operator cannot act on (RFC-0050 rule 4).',
		);
	}

	return Text;
};

/**
 * The state a surface is in, derived from what it read.
 *
 * Derived rather than passed: a parent that computes the state does so without
 * the collection, and a flag cannot carry the ratio, the time or the code
 * (RFC-0050 rule 5). The order of the branches is the order of what a reader
 * needs to know - a failure outranks an empty result, an empty result outranks
 * a shortfall, and a shortfall outranks age, because `18 of 20` says more than
 * `this is two days old`.
 */
export function Read(Input: ReadInput): DataRead {
	const Count = Whole("Count", Input.Count);
	const Total = Whole("Total", Input.Total ?? Count);

	if (Total < Count) {
		throw new DataContractError(
			`Total is ${Total} and Count is ${Count} - a read cannot return more records than the set it read, so one of the two is the wrong number.`,
		);
	}

	if (Input.Code !== undefined) {
		if (!(FailureCode as readonly string[]).includes(Input.Code)) {
			throw new DataContractError(
				`"${Input.Code}" is not one of the site's failure codes (${FailureCode.join(", ")}) - the page prints the tool layer's own code, not a second vocabulary.`,
			);
		}

		return {
			State: "failed",
			Count,
			Total,
			At: Input.At ?? null,
			Code: Input.Code,
			Remedy: Command("failed", Input.Remedy),
		};
	}

	if (Count === 0) {
		return {
			State: "empty",
			Count,
			Total,
			At: null,
			Code: null,
			Remedy: Command("empty", Input.Remedy),
		};
	}

	const At = Input.At === undefined || Input.At === null ? null : Iso(Input.At);
	const Now = Input.Now === undefined ? new Date().toISOString() : Iso(Input.Now);

	if (Total > Count) {
		return {
			State: "partial",
			Count,
			Total,
			At,
			Code: null,
			Remedy: Input.Remedy?.trim() || null,
		};
	}

	if (At !== null && Date.parse(Now) - Date.parse(At) > Freshness) {
		return {
			State: "stale",
			Count,
			Total,
			At,
			Code: null,
			Remedy: Input.Remedy?.trim() || null,
		};
	}

	return { State: "ready", Count, Total, At, Code: null, Remedy: null };
}

/**
 * A read that has not answered yet.
 *
 * The surface keeps its geometry while this state holds: the frame the records
 * will land in is drawn at its real size, because a skeleton of a different
 * size is a second layout to maintain and a visible jump on every load
 * (RFC-0050 rule 6).
 */
export function Pending(): DataRead {
	return { State: "pending", Count: 0, Total: 0, At: null, Code: null, Remedy: null };
}

/**
 * `18 of 20`, or `null` when the read was not partial.
 *
 * The ratio belongs to the list rather than to the page, so it is returned as a
 * value a list can print rather than as a banner the surface raises.
 */
export function Ratio(Data: DataRead): string | null {
	return Data.State === "partial" ? `${Data.Count} of ${Data.Total}` : null;
}

export default Read;
