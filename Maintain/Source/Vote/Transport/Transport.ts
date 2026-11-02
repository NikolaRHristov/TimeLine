import { fail } from "../../CLI/Parser/Output/Failure.ts";
import * as Text from "../../Content/Text.ts";
import { fill } from "../../Output/Text/Fill.ts";
import {
	configuration,
	ENVIRONMENT,
	counts as firebaseCounts,
	type FirebaseConfiguration,
} from "./Firebase.ts";

/**
 * The vote transport seam.
 *
 * Two implementations and no third state: `firebase` when this machine has a
 * project, `none` when it does not. `none` is not an error - it is the state of
 * every fresh clone, and the reason the whole site builds and the whole Curated
 * index works without a Firebase account.
 *
 * The shape mirrors the browser transport seam in `Documentation/Reference/
 * Transport.md`: a `name` discriminant, a `mutable` flag a caller may branch on
 * *before* doing anything, and one method per operation. A command never
 * imports `Firebase.ts` directly; it asks for a transport and gets either a
 * working one or a named refusal.
 */
export type VoteTransport = {
	readonly name: "firebase" | "none";
	/** Whether this transport can accept a write at all. `none` never can. */
	readonly mutable: boolean;
	/** Current counts for `ids`; ids the store has never seen are simply absent. */
	counts(ids: readonly string[]): Promise<Record<string, number>>;
};

/** `MAINTAIN_VOTE_TRANSPORT=firebase|none`; unset means "firebase if configured". */
export const TRANSPORT_ENV = "MAINTAIN_VOTE_TRANSPORT";

/** Every variable that would configure a project, for the failure's next step. */
const EXPECTED = Object.values(ENVIRONMENT);

function none(): VoteTransport {
	return {
		name: "none",
		mutable: false,
		async counts(): Promise<Record<string, number>> {
			throw fail("no-transport", "no vote transport is configured", {
				// The full list, not one name: which field a person forgot is
				// their business, and a sync that names only `DATABASE_URL`
				// sends them looking at a database that is fine.
				expected: EXPECTED,
				next: fill(Text.HintVoteAbsent, { reference: Text.ReferenceVoting }),
			});
		},
	};
}

function firebase(value: FirebaseConfiguration): VoteTransport {
	return {
		name: "firebase",
		mutable: true,
		counts(ids: readonly string[]): Promise<Record<string, number>> {
			return firebaseCounts(value, ids);
		},
	};
}

/**
 * Resolve the transport for this machine.
 *
 * - `MAINTAIN_VOTE_TRANSPORT=none` wins over everything: it is how a person
 *   with a configured project proves the read-only path still works.
 * - `MAINTAIN_VOTE_TRANSPORT=firebase` demands a project and fails
 *   `no-transport` naming the missing variable rather than half-starting.
 * - Unset means "use the project if there is one", which is what makes a fresh
 *   clone work with no flags at all.
 */
export function select(environment: NodeJS.ProcessEnv = process.env): VoteTransport {
	const requested = (environment[TRANSPORT_ENV] ?? "").trim().toLowerCase();

	if (requested === "none") return none();

	const value = configuration(environment);
	if (value === null) {
		if (requested === "firebase") {
			throw fail("no-transport", `${TRANSPORT_ENV}=firebase but no project is configured`, {
				expected: EXPECTED,
				missing: "MAINTAIN_VOTE_FIREBASE_DATABASE_URL",
				next: fill(Text.HintVoteIncomplete, { reference: Text.ReferenceVoting }),
			});
		}
		return none();
	}

	if (requested !== "" && requested !== "firebase") {
		throw fail("usage", `unknown vote transport: ${requested}`, {
			values: ["firebase", "none"],
		});
	}

	return firebase(value);
}
