/**
 * The session slot: who this is, and what context they are in (RFC-0043 §7).
 *
 * One module answers that question and nothing else. It reads no collection and
 * writes no markup - a page derives its props at build time and hands them in,
 * and this layer only decides which context is selected, what standing the
 * identity has in it, and which of the four states is on screen. The drawer is
 * never held here: a person has one archive, the archive is not a room's, and a
 * slot that could not address one cannot change one.
 *
 * The slot starts empty and stays empty until something proves otherwise. An
 * absent session is not an error state: the build's view is already rendered,
 * the state line says `static`, and exactly one warning is logged per read.
 */
import { Key as ContextKey, Own, type Context } from "./Context.ts";
import type { Grant, Role, Standing } from "./Role.ts";
import type { IslandState } from "./State.ts";

/**
 * The identity, as the client may hold it.
 *
 * A public key and a name. The private half lives in the keystore, is unlocked
 * by a passphrase, and never reaches this module, the bundle or the store
 * (RFC-0043 §10) - which is why there is no field here it could be assigned to.
 */
export interface Identity {
	readonly Id: string;
	readonly Name: string;
	/** The public half of the identity key. */
	readonly PublicKey: string;
}

/** One room the identity belongs to, and what it may do there. */
export interface Membership {
	readonly Room: Extract<Context, { Kind: "room" }>;
	readonly Role: Role;
	readonly Grants: readonly Grant[];
	/**
	 * Whether the room's current key epoch is wrapped to the identity's public
	 * key. An unwrapped membership is a member who reads nothing: joined, not
	 * granted (RFC-0043 §6), which the ladder renders as `joined` rather than as
	 * an empty canvas.
	 */
	readonly Wrapped: boolean;
	/** Whether the room admits votes from identities without a membership row. */
	readonly OpenVote: boolean;
}

/** A queued write. A client timestamp is a claim, never the order (RFC-0040). */
export interface PendingAction {
	readonly ActionId: string;
	readonly AuthoredAt: string;
}

export interface Slot {
	readonly Identity: Identity | null;
	readonly Memberships: readonly Membership[];
	/** The selected context. Always one of `Contexts`. */
	readonly Context: Context;
	/** The contexts the rail may select, in the order it prints them. */
	readonly Contexts: readonly Context[];
	readonly State: IslandState;
	/** When the state's rows are current to, as an ISO timestamp. */
	readonly AsOf: string | null;
}

/**
 * The slot a page starts with.
 *
 * `static` is not a fallback that hides a failure - it is the true description of
 * the build's own view, and it is what the server-rendered HTML already shows.
 * The context list comes from the page because the page is the only thing that
 * knows what the build produced.
 */
export function Anonymous(Contexts: readonly Context[], AsOf: string | null): Slot {
	const [First] = Contexts;

	if (First === undefined) {
		Warn(
			"session: the workspace was mounted with no context; it renders with no context selected",
		);

		return {
			Identity: null,
			Memberships: [],
			Context: Own("", ""),
			Contexts: [],
			State: "static",
			AsOf,
		};
	}

	return { Identity: null, Memberships: [], Context: First, Contexts, State: "static", AsOf };
}

/**
 * Select a context.
 *
 * The whole of rule 1 is in this signature: there is no drawer argument, and the
 * returned slot has no drawer field, so selecting a room changes the canvas and
 * the publish destination and cannot change the drawer. The drawer arrives at
 * `Enter` as an opaque value that is passed straight through.
 *
 * A room the session holds no membership for is not selectable. That is a
 * refusal rather than a throw: a stale tab or a hand-edited URL is an ordinary
 * way to arrive at an unknown room, and the answer is to stay where you are.
 */
export function Select(Slot: Slot, Next: Context): Slot {
	const Known = Slot.Contexts.some((Entry) => ContextKey(Entry) === ContextKey(Next));

	if (!Known) {
		return Slot;
	}

	return { ...Slot, Context: Next };
}

/** The membership that governs the selected context, when there is one. */
export function MembershipOf(Slot: Slot): Membership | undefined {
	if (Slot.Context.Kind !== "room") {
		return undefined;
	}

	return Slot.Memberships.find((Entry) => ContextKey(Entry.Room) === ContextKey(Slot.Context));
}

/**
 * The identity's standing in the selected context.
 *
 * Three facts hold at once and this returns the one that applies here: the owner
 * of its own context, a member of each room it joined, a reader everywhere else.
 * An owner of the own context carries every grant, because §4's owner column is
 * `yes` for every row; a member carries what its membership row says.
 */
export function StandingOf(Slot: Slot): Standing {
	if (Slot.Identity === null) {
		return { Role: "reader", Grants: [], Identity: null, OpenVote: false };
	}

	if (Slot.Context.Kind === "own") {
		return {
			Role: "owner",
			Grants: ["author", "curator", "authority", "propagate"],
			Identity: Slot.Identity.Id,
			OpenVote: false,
		};
	}

	const Membership = MembershipOf(Slot);

	if (Membership === undefined) {
		return { Role: "reader", Grants: [], Identity: Slot.Identity.Id, OpenVote: false };
	}

	return {
		Role: Membership.Role,
		Grants: Membership.Grants,
		Identity: Slot.Identity.Id,
		OpenVote: Membership.OpenVote,
	};
}

/** What the caller supplies from its own store, per context. */
export interface Input<Drawer, Canvas> {
	/** The owner's records. Opaque here: the session layer never reads them. */
	readonly Drawer: Drawer;
	/** One canvas per context, keyed by `Key(Context)`. */
	readonly Canvases: Readonly<Record<string, Canvas>>;
	/** The build's canvas, which is what an unreadable context falls back to. */
	readonly Built: Canvas;
	readonly Pending: readonly PendingAction[];
}

/** The island's whole input (RFC-0043 §7), as one value. */
export interface Contract<Drawer, Canvas> {
	readonly Context: Context;
	readonly Destination: string;
	readonly Standing: Standing;
	readonly State: IslandState;
	readonly AsOf: string | null;
	readonly Drawer: Drawer;
	readonly Canvas: Canvas;
	readonly Pending: readonly PendingAction[];
}

/**
 * Compose the contract for the selected context.
 *
 * Two rules live here. The drawer is passed through untouched - the same value,
 * not a copy - so a context switch cannot alter a byte of it, and a caller that
 * wanted to would have to change this function's return type. The canvas falls
 * back to the build's, because a context whose rows are not readable must render
 * the projection that is on screen rather than an empty container: an empty
 * canvas is a data state, and "I cannot read this room" is not one.
 */
export function Enter<Drawer, Canvas>(
	Slot: Slot,
	Input: Input<Drawer, Canvas>,
): Contract<Drawer, Canvas> {
	const Membership = MembershipOf(Slot);
	const Joined = Slot.Context.Kind === "room" && Membership !== undefined && !Membership.Wrapped;

	return {
		Context: Slot.Context,
		Destination: Slot.Context.Destination,
		Standing: StandingOf(Slot),
		State: Joined ? "joined" : Slot.State,
		AsOf: Slot.AsOf,
		Drawer: Input.Drawer,
		Canvas: Input.Canvases[ContextKey(Slot.Context)] ?? Input.Built,
		Pending: Input.Pending,
	};
}

/**
 * How the session is read.
 *
 * A function returning an unknown payload, because the reader is the transport
 * seam (RFC-0003) and this module must not know which transport answered. The
 * payload is validated here rather than trusted: a seam that answered with a
 * shape from a newer client is a session this client cannot use, and it degrades
 * like any other failure.
 *
 * UNKNOWN - where the local seam is reached from the browser. RFC-0043 §7 gives
 * the drawer a live source: the owner's own store through the transport seam.
 * That seam is a CLI-side transport today and exposes no browser endpoint, so
 * every page passes no reader and stays `static`. Spike: name the endpoint the
 * tool layer would serve (`store session --json` over loopback), settle it in the
 * substrate record, and only then claim a live drawer.
 */
export type Reader = () => Promise<unknown>;

/**
 * Resolve a session, or keep the build's view.
 *
 * Never rejects and never returns an empty slot: the initial slot is the answer
 * to every failure, and the one warning says which failure it was. A successful
 * read is `snapshot` rather than `live` - it is one state received at one time,
 * and `live` means a subscription that is current to the last tick, which does
 * not exist yet (RFC-0043 §9 row 3 keeps a resumable cursor UNKNOWN).
 */
export function Resolve(Initial: Slot, Read?: Reader): Promise<Slot> {
	if (Read === undefined) {
		Warn(
			"session: no local transport seam is reachable from this page; the workspace keeps the build's view (static)",
		);

		return Promise.resolve(Initial);
	}

	return Read().then(
		(Payload) => {
			const Read_ = Readable(Payload);

			if (Read_ === null) {
				Warn(
					"session: the local seam answered with a shape this client does not recognise; the workspace keeps the build's view (static)",
				);

				return Initial;
			}

			const Own_ = Initial.Contexts.filter((Entry) => Entry.Kind === "own");
			const Contexts = [...Own_, ...Read_.Memberships.map((Entry) => Entry.Room)];
			const Selected = Contexts.some(
				(Entry) => ContextKey(Entry) === ContextKey(Initial.Context),
			)
				? Initial.Context
				: (Contexts[0] ?? Initial.Context);

			return {
				...Initial,
				Identity: Read_.Identity,
				Memberships: Read_.Memberships,
				Contexts,
				Context: Selected,
				State: "snapshot" as const,
				AsOf: new Date().toISOString(),
			};
		},
		() => {
			Warn(
				"session: the local seam refused the session read; the workspace keeps the build's view (static)",
			);

			return Initial;
		},
	);
}

/** What a read must produce to be usable. */
function Readable(Payload: unknown): { Identity: Identity; Memberships: Membership[] } | null {
	if (typeof Payload !== "object" || Payload === null) {
		return null;
	}

	const Candidate = Payload as { Identity?: unknown; Memberships?: unknown };

	if (!IsIdentity(Candidate.Identity) || !Array.isArray(Candidate.Memberships)) {
		return null;
	}

	const Memberships = Candidate.Memberships.filter(IsMembership);

	if (Memberships.length !== Candidate.Memberships.length) {
		return null;
	}

	return { Identity: Candidate.Identity, Memberships };
}

function IsIdentity(Value: unknown): Value is Identity {
	if (typeof Value !== "object" || Value === null) {
		return false;
	}

	const Candidate = Value as Record<string, unknown>;

	return (
		typeof Candidate["Id"] === "string" &&
		typeof Candidate["Name"] === "string" &&
		typeof Candidate["PublicKey"] === "string"
	);
}

function IsMembership(Value: unknown): Value is Membership {
	if (typeof Value !== "object" || Value === null) {
		return false;
	}

	const Candidate = Value as Record<string, unknown>;
	const Room = Candidate["Room"] as Record<string, unknown> | undefined;

	return (
		typeof Room === "object" &&
		Room !== null &&
		Room["Kind"] === "room" &&
		typeof Room["RoomId"] === "string" &&
		typeof Room["Label"] === "string" &&
		typeof Room["Destination"] === "string" &&
		typeof Candidate["Role"] === "string" &&
		Array.isArray(Candidate["Grants"]) &&
		typeof Candidate["Wrapped"] === "boolean" &&
		typeof Candidate["OpenVote"] === "boolean"
	);
}

/**
 * One warning per read, and never an error.
 *
 * A console error during hydration is the failure this layer exists to avoid:
 * the page is already rendered, and a thrown or logged error would be the only
 * thing a person saw. The store calls `Resolve` once per page, which is what
 * makes one warning per call one warning per page.
 */
function Warn(Sentence: string): void {
	console.warn(Sentence);
}
