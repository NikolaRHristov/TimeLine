# RFC-0046 - The capability spectrometer

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the band beneath the
canvas, the peer table, the capability vocabulary, every surface that states what the network runs
**Decision class:** product **Supersedes:** none **Superseded by:** none **Task dependencies:**
RFC-0013 (identity and keys), RFC-0017 (the client surface and its live layer), RFC-0019
(vocabulary), RFC-0020 (the trust model), RFC-0023 (delegation), RFC-0024 §5 (an action is
idempotent by id), RFC-0026 (peer-carried transport), RFC-0043 (the workspace seam), RFC-0045 (the
material and the token set); t_ab85d9de (the session and network layer)

## Decision

The composition gains a band beneath the canvas that states what the network actually runs, one row
per peer, one column per capability, in protocol-first language. It is called the spectrometer
because that is what it does: it separates a claim the network makes into the specific protocols that
carry it, and shows which of them are running for which peer right now.

The band is evidence, not a feature list. Every cell is derived from a record that already exists,
and a capability with no protocol behind it is drawn as UNKNOWN rather than described in prose.

Five rules make that enforceable.

### 1. One row per peer, one column per capability

The reader's question is not "what does the product do" but "what does this peer actually do with me".
So the table is peers against capabilities, never a list of adjectives.

- A **row** is a peer: the owner's own network, a joined room, another network's edge, the service
  provider. A peer is an actor with an identity (RFC-0013), not a person.
- A **column** is a capability: authenticate, encrypt, authorise, negotiate. The four are the flow
  the swimlanes above draw (RFC-0047), in the same order, so the two bands read as one diagram cut
  into two rows of space.
- The **intersection** is a state, not a tick. A cell states one of three, and the three are never
  collapsed:
  - **running** - the protocol is engaged for this peer right now;
  - **available** - the peer supports it and has not been granted it, which is a permission fact, not
    a defect;
  - **absent** - the peer does not implement it. This is drawn, never omitted, because an omitted
    cell reads as "fine".

A table that showed only what is running would answer "what is on" and hide the more useful answer,
which is "what could be on and is not".

### 2. Protocol first, prose second

A capability is named by the protocol that carries it and the version that carries it, with the
sentence that explains it in a subordinate position. `E2E - X25519 / ChaCha20-Poly1305` is a claim
that can be checked against RFC-0013. `End-to-end encrypted` is a claim that cannot be checked
against anything.

The rule follows from the repository's own posture: every other surface states a fact with the
command that proves it. This band states a fact with the protocol that implements it, and the two are
the same discipline.

A capability whose protocol cannot be named is UNKNOWN. It is not described in the sentence that
would otherwise have been written.

### 3. The states come from records, never from the client

Each cell is computed from a record, and the mapping is stated once:

- **authenticate** - from the peer's key record and the last successful verification (RFC-0013).
- **encrypt** - from the transport the connection actually uses (RFC-0026): a peer-carried transport
  that is encrypted reports the cipher suite; one that is not reports `absent`.
- **authorise** - from the grant set on the peer's membership (RFC-0023): the cell names the highest
  grant held, and `available` when a grant exists that the peer has not exercised.
- **negotiate** - from the offer table (RFC-0024 §5): `running` when an offer has been accepted and
  is idempotent by id, `available` when an offer is open, `absent` when the peer published none.

A client that cannot read a record renders UNKNOWN for that cell. It never infers a state from the
absence of an error, because the absence of an error is what a broken client also produces.

### 4. The band is beneath the canvas and shares its rhythm

The spectrometer sits directly under the bento canvas, on the same paper ground, with the canvas's
own 20px vertical rhythm and its 24px corner. It is not a footer: it is the second half of the
published surface, and the footer (RFC-0048) is the machine's status line below it.

Horizontally it is a linear flow left to right, in the order the swimlanes use. That order is the
whole point - a reader who has just looked at the canvas is looking at what was published; the next
question is what carried it, and the band answers in the direction the eye is already travelling.

The band is static. It is rendered from the build like the canvas, and a live cell is hydrated only
when a room is joined (RFC-0017). A reader with no session sees the columns and the peers they are
entitled to know about, with every cell it cannot prove rendered UNKNOWN.

### 5. A capability the owner cannot grant is not advertised

The band lists the capabilities the owner's own network can actually engage. A capability that exists
in the protocol but that this deployment cannot grant is not drawn, because a row of "available"
cells that can never become "running" is a promise the operator cannot keep.

This is the one rule that makes the band shrink as the deployment is honest, and that is the
intention. RFC-0038 already states what the operator owes and what it cannot owe; the band is where
that distinction becomes visible without a paragraph of hedging.

## Context

The composition already states three things: where the work sits (the rail, RFC-0045), what is private
and what is published (the drawer and the canvas, RFC-0043), and that publishing is the only verb
across the seam. It does not state what the network *is*, which is the question a person asks the
moment a second peer appears.

The existing records answer it in prose: RFC-0013 defines the keys, RFC-0020 the trust model,
RFC-0023 the grants, RFC-0026 the transport. What none of them provides is a surface where those
answers are visible together, per peer, in a form that can be checked. That is the gap this record
closes, and it is a surface decision rather than a protocol one - no mechanism changes.

## Alternatives considered

**A feature grid with ticks.** Rejected: a tick states that a capability exists somewhere, and the
question is what is engaged with *this* peer. It also cannot express `available`, which is the state
that carries the most information.

**A prose paragraph per capability.** Rejected: it is what the RFCs already do, and it is why the
answers are not visible in the product.

**A protocol-agnostic summary ("encrypted: yes").** Rejected on rule 2. A claim without a named
protocol cannot be verified by the person reading it, and this repository does not accept unverifiable
claims anywhere else.

**Deriving the state from client-side capability detection.** Rejected on rule 3: detection reports
what a browser supports, not what a peer engaged, and the two diverge exactly when it matters.

## Consequences

- The band is the first surface that makes the network's mechanics legible, so it becomes the place
  support questions are answered from. It must therefore never overstate: a cell is a record read.
- Every new capability becomes a column, and a column is a protocol name and a record read. A
  capability that cannot name both does not get a column, which is a useful brake on scope.
- The band grows with the peer count and the capability count. At three peers and four capabilities
  it is twelve cells; the layout must survive twenty without becoming a spreadsheet, which is a
  constraint on the design pass rather than on this record.
- Rendering UNKNOWN honestly means the band looks incomplete during early deployment. That is the
  correct appearance for an early deployment.

## Verification

| Claim                                    | Test                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Every cell names a protocol or UNKNOWN   | a cell whose protocol field is empty fails the component's own prop contract             |
| No cell is derived from a missing record | render with an empty record set; every cell reads UNKNOWN, none reads `running`          |
| The band is static                       | `Emulation.setScriptExecutionDisabled` still renders every row and column (RFC-0048 audit) |
| The band sits under the canvas           | `verify-composition.mjs` gains a band-top invariant equal to canvas-top plus canvas-height |
| The flow order matches the swimlanes     | the column order array is imported by both components, not duplicated in each            |

## Open questions

- The exact column set for a deployment with no room joined. Four columns are the flow; a deployment
  that has never federated may need a fifth for "discoverable", which is a product decision and not
  yet made.
- Whether the service provider is always a row or only when a room is joined. The current answer is
  always, because authentication of the network is a fact even when no room exists, but the band
  would then show one row for most readers.
- Whether a `negotiate` cell that is `available` should be actionable in the band or only in the
  session layer. Making it actionable turns the band into a control surface, which RFC-0017 does not
  currently provide for.
