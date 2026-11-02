import "@Stylesheet/Component/Bento.scss";
import { For, Show } from "solid-js";

/**
 * One published tile.
 *
 * Placement is data: the tile names the column and row it starts at and how many
 * tracks it spans. That is what makes the canvas a template - the same sheet
 * draws a single hero or a ten-tile mosaic, and rearranging the page is a change
 * to the array, not to the stylesheet.
 */
export interface Tile {
	/** The record the tile renders; empty tiles carry a synthetic id. */
	Id: string;
	Column: number;
	Row: number;
	ColumnSpan: number;
	RowSpan: number;
	/** Which of the three greys the tile is filled with. */
	Tone?: "plain" | "quiet" | "sunken";
	/** The small line above the title. */
	Eyebrow?: string;
	Title?: string;
	Meta?: string;
	Href?: string;
	/** The stage accent drawn along the top edge. */
	Stage?: string;
}

interface Props {
	Tiles: Tile[];
}

/**
 * The composition's canvas, as ten seats.
 *
 * The mosaic is the design, not a consequence of how many records exist: a hero
 * three columns wide beside a stacked pair, a tall column closing the right edge,
 * then that rhythm mirrored underneath. Stating it as a table is what lets a thin
 * archive draw the same page - a record takes the next seat and the seats after it
 * stay empty at their own grey, so the layout never reflows around the data.
 *
 * The three greys are the seat's rank rather than its state: `sunken` is the
 * loudest at `#e2e2e2`, `plain` the middle at `#e9e9e9`, `quiet` the softest at
 * `#eee`. A seat keeps its grey whether or not a record has landed on it, which
 * is what makes the hierarchy readable on an empty canvas.
 */
export const Seats: Tile[] = [
	{ Id: "seat-1", Column: 1, Row: 1, ColumnSpan: 3, RowSpan: 2, Tone: "plain" },
	{ Id: "seat-2", Column: 4, Row: 1, ColumnSpan: 2, RowSpan: 1, Tone: "quiet" },
	{ Id: "seat-3", Column: 6, Row: 1, ColumnSpan: 1, RowSpan: 2, Tone: "plain" },
	{ Id: "seat-4", Column: 4, Row: 2, ColumnSpan: 1, RowSpan: 1, Tone: "sunken" },
	{ Id: "seat-5", Column: 5, Row: 2, ColumnSpan: 1, RowSpan: 1, Tone: "plain" },
	{ Id: "seat-6", Column: 1, Row: 3, ColumnSpan: 1, RowSpan: 2, Tone: "quiet" },
	{ Id: "seat-7", Column: 2, Row: 3, ColumnSpan: 2, RowSpan: 1, Tone: "plain" },
	{ Id: "seat-8", Column: 4, Row: 3, ColumnSpan: 3, RowSpan: 2, Tone: "sunken" },
	{ Id: "seat-9", Column: 2, Row: 4, ColumnSpan: 1, RowSpan: 1, Tone: "sunken" },
	{ Id: "seat-10", Column: 3, Row: 4, ColumnSpan: 1, RowSpan: 1, Tone: "quiet" },
];

const Tone = {
	plain: "bento__tile--plain",
	quiet: "bento__tile--quiet",
	sunken: "bento__tile--sunken",
};

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
 * The seats the mosaic still has empty.
 *
 * A thin archive is a normal state, so the canvas is completed from its own seat
 * table rather than left ragged or reflowed: a seat is empty when none of its
 * cells carry a record, and it keeps the grey its rank gives it. The fill is
 * derived from the placed tiles, never stored, so a tile that arrives in the data
 * simply takes its seat and the empty set shrinks by one.
 */
function Empty(Tiles: Tile[]): Tile[] {
	const Taken = new Set(Tiles.flatMap(Occupy));

	return Seats.filter((Seat) => !Occupy(Seat).some((Cell) => Taken.has(Cell)));
}

export default function Bento(Props: Props) {
	const All = () => [...Props.Tiles, ...Empty(Props.Tiles)];

	return (
		<div class="bento" role="list">
			<For each={All()}>
				{(Tile) => {
					const Filled = Tile.Title !== undefined;

					return (
						<article
							role="listitem"
							class="bento__tile"
							classList={{
								[Tone[Tile.Tone ?? "plain"]]: true,
								"bento__tile--filled": Filled,
							}}
							style={{
								"grid-column": `${Tile.Column} / span ${Tile.ColumnSpan}`,
								"grid-row": `${Tile.Row} / span ${Tile.RowSpan}`,
								"--tile-stage": Tile.Stage ?? "transparent",
							}}>
							<Show when={Tile.Stage !== undefined}>
								<span class="bento__stage" />
							</Show>

							<Show when={Filled}>
								<Show when={Tile.Eyebrow !== undefined}>
									<p class="bento__eyebrow">{Tile.Eyebrow}</p>
								</Show>

								<h2 class="bento__title">{Tile.Title}</h2>

								<Show when={Tile.Meta !== undefined}>
									<p class="bento__meta">{Tile.Meta}</p>
								</Show>

								<Show when={Tile.Href !== undefined}>
									<a class="bento__link" href={Tile.Href}>
										Read
									</a>
								</Show>
							</Show>
						</article>
					);
				}}
			</For>
		</div>
	);
}
