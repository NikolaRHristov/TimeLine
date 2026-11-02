import "@Stylesheet/Component/Workspace.scss";
import { OwnKey, type Context } from "@Script/Session/Context.ts";
import { CrossTheSeam } from "@Script/Session/Seam.ts";
import { Enter } from "@Script/Session/Session.ts";
import { UseSession } from "@Script/Session/Use.ts";
import { createSignal, Show } from "solid-js";
import Bento, { Seats, type Tile } from "./Bento.tsx";
import ContextSwitch from "./ContextSwitch.tsx";
import Drawer, { type DrawerView } from "./Drawer.tsx";
import { type Column } from "./DrawerColumn.tsx";
import Provenance, { type Stage } from "./Provenance.tsx";
import Publish from "./Publish.tsx";

/**
 * The workspace: the private drawer, the publish seam, and the published canvas.
 *
 * This is the one component that holds state, and it holds only what a person
 * is doing right now - which stage is selected, which column is live, which
 * record is open, and which tiles have been published this session. Everything
 * else arrives as props, so the same component renders an empty archive and a
 * full one, and a page decides what the workspace is looking at.
 *
 * The session layer decides the rest: which context is selected, what standing
 * the identity has in it, and which of the four states is on screen. It starts
 * empty, so the first render - the server's and the client's - is the build's
 * own view, and a session that never resolves leaves exactly that in place.
 *
 * Publishing is the composition's core gesture, and it crosses the seam rather
 * than writing the canvas: `CrossTheSeam` is the only path from a drawer record
 * to a tile, so an act that is not a publication cannot reach the canvas even by
 * mistake.
 */
interface Props {
	Stages: Stage[];
	Columns: Column[];
	Tiles: Tile[];
	/** The rail's standing note under the scroll bar. */
	Note: string;
	/** The drawer's depth path, e.g. `Depth / Schema`. */
	Eyebrow: string;
	/** The drawer's title. */
	Title: string;
	/** The lock line beside the title. */
	Hint: string;
	/** The publish bar's standing instruction. */
	Instruction: string;
	/** The contexts the rail may select, in the order it prints them. */
	Contexts: Context[];
	/** When the build's view is current to, as an ISO timestamp. */
	AsOf: string | null;
}

/** The cells a tile occupies, as `column:row` keys. */
function Occupy(Tile: Tile): string[] {
	const Cells: string[] = [];

	for (let Column = Tile.Column; Column < Tile.Column + Tile.ColumnSpan; Column++) {
		for (let Row = Tile.Row; Row < Tile.Row + Tile.RowSpan; Row++) {
			Cells.push(`${Column}:${Row}`);
		}
	}

	return Cells;
}

/**
 * The next seat the canvas has empty.
 *
 * The mosaic is fixed, so a publish cannot choose its own geometry: it takes the
 * first seat no record has landed on, in the composition's own order. That is why
 * the drawer's queue and the canvas cannot disagree - there is one seat table and
 * one cursor into it. A full canvas returns nothing, and the caller treats that
 * as "already full" rather than stacking a record on top of another.
 */
function FreeSeat(Tiles: Tile[]): Tile | undefined {
	const Taken = new Set(Tiles.flatMap(Occupy));

	return Seats.find((Seat) => !Occupy(Seat).some((Cell) => Taken.has(Cell)));
}

export default function Workspace(Props: Props) {
	const Session = UseSession(Props.Contexts, Props.AsOf);

	const [Stage, SetStage] = createSignal(Props.Stages[0]?.Key ?? "");
	const [Active, SetActive] = createSignal(Props.Columns[0]?.Key ?? "");
	const [View, SetView] = createSignal<DrawerView>("list");
	const [Open, SetOpen] = createSignal<string | null>(null);
	const [Published, SetPublished] = createSignal<Tile[]>(Props.Tiles);

	/**
	 * The island's whole input (RFC-0043 §7), composed per read.
	 *
	 * The drawer is handed over as the same value every time, which is what makes
	 * a context switch unable to touch it: `Enter` passes it straight through and
	 * only the canvas and the destination are looked up per context. The own
	 * context's canvas is the live tile set; a room falls back to the build's,
	 * because a canvas whose rows are not readable is not an empty canvas.
	 */
	const Contract = () =>
		Enter(Session.Slot(), {
			Drawer: Props.Columns,
			Canvases: { [OwnKey]: Published() },
			Built: Props.Tiles,
			Pending: [],
		});

	/**
	 * The selected stage's short name, for the seam's note.
	 *
	 * A stage label reads `Source · 3 events`, and the seam wants only the name:
	 * the count belongs to the rail, where the band can show it, not to a band
	 * that has room for one clause.
	 */
	const StageName = () =>
		(Props.Stages.find((Entry) => Entry.Key === Stage())?.Label ?? "").split(" · ")[0];

	const Publish_ = (Key: string) => {
		const Column = Props.Columns.find((Candidate) => Candidate.Key === Key);
		const Entry =
			Column?.Entries.find((Candidate) => Candidate.Id === Open()) ?? Column?.Entries[0];

		if (Entry === undefined) {
			return;
		}

		if (Published().some((Tile) => Tile.Id === Entry.Id)) {
			return;
		}

		const Seat = FreeSeat(Published());

		if (Seat === undefined) {
			return;
		}

		/**
		 * UNKNOWN - a drawer record's signing identity.
		 *
		 * A drawer row carries the handle the page showed, not the identity whose
		 * subkey signed the record, so `Author` is empty until the shadow store
		 * records one. Publishing into the owner's own canvas does not read it;
		 * publishing into a room does, and is refused with `not-author` until the
		 * identity migration lands (RFC-0013's implementing card). The version is
		 * the same gap: a drawer record has no version until the store keeps one.
		 */
		const Crossed = CrossTheSeam({
			Act: "publish",
			Context: Contract().Context,
			Standing: Contract().Standing,
			Record: { Id: Entry.Id, Author: Entry.Author ?? "", Version: 1 },
		});

		if (!Crossed.Crossed) {
			return;
		}

		SetPublished((Current) => [
			...Current,
			{
				...Seat,
				Id: Entry.Id,
				Eyebrow: Column?.Label ?? "",
				Title: Entry.Title,
				Meta: Entry.Meta,
			},
		]);
	};

	return (
		<div class="workspace">
			<Provenance
				Stages={Props.Stages}
				Selected={Stage()}
				Note={Props.Note}
				OnSelect={(Key) => SetStage(Key)}
			/>

			<div class="workspace__body">
				<ContextSwitch
					Contexts={Session.Slot().Contexts}
					Selected={Contract().Context}
					State={Contract().State}
					AsOf={Contract().AsOf}
					OnSelect={Session.Select}
				/>

				<Drawer
					Eyebrow={Props.Eyebrow}
					Title={Props.Title}
					Hint={Props.Hint}
					Columns={Props.Columns}
					Active={Active()}
					View={View()}
					OnActivate={(Key) => SetActive(Key)}
					OnView={(Next) => SetView(Next)}
					OnOpen={(Id) => SetOpen(Id)}
					OnAdd={() => undefined}
					OnPublish={(Key) => Publish_(Key)}
				/>

				<Publish
					Label={Contract().Destination}
					Note={Props.Instruction}
					Context={StageName()}
				/>

				<Show when={View() === "list"} fallback={<Bento Tiles={Published()} />}>
					<Bento Tiles={Published()} />
				</Show>
			</div>
		</div>
	);
}
