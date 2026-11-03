import type { ProtocolMark } from "@Library/Capability.ts";
import "@Stylesheet/Component/Workspace.scss";
import { type Stage } from "./Provenance.tsx";
import ProvenanceRail from "./ProvenanceRail.tsx";
import SecurityCluster from "./SecurityCluster.tsx";

/**
 * The rail: the drum, and the security cluster on the composition's bottom line.
 *
 * The drum is `ProvenanceRail` and stays exactly the block the design states -
 * 224 wide, 360 tall, three flush blocks with no slack - so the frame's measured
 * proportions survive. The cluster is not part of it: the rail is a column that
 * runs the height of the composition, the drum is the block at the top of that
 * column, and the cluster is bottom-aligned in it (RFC-0048 §2).
 *
 * That arrangement is what lets one status line read across two columns: the
 * cluster's last mark sits on the same horizontal as the status footer's last
 * item, so a reader scanning the left edge and the bottom edge reads one
 * instrument rather than two widgets. A cluster beside the footer would repeat
 * the footer; a cluster inside the 360px drum would overflow it.
 *
 * The drum is mounted as `ProvenanceRail` rather than as `Provenance` for the
 * reason that component exists: its bands are buttons, and a button that answers
 * a press with nothing lies about being a control. The cluster is static, so the
 * whole column is one island and a page that mounts it gets both.
 */
interface Props {
	Stages: Stage[];
	/** The stage the drum opens on; empty when no event touched the record. */
	Initial: string;
	/** The standing note under the scroll bar. */
	Note: string;
	/** The protocol marks the cluster draws, each with its state. */
	Marks: readonly ProtocolMark[];
	/** The cluster's eyebrow. */
	ClusterEyebrow: string;
	/** What the cluster is, for a screen reader. */
	ClusterLabel: string;
}

export default function Rail(Props: Props) {
	return (
		<div class="rail">
			<ProvenanceRail Stages={Props.Stages} Initial={Props.Initial} Note={Props.Note} />

			<SecurityCluster
				Marks={Props.Marks}
				Eyebrow={Props.ClusterEyebrow}
				Label={Props.ClusterLabel}
			/>
		</div>
	);
}
