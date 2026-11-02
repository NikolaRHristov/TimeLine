import "@Stylesheet/Component/SecurityCluster.scss";
import type { ProtocolMark } from "@Library/Capability.ts";
import { For } from "solid-js";

/**
 * The rail's security cluster: the protocol marks, bottom-aligned in the rail.
 *
 * It is one instrument read across two columns with the status footer (RFC-0048
 * §2): the rail is the only surface present on every workspace page, so it is
 * the only place a persistent status can live without repeating itself, and the
 * cluster's last line sits on the footer's own baseline.
 *
 * A mark without a state is not drawn (§3). Each one carries `engaged`,
 * `available` or `absent` and the note that says what the protocol does, so a
 * mark is a claim with a record behind it rather than a badge: decoration in a
 * security surface reads as an assurance nobody gave. The set is closed and
 * small - the protocols RFC-0013 and RFC-0026 actually name - and a protocol this
 * deployment does not implement is not drawn at all.
 *
 * The state is drawn as a change of the mark's own shape rather than of its
 * colour, for the same reason the footer's states are words: a colour is not a
 * claim, and two deployments will not agree on what a tinted mark means. `absent`
 * is drawn, never omitted - a protocol that was engaged and is no longer engaged
 * reads `absent`, not a faded `engaged`.
 */
interface Props {
	Marks: readonly ProtocolMark[];
	/** The cluster's eyebrow. */
	Eyebrow: string;
	/** What the cluster is, for a screen reader. */
	Label: string;
}

export default function SecurityCluster(Props: Props) {
	return (
		<aside class="security" aria-label={Props.Label}>
			<p class="security__eyebrow">{Props.Eyebrow}</p>

			<ul class="security__marks">
				<For each={Props.Marks}>
					{(Mark) => (
						<li class="security__mark" data-state={Mark.State}>
							<span class="security__mark-shape" aria-hidden="true" />
							<span class="security__mark-name">{Mark.Name}</span>
							<span class="security__mark-state">{Mark.State}</span>
							<span class="security__mark-note">{Mark.Note}</span>
						</li>
					)}
				</For>
			</ul>
		</aside>
	);
}
