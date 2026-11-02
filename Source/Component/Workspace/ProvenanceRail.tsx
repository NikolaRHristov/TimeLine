import { createSignal } from "solid-js";
import Provenance, { type Stage } from "./Provenance.tsx";

/**
 * The rail as a page draws it: the drum, and the one signal the drum needs.
 *
 * `Provenance` is a function of its props - it draws thirteen bands and marks
 * the selected one - so the selection lives with whoever mounts it. The
 * workspace holds that signal itself, because the stage also drives its drawer;
 * a page that reads one record's trail has nothing else to coordinate, so the
 * signal lives here.
 *
 * This exists so the rail is never drawn unwired: the bands are `<button>`s, and
 * a button that answers a press with nothing is a control that lies about being
 * one. A page that mounts this hydrates on visibility; a page that only prints
 * the rail's content does not mount it at all.
 */
interface Props {
	Stages: Stage[];
	/** The stage the rail opens on; empty when no event touched the record. */
	Initial: string;
	/** The standing line under the rail's scroll bar. */
	Note: string;
}

export default function ProvenanceRail(Props: Props) {
	const [Selected, SetSelected] = createSignal(Props.Initial);

	return (
		<Provenance
			Stages={Props.Stages}
			Selected={Selected()}
			Note={Props.Note}
			OnSelect={(Key) => SetSelected(Key)}
		/>
	);
}
