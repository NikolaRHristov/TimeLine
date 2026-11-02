/**
 * The three bands below the canvas, and the rail's cluster, as one value.
 *
 * The bands answer questions about the network (RFC-0046, RFC-0047, RFC-0048),
 * and every answer in them is a state read from a record. This module is where
 * the build states the records it actually has, so a page does not assemble a
 * band out of literals at each call site and the three bands cannot disagree
 * about who is on the network.
 *
 * What the build knows is small and this file says so rather than filling the
 * gap. Two actors always exist - the service provider and the owner's own
 * network - and no relationship exists yet, so:
 *
 * - a swimlane step reads `absent`: the lane has not reached it, which is a fact
 *   the band knows (RFC-0047 §3);
 * - a spectrometer cell reads `unknown`: the record behind it cannot be read,
 *   which is a different fact and is never collapsed into the first
 *   (RFC-0046 §3);
 * - the status footer reads `static` for the connection and for the sync, the
 *   build's own view of itself, with nothing queued and nothing failed
 *   (RFC-0048 §1).
 *
 * A session replaces these values through the same shapes. Nothing in the bands
 * is client-only, which is why they render identically with scripts switched off
 * and why "hydrate only the cells that need a session" costs no extra markup: the
 * cells that need one are the ones whose state a session overwrites.
 *
 * The cluster's four marks are the protocols RFC-0013 pins - the record names the
 * key agreement, the derivation and the cipher, and its client is `crypto.subtle`
 * - plus the suite RFC-0046's label names. `available` means the deployment can
 * engage a protocol and this session has not; `absent` means it cannot, which is
 * why ChaCha20-Poly1305 is drawn as absent rather than left out: WebCrypto has no
 * ChaCha20, so a claim that the site engages it would be false.
 */
import {
	Steps,
	Unreached,
	Unread,
	type CapabilityState,
	type Layer,
	type ProtocolMark,
} from "./Capability.ts";

/** One lane of the swimlanes band: an actor, its layer and its four steps. */
export interface Lane {
	/** The stable key the lane is addressed by. */
	Key: string;
	/** What kind of actor it is, stated rather than inferred from the name. */
	Kind: "provider" | "network" | "peer" | "room";
	/** What the lane prints as its name. */
	Name: string;
	/** The highest layer the lane reaches (RFC-0047 §6). */
	Layer: Layer;
	/** The state of each step for this actor, keyed by `Step.Key`. */
	Steps: Record<string, CapabilityState>;
}

/** One row of the spectrometer: a peer and its capability states. */
export interface Peer {
	/** The stable key the row is addressed by. */
	Key: string;
	/** What kind of peer it is, stated rather than inferred from the name. */
	Kind: "provider" | "network" | "peer" | "room";
	/** What the row prints as its name. */
	Name: string;
	/** The state of each capability for this peer, keyed by `Step.Key`. */
	Cells: Record<string, CapabilityState>;
}

/** One item of the status footer: what it reports on, and the state. */
export interface StatusItem {
	/** The stable key the item is addressed by. */
	Key: string;
	/** What the item reports on, e.g. `connection`. */
	Label: string;
	/** The state, as a word: `static`, `connected`, `syncing`, `0`. */
	Value: string;
}

/** The words each band prints. A band holds no copy of its own. */
export interface BandWords {
	Swimlanes: { Eyebrow: string; Title: string; Note: string };
	Spectrometer: { Eyebrow: string; Title: string; Note: string; RowLabel: string };
	Footer: { Eyebrow: string; Label: string };
	Cluster: { Eyebrow: string; Label: string };
}

/** Everything the three bands and the cluster need, as one value. */
export interface Band {
	Lanes: Lane[];
	Peers: Peer[];
	Status: StatusItem[];
	Marks: ProtocolMark[];
	Words: BandWords;
}

/** Every step of a lane or a row, in the one order both bands share. */
function Every(State: CapabilityState): Record<string, CapabilityState> {
	return Object.fromEntries(Steps.map((Step) => [Step.Key, State]));
}

/**
 * The two actors that always exist (RFC-0046 §1, RFC-0047 §1).
 *
 * The provider is first and the owner's own network second, in that order in
 * both bands: the provider verifies the network's identity, so it is the actor a
 * reader meets first. A peer or a room is appended by a session; neither exists
 * at build time, and inventing one would make the band state a relationship
 * nobody has.
 */
const Actors = [
	{
		Key: "provider",
		Kind: "provider" as const,
		Name: "Service provider",
		Layer: "identity" as const,
	},
	{ Key: "network", Kind: "network" as const, Name: "Own network", Layer: "policy" as const },
];

/**
 * The marks the cluster draws, each with the record that makes it a claim.
 *
 * Four, which is what fits the cluster's 200px (RFC-0048 § Consequences). A fifth
 * protocol is a design decision rather than an overflow, so the set stays closed
 * until someone makes that decision.
 */
const Marks: ProtocolMark[] = [
	{ Name: "X25519", State: "available", Note: "key agreement · RFC-0013" },
	{ Name: "HKDF-SHA256", State: "available", Note: "key derivation · RFC-0013" },
	{ Name: "AES-GCM-256", State: "available", Note: "content cipher · RFC-0013" },
	{ Name: "ChaCha20-Poly1305", State: "absent", Note: "not in WebCrypto" },
];

/**
 * The build's view of the three bands.
 *
 * No argument, because the build has no network to describe: the archive on disk
 * is content, and a peer is an actor with an identity (RFC-0013), which only a
 * session can name. The shapes are complete so a session fills them rather than
 * replacing them.
 */
export function Bands(): Band {
	const Lanes: Lane[] = Actors.map((Actor) => ({ ...Actor, Steps: Every(Unreached) }));
	const Peers: Peer[] = Actors.map((Actor) => ({ ...Actor, Cells: Every(Unread) }));

	// The notes state what the bands are not claiming, and they are derived from
	// the data rather than written per call site: a band whose cells a session
	// filled must not still say no session exists.
	const Silent = Peers.every((Peer) => Steps.every((Step) => Peer.Cells[Step.Key] === Unread));
	const Idle = Lanes.every((Lane) => Steps.every((Step) => Lane.Steps[Step.Key] === Unreached));

	return {
		Lanes,
		Peers,
		Status: [
			{ Key: "connection", Label: "connection", Value: "static" },
			{ Key: "sync", Label: "sync", Value: "static" },
			{ Key: "queued", Label: "queued", Value: "0" },
			{ Key: "failed", Label: "failed", Value: "0" },
		],
		Marks,
		Words: {
			Swimlanes: {
				Eyebrow: "Trust",
				Title: "Who authenticates whom",
				Note: Idle
					? "No relationship yet: a step no lane has reached reads absent, never as a shorter arrow."
					: "Each lane states the highest layer it reaches, and a step it has not reached reads absent.",
			},
			Spectrometer: {
				Eyebrow: "Capability",
				Title: "What the network runs",
				Note: Silent
					? "No session: a cell the build cannot prove reads unknown, never running."
					: "One row per peer, one column per step; a cell names the protocol that carries it.",
				RowLabel: "peer",
			},
			Footer: { Eyebrow: "Status", Label: "Machine status" },
			Cluster: { Eyebrow: "Protocols", Label: "Protocol security" },
		},
	};
}
