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
	/** The column and row count the empty fill is computed against. */
	Column: number;
	Row: number;
}

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
 * The empty cells the mosaic still needs.
 *
 * A thin archive is a normal state, so the grid is completed with the quietest
 * tiles rather than left ragged - a page with three posts still reads as a
 * composed layout. The fill is derived from the placed tiles, never stored, so a
 * tile that arrives in the data simply takes its cells and the fill shrinks.
 */
function Empty(Tiles: Tile[], Column: number, Row: number): Tile[] {
	const Taken = new Set(Tiles.flatMap(Occupy));
	const Cells: Tile[] = [];

	for (let Index = 1; Index <= Column; Index++) {
		for (let Track = 1; Track <= Row; Track++) {
			if (Taken.has(`${Index}:${Track}`)) {
				continue;
			}

			Cells.push({
				Id: `empty-${Index}-${Track}`,
				Column: Index,
				Row: Track,
				ColumnSpan: 1,
				RowSpan: 1,
				Tone: "quiet",
			});
		}
	}

	return Cells;
}

export default function Bento(Props: Props) {
	const All = () => [...Props.Tiles, ...Empty(Props.Tiles, Props.Column, Props.Row)];

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
