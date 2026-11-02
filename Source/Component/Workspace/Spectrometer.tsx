import "@Stylesheet/Component/Spectrometer.scss";
import type { Peer } from "@Library/Band.ts";
import { Label, Protocol, Steps } from "@Library/Capability.ts";
import { For } from "solid-js";

/**
 * The capability spectrometer: the band under the swimlanes.
 *
 * It separates a claim the network makes into the specific protocols that carry
 * it, and shows which of them are running for which peer right now (RFC-0046).
 * One row per peer, one column per step, and the intersection is a state rather
 * than a tick: `running`, `available`, `absent`, and `unknown` when the record
 * behind the cell could not be read.
 *
 * The columns are `Steps` from `@Library/Capability.ts` - the same array the
 * swimlanes above draw - so the two bands cannot disagree about the order of the
 * flow. A column states the protocol that carries it and the record its state is
 * read from, which is what makes a cell checkable: the band is evidence, not a
 * feature list, and a capability with no named protocol prints UNKNOWN instead of
 * a sentence.
 *
 * The band is static. Rows and cells are server-rendered from the props, so a
 * reader with no session sees the peers they are entitled to know about with
 * every cell it cannot prove reading `unknown`; a joined room arrives as another
 * entry in `Peers` and nothing in this file changes. That is also why the band
 * looks incomplete during an early deployment, which is the correct appearance
 * for one.
 */
interface Props {
	Peers: readonly Peer[];
	/** The band's eyebrow. */
	Eyebrow: string;
	/** The band's heading. */
	Title: string;
	/** The sentence under the heading: what the band is not claiming. */
	Note: string;
	/** What the leading column calls a row, e.g. `peer`. */
	RowLabel: string;
}

export default function Spectrometer(Props: Props) {
	return (
		<section class="spectrometer" aria-labelledby="spectrometer-heading">
			<header class="spectrometer__head">
				<p class="spectrometer__eyebrow">{Props.Eyebrow}</p>
				<h2 class="spectrometer__title" id="spectrometer-heading">
					{Props.Title}
				</h2>
				<p class="spectrometer__note">{Props.Note}</p>
			</header>

			<div class="spectrometer__table" role="table" aria-label={Props.Title}>
				<div class="spectrometer__row spectrometer__row--head" role="row">
					<p class="spectrometer__peer spectrometer__peer--head" role="columnheader">
						{Props.RowLabel}
					</p>

					<For each={Steps}>
						{(Step) => (
							<div class="spectrometer__capability" role="columnheader">
								<p class="spectrometer__capability-name">{Step.Label}</p>
								<p class="spectrometer__capability-protocol">{Label(Step)}</p>
								<p class="spectrometer__capability-record">{Step.Record}</p>
							</div>
						)}
					</For>
				</div>

				<For each={Props.Peers}>
					{(Peer) => (
						<div class="spectrometer__row" role="row">
							<div class="spectrometer__peer" role="rowheader">
								<p class="spectrometer__peer-kind">{Peer.Kind}</p>
								<p class="spectrometer__peer-name">{Peer.Name}</p>
							</div>

							<For each={Steps}>
								{(Step) => (
									<div
										class="spectrometer__cell"
										role="cell"
										data-state={Peer.Cells[Step.Key] ?? "unknown"}
										data-protocol={Protocol(Step)}>
										<span class="spectrometer__mark" aria-hidden="true" />
										<span class="spectrometer__state">
											{Peer.Cells[Step.Key] ?? "unknown"}
										</span>
									</div>
								)}
							</For>
						</div>
					)}
				</For>
			</div>
		</section>
	);
}
