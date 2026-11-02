import "@Stylesheet/Component/Provenance.scss";
import { Content } from "@Library/Content.ts";
import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

export interface Stage {
	/** The stage's stable key, which is also the value a selection holds. */
	Key: string;
	/** What the band prints, e.g. `Ingestion · 3 events`. */
	Label: string;
	/**
	 * The accent this stage owns, as a CSS colour.
	 *
	 * A pipeline stage names an accent from `Library/Stage.ts`. A section of a
	 * showcase page is not a stage, so it passes a neutral tone instead
	 * (RFC-0053 rule 3): the drum keeps its depth, and no colour on the rail
	 * claims a pipeline the page is not drawing.
	 */
	Tone: string;
	/** How many events sit on the track; the widest band sets the scale. */
	Events: number;
	/** The caption under the selected band only. */
	Caption?: string;
	/**
	 * Where the band leads, when the drum is a table of contents.
	 *
	 * A band with a destination is an `<a>`: a contents rail is navigation, and
	 * a press on it must work with no script running. A band without one stays
	 * a `<button>`, because the pipeline rail's press moves a selection rather
	 * than a document.
	 */
	Href?: string;
}

interface Props {
	Stages: Stage[];
	Selected: string;
	Note: string;
	OnSelect?: (Key: string) => void;
	/**
	 * The drum's header. The pipeline rail states its own; a contents rail
	 * passes its own words, because `Ingestion timeline` over a table of
	 * contents would name a pipeline the page is not drawing.
	 */
	Eyebrow?: string;
	Title?: string;
}

/**
 * The depth ladder.
 *
 * The composition draws thirteen bands whose height, opacity, marker size and
 * corner radius all ramp away from the selected stage. That ramp is the
 * perspective, so it is stated once here as a table indexed by distance from the
 * selection - a stage further away than the last entry reuses the last entry,
 * which is what lets the rail hold any number of stages without a new rule.
 */
const Ladder = [
	{ Height: 44, Opacity: 1, Label: 10, Track: 12, Marker: 12, Radius: 6, Border: 2, Top: 0 },
	{ Height: 28, Opacity: 0.72, Label: 9, Track: 14, Marker: 12, Radius: 6, Border: 2, Top: 1 },
	{ Height: 22, Opacity: 0.55, Label: 8, Track: 12, Marker: 10, Radius: 5, Border: 1, Top: 0 },
	{ Height: 16, Opacity: 0.38, Label: 0, Track: 16, Marker: 10, Radius: 5, Border: 1, Top: 3 },
	{ Height: 12, Opacity: 0.28, Label: 0, Track: 12, Marker: 8, Radius: 4, Border: 1, Top: 2 },
	{ Height: 10, Opacity: 0.22, Label: 0, Track: 10, Marker: 6, Radius: 3, Border: 1, Top: 2 },
	{ Height: 8, Opacity: 0.18, Label: 0, Track: 8, Marker: 6, Radius: 3, Border: 1, Top: 1 },
];

/** Where the three events on a track sit, as a fraction of the progress bar. */
const Marks = [0.12, 0.45, 0.78];

export default function Provenance(Props: Props) {
	/**
	 * The drum's header, in the words of whoever mounted it.
	 *
	 * The fallback is the content layer rather than a literal: a sentence
	 * written into a component is the one thing RFC-0053's copy rule forbids,
	 * and a pipeline rail is the shape most callers want.
	 */
	const Eyebrow = () => Props.Eyebrow ?? Content.Provenance.Eyebrow;
	const Title = () => Props.Title ?? Content.Provenance.Title;

	/**
	 * Whether this drum is a table of contents.
	 *
	 * One value decides the whole arrangement, so a rail cannot end up half
	 * linked: with destinations the bands are links inside a navigation
	 * landmark, without them they are buttons inside a list.
	 */
	const Contents = () => Props.Stages.some((Entry) => Entry.Href !== undefined);

	const SelectedIndex = () => {
		const Found = Props.Stages.findIndex((Entry) => Entry.Key === Props.Selected);

		return Found === -1 ? 0 : Found;
	};

	const Widest = () => Math.max(1, ...Props.Stages.map((Entry) => Entry.Events));

	/**
	 * The drum always draws the full ladder, whatever the number of stages.
	 *
	 * The perspective is the whole point of the rail: thirteen bands, tallest and
	 * most opaque in the middle, fading outward. One band per stage collapses that
	 * to a list the moment an archive has four stages - which is every archive -
	 * and four bands at 44/28/22/16 read as a stack of bars, not a cylinder. So the
	 * slots are fixed and the stage under each slot is taken from the list and
	 * cycled: the drum stays continuous, and a fifth stage changes what is labelled
	 * rather than how many bands exist.
	 */
	const Span = 6;
	const Slots = Array.from({ length: Span * 2 + 1 }, (_, Index) => Index - Span);

	const Empty: Stage = { Key: "", Label: "", Tone: "transparent", Events: 0 };

	/**
	 * The stage a slot shows, and whether that stage is real.
	 *
	 * A slot inside the stage list is a real stage: it is data, it is labelled, and
	 * it can be selected. A slot past either end is a ghost - it repeats the stage
	 * its distance lands on, so the cylinder keeps a continuous palette instead of
	 * ending in six empty rings, but it is depth rather than data and is therefore
	 * never labelled. That distinction is what keeps a four-stage archive from
	 * printing the same stage name twice in one stack.
	 */
	const Band = (Distance: number): { Entry: Stage; Real: boolean } => {
		const Count = Props.Stages.length;

		if (Count === 0) {
			return { Entry: Empty, Real: false };
		}

		const Index = SelectedIndex() + Distance;

		return {
			Entry: Props.Stages[Index] ?? Props.Stages[((Index % Count) + Count) % Count] ?? Empty,
			Real: Index >= 0 && Index < Count,
		};
	};

	const Step = (Distance: number) => Ladder[Math.min(Math.abs(Distance), Ladder.length - 1)];

	const Progress = (Entry: Stage) => `${Math.round((Entry.Events / Widest()) * 100)}%`;

	return (
		<aside class="provenance" aria-label={Eyebrow()}>
			<div class="provenance__header">
				<p class="provenance__eyebrow">{Eyebrow()}</p>
				<p class="provenance__title">{Title()}</p>
			</div>

			<div class="provenance__drum" role={Contents() ? "navigation" : "list"}>
				<For each={Slots}>
					{(Distance) => {
						const Slot = () => Band(Distance);
						const Entry = () => Slot().Entry;
						const Shape = () => Step(Distance);
						const Active = () => Distance === 0;

						return (
							<button
								type="button"
								role="listitem"
								class="provenance__band"
								classList={{ "provenance__band--selected": Active() }}
								style={{
									"--band-height": `${Shape().Height}px`,
									"--band-opacity": `${Shape().Opacity}`,
									"--band-tone": Entry().Tone,
									"--track-height": `${Shape().Track}px`,
									"--band-progress": Progress(Entry()),
									"--band-label-size": `${Shape().Label}px`,
									"--marker-size": `${Shape().Marker}px`,
									"--marker-radius": `${Shape().Radius}px`,
									"--marker-border": `${Shape().Border}px`,
									"--marker-top": `${Shape().Top}px`,
								}}
								aria-pressed={Active()}
								onClick={() => Props.OnSelect?.(Entry().Key)}>
								<Show when={Shape().Label > 0 && Slot().Real}>
									<span class="provenance__band-label">{Entry().Label}</span>
								</Show>

								<span class="provenance__track">
									<span class="provenance__progress" />
									<For each={Marks}>
										{(Mark) => (
											<span
												class="provenance__marker"
												style={{
													"--marker-left": `${Math.round(Mark * 100)}%`,
												}}
											/>
										)}
									</For>
								</span>

								<Show when={Active() && Entry().Caption !== undefined}>
									<span class="provenance__caption">{Entry().Caption}</span>
								</Show>
							</button>
						);
					}}
				</For>

				<div class="provenance__fade provenance__fade--top" />
				<div class="provenance__fade provenance__fade--bottom" />
			</div>

			<div class="provenance__scroll">
				<div class="provenance__scroll-track">
					<div class="provenance__scroll-thumb" style={{ "--scroll-thumb": "35%" }} />
				</div>
				<p class="provenance__scroll-note">{Props.Note}</p>
			</div>
		</aside>
	);
}
