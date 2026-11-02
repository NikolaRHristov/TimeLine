import { store } from "@Script/Workspace/Store.ts";
import Provenance, { type Stage } from "./Provenance.tsx";

/**
 * The rail as a page draws it: the drum, reading the workspace store.
 *
 * `Provenance` is a function of its props - it draws thirteen bands and marks
 * the selected one - so the selection lives in the store, and a page that mounts
 * this hands over only what the build produced. That is what lets a rail and a
 * body be separate islands on one page: both read the same stage, so a press here
 * is a selection there, without either component passing a value to the other.
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
	const Store = store();

	Store.Adopt({ Stages: Props.Stages, Stage: Props.Initial });

	return (
		<Provenance
			Stages={Props.Stages}
			Selected={Store.State.Stage}
			Note={Props.Note}
			OnSelect={(Key) => Store.Select(Key)}
		/>
	);
}
