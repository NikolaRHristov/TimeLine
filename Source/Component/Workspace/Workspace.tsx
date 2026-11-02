import "@Stylesheet/Component/Workspace.scss";
import { createMemo, createSignal, Show } from "solid-js";
import Bento, { type Tile } from "./Bento.tsx";
import Drawer, { type DrawerView } from "./Drawer.tsx";
import { type Column } from "./DrawerColumn.tsx";
import { type Entry } from "./DrawerItem.tsx";
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
 * mocked: an open record is placed into the first free cell of the canvas that
 * fits it, so the drawer's queue and the canvas's layout cannot disagree. A
 * record that is already published is not placed twice - a second drop opens it
 * instead, which is what a person pressing the same row twice expects.
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

const GridColumn = 6;
const GridRow = 4;

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
 * The first free block that fits.
 *
 * Scanning column-major keeps a published tile next to the left edge instead of
 * scattering it wherever the last free cell happens to be, so a session's
 * publishes accumulate as a readable mosaic. A canvas with no room left returns
 * the origin, and the caller treats that as "already full" rather than stacking
 * tiles on top of each other.
 */
function FreeSlot(
	Tiles: Tile[],
	Width: number,
	Height: number,
): { Column: number; Row: number } | null {
	const Taken = new Set(Tiles.flatMap(Occupy));

	for (let Column = 1; Column + Width - 1 <= GridColumn; Column++) {
		for (let Row = 1; Row + Height - 1 <= GridRow; Row++) {
			let Free = true;

			for (let Across = Column; Across < Column + Width && Free; Across++) {
				for (let Down = Row; Down < Row + Height && Free; Down++) {
					Free = !Taken.has(`${Across}:${Down}`);
				}
			}

			if (Free) {
				return { Column, Row };
			}
		}
	}

	return null;
}

export default function Workspace(Props: Props) {
	const [Stage, SetStage] = createSignal(Props.Stages[0]?.Key ?? "");
	const [Active, SetActive] = createSignal(Props.Columns[0]?.Key ?? "");
	const [View, SetView] = createSignal<DrawerView>("list");
	const [Open, SetOpen] = createSignal<string | null>(null);
	const [Published, SetPublished] = createSignal<Tile[]>(Props.Tiles);

	/** The record the workspace has open, wherever it lives. */
	const Selected = createMemo<Entry | undefined>(() => {
		const Id = Open();

		return Id === null
			? undefined
			: Props.Columns.flatMap((Column) => Column.Entries).find((Entry) => Entry.Id === Id);
	});

	/** The column a record belongs to, which is also the stage it publishes into. */
	const Owner = (Id: string) =>
		Props.Columns.find((Column) => Column.Entries.some((Entry) => Entry.Id === Id));

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

		const Slot = FreeSlot(Published(), 2, 2);

		if (Slot === null) {
			return;
		}

		SetPublished((Current) => [
			...Current,
			{
				Id: Entry.Id,
				Column: Slot.Column,
				Row: Slot.Row,
				ColumnSpan: 2,
				RowSpan: 2,
				Tone: "plain",
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

				<Publish
					Label={Props.Destination}
					Note={Props.Instruction}
					Armed={Selected()?.Title}
				/>

				<Show
					when={View() === "list"}
					fallback={<Bento Tiles={Published()} Column={GridColumn} Row={GridRow} />}>
					<Bento Tiles={Published()} Column={GridColumn} Row={GridRow} />
				</Show>
			</div>
		</div>
	);
}
