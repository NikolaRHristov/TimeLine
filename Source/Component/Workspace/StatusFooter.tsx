import type { StatusItem } from "@Library/Band.ts";
import "@Stylesheet/Component/StatusFooter.scss";
import { For } from "solid-js";

/**
 * The status footer: the composition's bottom band.
 *
 * Every value in it is a state of the connection or of the queue, never a count
 * of content (RFC-0048 §1). The canvas above already states what was published;
 * this band states whether the machine can be trusted to publish it, which is
 * the question a reader asks when the page looks current and is not.
 *
 * Degraded is a state, never a grey (§4). A disconnected footer is not a dimmed
 * connected one: it prints `disconnected`, in the same ink and at the same weight
 * as `connected`, because a status indicator that looks slightly different when
 * it is broken is read as working. The items therefore carry no tone at all -
 * the word is the whole signal - and the band's ink does not change with the
 * state it reports.
 *
 * The band is rendered from the build with `static` rather than omitted (§
 * Consequences): a missing footer is indistinguishable from a broken one, and
 * the live layer is exactly the thing that is not running when a reader needs to
 * know whether what they are reading is current. `static` is the build's own
 * view, the same word the session layer uses for it.
 */
interface Props {
	Items: readonly StatusItem[];
	/** The band's eyebrow. */
	Eyebrow: string;
	/** What the band is, for a screen reader. */
	Label: string;
}

export default function StatusFooter(Props: Props) {
	return (
		<footer class="status" aria-label={Props.Label}>
			<p class="status__eyebrow">{Props.Eyebrow}</p>

			<dl class="status__list">
				<For each={Props.Items}>
					{(Item) => (
						<div class="status__item" data-key={Item.Key}>
							<dt class="status__label">{Item.Label}</dt>
							<dd class="status__value">{Item.Value}</dd>
						</div>
					)}
				</For>
			</dl>
		</footer>
	);
}
