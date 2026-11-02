import { Show } from "solid-js";
import Icon from "./Icon.tsx";

/**
 * The seam between the private drawer and the public canvas.
 *
 * It states one thing - what a drop lands on - and it is the only element in the
 * composition that faces both directions: the label names the destination, the
 * note names the thing being dropped and where it came from. Keeping it a
 * separate component is what lets the drawer and the canvas each stay unaware of
 * the other.
 */
interface Props {
	/** The destination, e.g. `Showcase · Network`. */
	Label: string;
	/** The standing instruction under the rule. */
	Note: string;
	/** The stage the drop will file into, shown when something is armed. */
	Armed?: string;
}

export default function Publish(Props: Props) {
	return (
		<div class="publish">
			<div class="publish__group">
				<span class="publish__step" aria-hidden="true">
					<Icon Name="chevron-left" />
				</span>
				<span class="publish__label">{Props.Label}</span>
				<span class="publish__step" aria-hidden="true">
					<Icon Name="chevron-right" />
				</span>
			</div>

			<div class="publish__rule" />

			<p class="publish__note">
				<Icon Name="arrow-down-circle" />
				<Show when={Props.Armed !== undefined} fallback={<span>{Props.Note}</span>}>
					<span>
						{Props.Note} · {Props.Armed}
					</span>
				</Show>
			</p>
		</div>
	);
}
