import "@Stylesheet/Component/Publish.scss";
import { Show } from "solid-js";
import Icon from "./Icon.tsx";

/**
 * The seam between the private drawer and the published canvas.
 *
 * It states one thing - what a drop lands on - and it is the only element in the
 * composition that faces both directions: the label names the destination, the
 * note names the standing instruction and the stage that would receive the drop.
 *
 * The note names a **stage**, never a record. A record's title there would change
 * on every selection and turn a static band into a status bar, which is not what
 * the composition draws: the file's note reads `Drop private items here to
 * publish · Source timeline selected`, and `Source` is the selected stage.
 *
 * Keeping this a separate component is what lets the drawer and the canvas each
 * stay unaware of the other.
 */
interface Props {
	/** The destination, e.g. `Showcase · Network`. */
	Label: string;
	/** The standing instruction, e.g. `Drop private items here to publish`. */
	Note: string;
	/** The stage a drop would file into, e.g. `Source`. Omitted when nothing is selected. */
	Context?: string;
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
				<Show when={Props.Context} fallback={<span>{Props.Note}</span>}>
					{/* One template, not three text nodes around an interpolation: Solid
					    renders `{Note} · {Context} timeline` with the space after the
					    dot inside the dynamic block, so the first update replaces it
					    and the line reads `·Source`. A single expression has no
					    boundary for the update to fall on. */}
					<span>{`${Props.Note} · ${Props.Context} timeline selected`}</span>
				</Show>
			</p>
		</div>
	);
}
