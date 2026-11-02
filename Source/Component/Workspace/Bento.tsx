import "@Stylesheet/Component/Bento.scss";
import { Occupy, Seats, type Tile } from "@Script/Workspace/Seat.ts";
import { For, Show } from "solid-js";

/**
 * The seat table and the tile shape, re-exported for the pages that build them.
 *
 * They live in `@Script/Workspace/Seat.ts` because two callers read them and only
 * this one draws: the store hands a published record the next free seat, and a
 * store that reached into this file for the table would also ship this sheet to
 * every page that mounts a rail. The canvas stays their documented home for the
 * composition - a page still reads `Seats` here.
 */
export { Seats };
export type { Tile };

const Tone = {
	plain: "bento__tile--plain",
	quiet: "bento__tile--quiet",
	sunken: "bento__tile--sunken",
};

/**
 * The seats the mosaic still has empty.
 *
 * A thin archive is a normal state, so the canvas is completed from its own seat
 * table rather than left ragged or reflowed: a seat is empty when none of its
 * cells carry a record, and it keeps the grey its rank gives it. The fill is
 * derived from the placed tiles, never stored, so a tile that arrives in the data
 * simply takes its seat and the empty set shrinks by one.
 */
function Empty(Tiles: readonly Tile[]): Tile[] {
	const Taken = new Set(Tiles.flatMap(Occupy));

	return Seats.filter((Seat) => !Occupy(Seat).some((Cell) => Taken.has(Cell)));
}

export default function Bento(Props: { Tiles: readonly Tile[] }) {
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
							}}>
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
