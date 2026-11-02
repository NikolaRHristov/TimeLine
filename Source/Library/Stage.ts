/**
 * The one stage-to-accent map.
 *
 * A stage key is a stable word - `source`, `ingestion`, `review` - and the
 * accent it owns is a token declared in `Stylesheet/Global.css`. This module is
 * the only place that answers "which colour does this stage draw", so a page, a
 * sheet and a component cannot disagree about it and a new stage is one entry
 * here plus one token there.
 *
 * The values are `var(...)` references rather than hexes on purpose: the palette
 * lives in `Global.css`, where a theme would change it, and a second copy of a
 * colour in TypeScript would be a second palette. A page passes one of these to
 * a component as a custom property (`--band-tone`, `--ghost-tone`,
 * `--tile-stage`), so the colour still resolves at paint time.
 *
 * `Documentation/Skill/Tool-Archive/Reference/TokenContract.mjs` enforces the
 * arrangement: it fails the build when another module names a stage accent, or
 * when a stage token is declared in `Global.css` and left out of this table.
 * A sheet may read a stage token directly - that is a use, not a map.
 */

/** The pipeline stages, in the order an event moves through them. */
export type StageKey = "source" | "ingestion" | "processing" | "review";

/** The stage a drawer column feeds. A column is a bucket; a stage is a step. */
export const ColumnStage = {
	bookmark: "source",
	voted: "file",
	curated: "template",
	author: "publish",
} as const;

export type ColumnKey = keyof typeof ColumnStage;

/** Every key an accent is declared for: the four steps, plus the three kinds. */
export type AccentKey = StageKey | (typeof ColumnStage)[ColumnKey];

/**
 * The accent each stage owns, as the token that carries it.
 *
 * One entry per `--stage-*` declaration in `Global.css`, and no entry without
 * one. The four pipeline steps come first because they are the axis the rail
 * draws; the three kinds follow, because a column publishes into one of them
 * rather than into a step.
 */
export const StageAccent: Record<AccentKey, string> = {
	source: "var(--stage-source)",
	ingestion: "var(--stage-ingestion)",
	processing: "var(--stage-processing)",
	review: "var(--stage-review)",
	publish: "var(--stage-publish)",
	file: "var(--stage-file)",
	template: "var(--stage-template)",
};

/** The accent a drawer column draws its selected row and its drop ghost in. */
export function ColumnAccent(Key: ColumnKey): string {
	return StageAccent[ColumnStage[Key]];
}
