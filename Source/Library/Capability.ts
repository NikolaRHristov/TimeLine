/**
 * The one step vocabulary the two bands below the canvas share.
 *
 * RFC-0047 draws the trust flow as swimlanes and RFC-0046 cuts the same flow
 * into a table of peers against capabilities. Both records insist the order is
 * imported rather than copied - "a lane and a column that disagree about the
 * order would be two diagrams of the same thing" - so the four steps are stated
 * once here and both components read this array. Neither component holds an
 * order of its own, and a fifth step is one entry here.
 *
 * The flow is `authenticate -> see -> grant -> accredit`. `see` is a distinct
 * step and not a synonym for access: a grant without it would be an authority
 * over something the holder cannot observe, so the band draws the four in order
 * and a lane that has not reached one shows it as `absent` rather than as a
 * shorter arrow.
 *
 * Every step names the protocol that carries it, in RFC-0046's own format - the
 * capability first, the suite after the dash, `E2E - X25519 / ChaCha20-Poly1305`
 * rather than "encrypted: yes". A step whose protocol cannot be named carries an
 * empty `Protocol` and is printed as UNKNOWN, never described in prose: a claim
 * that cannot be checked against a record is not a claim this band makes.
 *
 * Two of the four carry an empty protocol on purpose. RFC-0013 names the key
 * agreement (X25519), the derivation (HKDF-SHA256) and the cipher (AES-GCM), and
 * RFC-0046's example label names the transport suite; neither record names a
 * signature scheme, and `grant` and `accredit` both rest on a signature. They
 * read UNKNOWN until RFC-0013 names one, which is the honest state of the
 * specification rather than a gap in this file.
 *
 * The layers are RFC-0047 §6's four, and a lane states the highest one it
 * reaches: `transport` for a connection, `identity` for a verified key,
 * `content` for an audience that permits a reader, `policy` for the operator's
 * own rules.
 */

/** The four steps of the trust flow, in the order a reader travels them. */
export type StepKey = "authenticate" | "see" | "grant" | "accredit";

/** The layer a step or an actor operates at (RFC-0047 §6). */
export type Layer = "transport" | "identity" | "content" | "policy";

/**
 * What a cell or a step states, closed (RFC-0046 §1).
 *
 * `running` is engagement, `available` is a permission fact rather than a
 * defect, `absent` is a peer that does not implement the step or a lane that has
 * not reached it, and `unknown` is a record the client could not read. The four
 * are never collapsed: a table that showed only `running` would answer what is
 * on and hide what could be on and is not.
 */
export type CapabilityState = "running" | "available" | "absent" | "unknown";

/** One step of the flow, with the protocol that carries it and its record. */
export interface Step {
	/** The stable key a cell is addressed by. */
	Key: StepKey;
	/** The step's own word, as the flow prints it. */
	Label: string;
	/** The suite that carries the step, or `""` when none can be named. */
	Protocol: string;
	/** The layer the step operates at. */
	Layer: Layer;
	/** The record a state is read from, named by the record that defines it. */
	Record: string;
}

/**
 * The flow, in order. The only statement of it in the tree.
 *
 * The protocols are the ones the records name, not the ones a client would
 * prefer: RFC-0013's wrap is `X25519 + HKDF-SHA256 + AES-GCM`, RFC-0046's label
 * for the published envelope is `E2E - X25519 / ChaCha20-Poly1305`, and RFC-0023
 * and RFC-0013 both say "signed" without naming a scheme.
 */
export const Steps: readonly Step[] = [
	{
		Key: "authenticate",
		Label: "authenticate",
		Protocol: "X25519 / HKDF-SHA256",
		Layer: "identity",
		Record: "RFC-0013 key record",
	},
	{
		Key: "see",
		Label: "see",
		Protocol: "E2E - X25519 / ChaCha20-Poly1305",
		Layer: "content",
		Record: "RFC-0012 audience tier",
	},
	{
		Key: "grant",
		Label: "grant",
		Protocol: "",
		Layer: "policy",
		Record: "RFC-0023 delegation",
	},
	{
		Key: "accredit",
		Label: "accredit",
		Protocol: "",
		Layer: "identity",
		Record: "RFC-0013 certificate authority",
	},
];

/** The word a step with no named protocol prints (RFC-0046 §2). */
export const UnknownProtocol = "UNKNOWN";

/**
 * The protocol a step is carried by, or UNKNOWN.
 *
 * The one place an empty `Protocol` becomes a printed word, so a component
 * cannot invent a description for a suite nobody named. A band prints this
 * directly under the step's own name, which is what makes the pair read as
 * RFC-0046's label - the capability, a dash, the suite - without the step name
 * being printed twice in one column head.
 */
export function Protocol(Step: Step): string {
	return Step.Protocol === "" ? UnknownProtocol : Step.Protocol;
}

/** The state a cell prints when its record could not be read. */
export const Unread: CapabilityState = "unknown";

/**
 * The state a lane shows for a step it has not reached (RFC-0047 §3).
 *
 * Distinct from `Unread` on purpose: "this lane has not reached the step" is a
 * fact the band knows, and "the record could not be read" is a fact it does not.
 * Collapsing them would let a missing read pass for a standing relationship.
 */
export const Unreached: CapabilityState = "absent";

/**
 * The state of a protocol mark in the rail's security cluster (RFC-0048 §3).
 *
 * A closed set of its own: the cluster answers what the deployment engages, not
 * what a peer runs, and a mark with no state would be decoration in a security
 * surface.
 */
export type ProtocolState = "engaged" | "available" | "absent";

/** One mark in the rail's cluster: a protocol, its state and its record. */
export interface ProtocolMark {
	/** The protocol, as RFC-0013 or RFC-0026 names it. */
	Name: string;
	State: ProtocolState;
	/** What the protocol does, so the mark is a claim rather than a badge. */
	Note: string;
}
