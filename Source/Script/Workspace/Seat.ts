/**
 * The canvas's seat table, and the one rule that reads it.
 *
 * The mosaic is the design, not a consequence of how many records exist: a hero
 * three columns wide beside a stacked pair, a tall column closing the right edge,
 * then that rhythm mirrored underneath. Stating it as a table is what lets a thin
 * archive draw the same page - a record takes the next seat and the seats after it
 * stay empty at their own grey, so the layout never reflows around the data.
 *
 * The table lives beside the store rather than inside the canvas because two
 * callers need it and only one of them draws: the canvas fills the seats nobody
 * took, and the store hands a published record the next free one. A store that
 * imported the canvas for its table would also import the canvas's stylesheet,
 * so a page that only mounts a rail would ship a mosaic it never draws.
 */

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
}

/**
 * The composition's canvas, as ten seats.
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

/** The cells a tile occupies, as `column:row` keys. */
export function Occupy(Tile: Tile): string[] {
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
export function FreeSeat(Tiles: readonly Tile[]): Tile | undefined {
	const Taken = new Set(Tiles.flatMap(Occupy));

	return Seats.find((Seat) => !Occupy(Seat).some((Cell) => Taken.has(Cell)));
}
