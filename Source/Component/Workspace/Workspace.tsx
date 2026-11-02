import "@Stylesheet/Component/Workspace.scss";
import { createSignal, Show } from "solid-js";
import Bento, { Seats, type Tile } from "./Bento.tsx";
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
 * Publishing is the composition's core gesture, and it is modelled rather than
 * mocked: an open record takes the next seat the canvas has empty, so the
 * drawer's queue and the canvas's layout cannot disagree. A record that is
 * already published is not placed twice - a second drop opens it instead, which
 * is what a person pressing the same row twice expects.
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
	/** The publish bar's destination. */
	Destination: string;
	/** The publish bar's standing instruction. */
	Instruction: string;
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
	const [Stage, SetStage] = createSignal(Props.Stages[0]?.Key ?? "");
	const [Active, SetActive] = createSignal(Props.Columns[0]?.Key ?? "");
	const [View, SetView] = createSignal<DrawerView>("list");
	const [Open, SetOpen] = createSignal<string | null>(null);
	const [Published, SetPublished] = createSignal<Tile[]>(Props.Tiles);

	/** The column a record belongs to, which is also the stage it publishes into. */
	const Owner = (Id: string) =>
		Props.Columns.find((Column) => Column.Entries.some((Entry) => Entry.Id === Id));

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

		SetPublished((Current) => [
			...Current,
			{
				...Seat,
				Id: Entry.Id,
				Eyebrow: Column?.Label ?? "",
				Title: Entry.Title,
				Meta: Entry.Meta,
				Stage: Column?.Tone,
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

				<Publish Label={Props.Destination} Note={Props.Instruction} Context={StageName()} />

				<Show when={View() === "list"} fallback={<Bento Tiles={Published()} />}>
					<Bento Tiles={Published()} />
				</Show>
			</div>
		</div>
	);
}
