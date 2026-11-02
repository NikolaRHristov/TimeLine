import type { Database } from "firebase/database";
import { open, type FirebaseConfiguration } from "../Firebase.ts";

/**
 * The vote transport seam, browser side.
 *
 * The same shape as the CLI's seam (`Maintain/Source/Vote/Transport/`) and as
 * the browser transport seam in `Documentation/Reference/Transport.md`: a
 * `name` discriminant, a `mutable` flag a caller branches on *before* doing
 * anything, and one method per operation. `none` is a transport, not an
 * absence - which is why every caller can stay one code path.
 *
 * Two implementations and no third state. `none` is what a fresh clone gets,
 * and the page it renders is a ranked list with the counts on file and no
 * buttons.
 */
export type VoteTransport = {
	readonly name: "firebase" | "none";
	/** Whether this transport can accept a write at all. `none` never can. */
	readonly mutable: boolean;
	/** The current count for one entry; 0 when it has never been voted on. */
	count(id: string): Promise<number>;
	/** Cast one vote and resolve to the new total. */
	cast(id: string): Promise<number>;
};

/** A count from an untrusted database: whole, non-negative, finite. */
function tally(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	const whole = Math.trunc(value);
	return whole >= 0 ? whole : 0;
}

function none(): VoteTransport {
	return {
		name: "none",
		mutable: false,
		async count(): Promise<number> {
			return 0;
		},
		async cast(): Promise<number> {
			// Reached only if a caller ignored `mutable`. It must not look like
			// a vote that counted, so it is an error rather than a silent 0.
			throw new Error("vote: no vote transport is configured");
		},
	};
}

function firebase(configuration: FirebaseConfiguration): VoteTransport {
	// One database handle per page, opened on first use: a reader who never
	// clicks still gets live counts, and a page with no configuration never
	// loads the SDK at all.
	let database: Promise<Database | null> | null = null;

	const ready = (): Promise<Database | null> => {
		database ??= (async () => {
			const app = await open(configuration);
			if (app === null) return null;
			const { getDatabase } = await import("firebase/database");
			return getDatabase(app);
		})();
		return database;
	};

	return {
		name: "firebase",
		mutable: true,

		async count(id: string): Promise<number> {
			const handle = await ready();
			if (handle === null) return 0;
			const { get, ref } = await import("firebase/database");
			const snapshot = await get(ref(handle, `votes/${id}`));
			return tally(snapshot.val());
		},

		async cast(id: string): Promise<number> {
			const handle = await ready();
			if (handle === null) throw new Error("vote: the database is unavailable");
			const { ref, runTransaction } = await import("firebase/database");
			// A transaction, not a set: two visitors voting at the same moment
			// must add up instead of overwriting each other. The value is
			// recomputed from whatever is current, so nothing here can lose a
			// vote the rules already accepted.
			const result = await runTransaction(
				ref(handle, `votes/${id}`),
				(current: unknown) => tally(current) + 1,
			);
			return tally(result.snapshot.val());
		},
	};
}

/**
 * Resolve the transport for this page.
 *
 * `none` when the build had no project, which is every fresh clone. Nothing
 * here throws on missing configuration: a page that cannot vote is a page with
 * no buttons, not a page with a console error.
 */
export function select(configuration: FirebaseConfiguration | null): VoteTransport {
	return configuration === null ? none() : firebase(configuration);
}
