import "@Stylesheet/Component/Swimlanes.scss";
import type { Lane } from "@Library/Band.ts";
import { Steps } from "@Library/Capability.ts";
import { For } from "solid-js";

/**
 * The trust swimlanes: the band between the canvas and the spectrometer.
 *
 * One lane per actor, laid out along the same four steps the spectrometer uses
 * as its columns, so the two bands read as one diagram cut into two rows of
 * space. A lane is an actor and never a person (RFC-0047 §1): a person holds
 * grants inside a lane, and drawing one as a lane would make the band grow with
 * membership instead of with relationships.
 *
 * Two arrows are always drawn, and they face opposite ways, because trust runs
 * in two directions and one arrow is a lie (RFC-0047 §2): the provider
 * authenticates the network inbound, and the network authorises the provider to
 * `see` outbound. The two halves have different owners, which is why the band
 * makes the attribution visible instead of collapsing it into a badge.
 *
 * The band is static. Every lane is server-rendered from the props, and a lane
 * that depends on a joined room arrives as another entry in `Lanes` when a
 * session has one - there is no client-only node here, which is why the band
 * renders identically with scripts switched off. With no relationship at all the
 * page passes the provider and the owner's own network, and each step reads
 * `absent` rather than as a shorter arrow: a step a lane has not reached is a
 * fact the band knows.
 *
 * The lane pitch is deliberately greater than the canvas's 20px grid gap
 * (RFC-0047 §5). A lane carries a direction, and a diagram needs air between its
 * rows to read as flow rather than as a table; `verify-composition.mjs` measures
 * the gap against the canvas's own.
 */
interface Props {
	Lanes: readonly Lane[];
	/** The band's eyebrow. */
	Eyebrow: string;
	/** The band's heading. */
	Title: string;
	/** The sentence under the heading: what the band is not saying. */
	Note: string;
}

/**
 * The two directions, as the band always draws them.
 *
 * They are markup rather than data: a single arrow in either direction would
 * state one half of a handshake as if it were the whole thing, so both are
 * structural and no lane list can remove one. Each sentence already names the
 * step it carries, which is why the arrow does not repeat the step's word at its
 * head - `provider authenticates the network · authenticate` said the same thing
 * twice in two voices.
 */
const Arrows = [
	{
		Direction: "in" as const,
		Head: "\u2192",
		Label: "provider authenticates the network",
	},
	{
		Direction: "out" as const,
		Head: "\u2190",
		Label: "network authorises the provider to see",
	},
];

export default function Swimlanes(Props: Props) {
	return (
		<section class="swimlanes" aria-labelledby="swimlanes-heading">
			<header class="swimlanes__head">
				<div class="swimlanes__identity">
					<p class="swimlanes__eyebrow">{Props.Eyebrow}</p>
					<h2 class="swimlanes__title" id="swimlanes-heading">
						{Props.Title}
					</h2>
				</div>
				<p class="swimlanes__note">{Props.Note}</p>
			</header>

			<div class="swimlanes__flow">
				<For each={Arrows}>
					{(Arrow) => (
						<p class="swimlanes__arrow" data-direction={Arrow.Direction}>
							<span class="swimlanes__arrow-head" aria-hidden="true">
								{Arrow.Head}
							</span>
							<span class="swimlanes__arrow-label">{Arrow.Label}</span>
							<span class="swimlanes__arrow-rule" aria-hidden="true" />
						</p>
					)}
				</For>
			</div>

			<div class="swimlanes__axis" aria-hidden="true">
				<p class="swimlanes__axis-label">actor · layer</p>
				<For each={Steps}>{(Step) => <p class="swimlanes__axis-step">{Step.Label}</p>}</For>
			</div>

			<ol class="swimlanes__lanes">
				<For each={Props.Lanes}>
					{(Lane) => (
						<li class="swimlane" data-kind={Lane.Kind}>
							<div class="swimlane__actor">
								<p class="swimlane__kind">{Lane.Kind}</p>
								<p class="swimlane__name">{Lane.Name}</p>
								<p class="swimlane__layer">{Lane.Layer}</p>
							</div>

							<For each={Steps}>
								{(Step) => (
									<div
										class="swimlane__step"
										data-state={Lane.Steps[Step.Key] ?? "unknown"}>
										<span class="swimlane__mark" aria-hidden="true" />
										<span class="swimlane__state">
											{Lane.Steps[Step.Key] ?? "unknown"}
										</span>
										{/* The axis above names the step, so the cell prints only
										    the state; without this line a screen reader would
										    hear four bare states with nothing to attach them
										    to. */}
										<span class="swimlane__step-name">{Step.Label}</span>
									</div>
								)}
							</For>
						</li>
					)}
				</For>
			</ol>
		</section>
	);
}
