/**
 * The workspace store: the one place an island keeps what a person is doing.
 *
 * Three surfaces draw this composition - the homepage's showcase, a record's
 * rail, and the workspace page - and two of them can be on screen at once. A
 * signal inside each component would make them three workspaces that happen to
 * look alike: press a band in the rail and the seam beside it would still name
 * the old stage. So the state lives here, once, and every island reads it and
 * dispatches to it.
 *
 * What is state and what is data is this file's boundary. The state is what a
 * person is doing right now: the selected stage, the live column, the view, the
 * open record, the tiles published this session, and the session slot (RFC-0043
 * §7). The data - the stages, the columns, the tiles the build produced - stays
 * with the page and arrives through `Adopt`, because a page derives it at build
 * time and a second copy here would be a second source of truth.
 *
 * `Adopt` is what makes a shared store safe to mount twice. The first island to
 * render seeds a field and a later island fills only what is still empty, so the
 * order two islands hydrate in cannot change what is on screen - which is also
 * what keeps hydration from resetting a server-rendered view to empty.
 *
 * The store is client-side only. A page still derives its props at build time,
 * and on the server `store()` hands each render its own instance rather than one
 * shared one, so a build cannot carry one page's selection into the next page's
 * HTML.
 */
import { createStore } from "solid-js/store";
import type { Column } from "../../Component/Workspace/DrawerColumn.tsx";
import type { Entry } from "../../Component/Workspace/DrawerItem.tsx";
import type { Stage } from "../../Component/Workspace/Provenance.tsx";
import type { Context } from "../Session/Context.ts";
import { embed } from "../Session/Embed.ts";
import {
	Anonymous,
	Resolve as ResolveSession,
	Select as SelectContext,
	type Reader,
	type Slot,
} from "../Session/Session.ts";
import { FreeSeat, type Tile } from "./Seat.ts";

/** The two ways the drawer lays its columns out. */
export type WorkspaceView = "graph" | "list";

/** What a person is doing right now. */
export interface WorkspaceState {
	/** The stage the rail has selected, which the seam names. */
	Stage: string;
	/** The column the drawer has live. */
	Column: string;
	View: WorkspaceView;
	/** The record the drawer has open, or `null` when nothing is open. */
	Record: string | null;
	/** The tiles on the canvas: the build's picks, plus what was published. */
	Published: Tile[];
	/**
	 * The session slot, `null` until a page hands the store its contexts and
	 * `Anonymous` (an identity-less slot) from then on. A slot with no identity
	 * is the anonymous workspace, not an error state.
	 */
	Session: Slot | null;
}

/** What a page hands the store at build time. Every field is optional. */
export interface WorkspaceData {
	Stages?: readonly Stage[];
	Columns?: readonly Column[];
	Tiles?: readonly Tile[];
	/** The stage this surface opens on, when the page names one. */
	Stage?: string;
	/** The contexts the rail may select (RFC-0043 §1). */
	Contexts?: readonly Context[];
	/** When the build's rows were current to, as an ISO timestamp. */
	AsOf?: string | null;
}

export interface WorkspaceStore {
	State: WorkspaceState;
	/** Seed what this surface brought, without overwriting what arrived first. */
	Adopt: (Data: WorkspaceData) => void;
	/** Select a stage. */
	Select: (Key: string) => void;
	/** Make a drawer column live. */
	Activate: (Key: string) => void;
	/** Switch the drawer's layout. */
	Show: (View: WorkspaceView) => void;
	/** Open a record, or close the open one with `null`. */
	Open: (Id: string | null) => void;
	/** Select a context, which is the rail's other selection (RFC-0043 §1). */
	Switch: (Next: Context) => void;
	/** Place a column's record on the canvas. */
	Publish: (Column: Column, Entry: Entry) => void;
	/** Read the session slot, at most once. Never rejects. */
	Resolve: (Read?: Reader) => Promise<void>;
}

function create(): WorkspaceStore {
	const [State, SetState] = createStore<WorkspaceState>({
		Stage: "",
		Column: "",
		View: "list",
		Record: null,
		Published: [],
		Session: null,
	});

	/** Whether the canvas has taken its tiles from the page's props. */
	let Seeded = false;

	/** The session read, started at most once; a second island awaits the same attempt. */
	let Attempt: Promise<void> | undefined;

	const Adopt = (Data: WorkspaceData): void => {
		if (State.Stage === "") {
			const Stage = Data.Stage ?? Data.Stages?.[0]?.Key;

			if (Stage !== undefined && Stage !== "") {
				SetState("Stage", Stage);
			}
		}

		if (State.Column === "" && Data.Columns !== undefined) {
			SetState("Column", Data.Columns[0]?.Key ?? "");
		}

		if (!Seeded && Data.Tiles !== undefined) {
			Seeded = true;
			SetState("Published", [...Data.Tiles]);
		}

		if (State.Session === null && Data.Contexts !== undefined) {
			SetState("Session", Anonymous(Data.Contexts, Data.AsOf ?? null));
		}
	};

	const Select = (Key: string): void => SetState("Stage", Key);

	const Activate = (Key: string): void => SetState("Column", Key);

	const Show = (View: WorkspaceView): void => SetState("View", View);

	const Open = (Id: string | null): void => SetState("Record", Id);

	/**
	 * Select a context.
	 *
	 * A room the session holds no membership for is not selectable, and the
	 * session layer is the one place that decides so: this action hands the
	 * current slot over rather than replacing it.
	 */
	const Switch = (Next: Context): void => {
		if (State.Session === null) {
			return;
		}

		SetState("Session", SelectContext(State.Session, Next));
	};

	/**
	 * Place a record on the canvas.
	 *
	 * The caller resolves the record - it is the one the drawer has open, or the
	 * column's first row when nothing is open - because the seam decides whether
	 * that record may cross at all before anything is placed. What is decided
	 * here is the seat: a record already on the canvas is not placed twice, and
	 * the second press opens it instead, which is what pressing the same row twice
	 * means. A full canvas places nothing rather than stacking a record on a seat
	 * another one holds.
	 */
	const Publish = (Column: Column, Entry: Entry): void => {
		if (State.Published.some((Tile) => Tile.Id === Entry.Id)) {
			SetState("Record", Entry.Id);

			return;
		}

		const Seat = FreeSeat(State.Published);

		if (Seat === undefined) {
			return;
		}

		SetState("Published", [
			...State.Published,
			{
				...Seat,
				Id: Entry.Id,
				Eyebrow: Column.Label,
				Title: Entry.Title,
				Meta: Entry.Meta,
			},
		]);
	};

	/**
	 * Read the session slot, once.
	 *
	 * The read happens on mount, never during render, so the server-rendered HTML
	 * and the first client render are the same anonymous slot and hydration has
	 * nothing to disagree with. A page that embeds no session is not a failure,
	 * and it is not silent either: the session layer states the absence once, so
	 * the build's rows are never mistaken for a session's (RFC-0003's reason for
	 * refusing a fallback that hides itself). A page that embeds a session which
	 * cannot be read keeps the anonymous slot, and the same `Resolve` is the one
	 * place that says so.
	 *
	 * The reader is wrapped so that a reader which throws synchronously becomes a
	 * rejection the session layer handles, and the chain ends in a no-op rejection
	 * handler: this promise is started with `void` by an island, and a rejection
	 * nobody awaits would surface as a console error during hydration.
	 */
	const Resolve = (Read: Reader | undefined = embed()): Promise<void> => {
		const Initial = State.Session;

		if (typeof document === "undefined" || Initial === null) {
			return Promise.resolve();
		}

		// An absent session is handed over rather than skipped: the session layer
		// is the one place that says what is on screen and why, and a page that
		// silently kept the build's view would be the fallback RFC-0003 refuses.
		return (Attempt ??= ResolveSession(
			Initial,
			Read === undefined ? undefined : () => Promise.resolve().then(Read),
		)
			.then((Next) => {
				SetState("Session", Next);
			})
			.catch(() => undefined));
	};

	return { State, Adopt, Select, Activate, Show, Open, Switch, Publish, Resolve };
}

let Instance: WorkspaceStore | undefined;

/**
 * The store this page shares.
 *
 * In the browser the module is evaluated once per page, so every island that
 * imports it reads one instance - that is the whole point of the file. On the
 * server there is no page yet, and a build renders every route in one process, so
 * each render gets its own store: a singleton there would carry one page's
 * selection into the next page's HTML.
 */
export function store(): WorkspaceStore {
	if (typeof window === "undefined") {
		return create();
	}

	return (Instance ??= create());
}
