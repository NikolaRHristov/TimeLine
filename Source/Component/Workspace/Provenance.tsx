import "@Stylesheet/Component/Provenance.scss";
import { For, Show } from "solid-js";

export interface Stage {
	/** The stage's stable key, which is also the value a selection holds. */
	Key: string;
	/** What the band prints, e.g. `Ingestion · 3 events`. */
	Label: string;
	/** The accent this stage owns, as a CSS colour. */
	Tone: string;
	/** How many events sit on the track; the widest band sets the scale. */
	Events: number;
	/** The caption under the selected band only. */
	Caption?: string;
}

interface Props {
	Stages: Stage[];
	Selected: string;
	Note: string;
	OnSelect?: (Key: string) => void;
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
	const SelectedIndex = () => {
		const Found = Props.Stages.findIndex((Entry) => Entry.Key === Props.Selected);

		return Found === -1 ? 0 : Found;
	};

	const Widest = () => Math.max(1, ...Props.Stages.map((Entry) => Entry.Events));

	const Depth = (Index: number) => {
		const Distance = Math.abs(Index - SelectedIndex());

		return Ladder[Math.min(Distance, Ladder.length - 1)];
	};

	const Progress = (Entry: Stage) => `${Math.round((Entry.Events / Widest()) * 100)}%`;

	return (
		<aside class="provenance" aria-label="Provenance">
			<div class="provenance__header">
				<p class="provenance__eyebrow">Provenance</p>
				<p class="provenance__title">Ingestion timeline</p>
			</div>

			<div class="provenance__drum" role="list">
				<For each={Props.Stages}>
					{(Entry, Index) => {
						const Step = () => Depth(Index());
						const Active = () => Entry.Key === Props.Selected;

						return (
							<button
								type="button"
								role="listitem"
								class="provenance__band"
								classList={{ "provenance__band--selected": Active() }}
								style={{
									"--band-height": `${Step().Height}px`,
									"--band-opacity": `${Step().Opacity}`,
									"--band-tone": Entry.Tone,
									"--track-height": `${Step().Track}px`,
									"--band-progress": Progress(Entry),
									"--band-label-size": `${Step().Label}px`,
									"--marker-size": `${Step().Marker}px`,
									"--marker-radius": `${Step().Radius}px`,
									"--marker-border": `${Step().Border}px`,
									"--marker-top": `${Step().Top}px`,
								}}
								aria-pressed={Active()}
								onClick={() => Props.OnSelect?.(Entry.Key)}>
								<Show when={Step().Label > 0}>
									<span class="provenance__band-label">{Entry.Label}</span>
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

								<Show when={Active() && Entry.Caption !== undefined}>
									<span class="provenance__caption">{Entry.Caption}</span>
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
