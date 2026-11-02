import "@Stylesheet/Component/Publish.scss";
import { StateOf } from "@Library/ComponentState.ts";
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
 * The label is a control rather than a caption, because publishing is the one
 * verb that crosses this seam (RFC-0043 §4). A reader who may not publish is
 * shown the control in `locked` rather than without it (RFC-0049 rule 4,
 * RFC-0054 §3): the state keeps the label's ink and adds a lock glyph, and the
 * note states the reason. A hidden verb teaches nothing; a locked one teaches
 * the one rule the product has.
 *
 * The state is derived from one fact - the reason it is locked, or the absence
 * of one - so the control cannot be rendered as a dead end: `StateOf` refuses a
 * locked state with nothing written on it. `aria-disabled` rather than `disabled`
 * is the same distinction in markup: the control stays reachable by a keyboard
 * and readable by a screen reader, which a `disabled` attribute would take away.
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
	/**
	 * Why a drop cannot cross here, or `undefined` when it can. A string rather
	 * than a flag: the reason is the whole content of the `locked` state.
	 */
	Locked?: string;
	/** What a press on the seam publishes. Absent when the surface carries no verb. */
	OnPublish?: () => void;
}

/** The id the reason is described by. A composition draws one seam. */
const ReasonId = "publish-reason";

export default function Publish(Props: Props) {
	/** The control's state, from the one fact the seam has (RFC-0049). */
	const Control = () => StateOf({ Locked: Props.Locked });

	/** Whether a drop can cross. The reason, when there is one, is already stated. */
	const Locked = () => Control().State === "locked";

	return (
		<div class="publish">
			<button
				type="button"
				class="publish__control"
				data-control-state={Control().State}
				aria-disabled={Locked() ? "true" : undefined}
				aria-describedby={Locked() ? ReasonId : undefined}
				onClick={() => {
					if (Locked()) {
						return;
					}

					Props.OnPublish?.();
				}}>
				<span class="publish__step" aria-hidden="true">
					<Icon Name="chevron-left" />
				</span>
				<span class="publish__label">{Props.Label}</span>
				<span class="publish__step" aria-hidden="true">
					<Icon Name="chevron-right" />
				</span>

				<Show when={Locked()}>
					<Icon Name="lock" Class="publish__lock" />
				</Show>
			</button>

			<div class="publish__rule" />

			<p class="publish__note" id={Locked() ? ReasonId : undefined}>
				<Icon Name={Locked() ? "lock" : "arrow-down-circle"} />
				<Show
					when={Locked()}
					fallback={
						<Show when={Props.Context} fallback={<span>{Props.Note}</span>}>
							{/* One template, not three text nodes around an interpolation: Solid
							    renders `{Note} · {Context} timeline` with the space after the
							    dot inside the dynamic block, so the first update replaces it
							    and the line reads `·Source`. A single expression has no
							    boundary for the update to fall on. */}
							<span>{`${Props.Note} · ${Props.Context} timeline selected`}</span>
						</Show>
					}>
					<span>{Control().Reason}</span>
				</Show>
			</p>
		</div>
	);
}
