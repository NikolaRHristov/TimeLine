---
title: The trust swimlanes
rfc: 0047
category: Specification/Surface
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: |-
    the band between the canvas and the spectrometer, the lane vocabulary, every surface that draws who trusts whom
supersedes: none
superseded_by: none
depends:
    - RFC-0012 (audiences)
    - RFC-0013 (identity, keys and certificate authorities)
    - RFC-0019 (vocabulary)
    - RFC-0020 (the trust model)
    - RFC-0021 (observation provenance)
    - RFC-0022 (room isolation)
    - RFC-0023 (delegation)
    - RFC-0046 (the capability spectrometer)
    - RFC-0048 (the status surfaces)
statuses:
    - name: A lane is an actor, never a person
      state: open
      evidence: the rule names no file or command
    - name: Trust runs in two directions, and one arrow is a lie
      state: open
      evidence: the rule names no file or command
    - name: "`see` is the first permission, and it is named once"
      state: open
      evidence: the rule names no file or command
    - name: An accreditation is a claim with an issuer
      state: open
      evidence: the rule names no file or command
    - name: The band is a diagram, so it gets more air than a grid
      state: open
      evidence: the rule names no file or command
    - name: A lane states its own layer
      state: open
      evidence: the rule names no file or command
---

## Decision

Between the canvas and the spectrometer sits a band of swimlanes: one lane per actor, laid out left
to right along the same flow the spectrometer's columns use. The band answers one question that no
record has yet made visible - **who authenticates whom, and who authorises whom to look**.

Two lanes are always present and they run in opposite directions. The provider authenticates the
network; the user authorises the provider to see it. Everything else on the band is downstream of
those two, and the first permission in the flow is `see`.

Six rules make that enforceable.

### 1. A lane is an actor, never a person

A lane is the unit that can be authenticated and can be granted something. Four kinds exist, and the
kind is stated on the lane rather than inferred from its name:

- **provider** - the network service the operator runs. Always present, always the first lane.
- **network** - the owner's own network. Always present.
- **peer** - another network, joined or observed. Present once a relationship exists.
- **room** - a context inside a network, when the room has its own trust boundary (RFC-0022).

A person is not a lane. A person holds grants inside a lane, and drawing a person as a lane would
make the diagram about individuals when the decision it records is about networks.

The owner's own lane is the only one that is always drawn. A peer lane appears when the relationship
exists and disappears when it ends, so the band's height is a fact about the deployment rather than
a fixed slot.

### 2. Trust runs in two directions, and one arrow is a lie

The two always-present lanes face each other:

- **Inbound - the provider authenticates the network.** The provider verifies the network's identity
  and issues it a credential (RFC-0013). The network did not choose to be authenticated; it chose to
  join.
- **Outbound - the network authorises the provider to see.** The owner grants the provider
  visibility, and `see` is the first permission in the flow because nothing else can be granted
  before it. A provider that cannot see the network cannot serve it.

Drawing a single arrow in either direction would state one half of a handshake as if it were the
whole thing, and the two halves have different owners. The band therefore draws both, with the
credential exchange as the seam between them - the same way the composition draws the publish seam
between two surfaces that belong to different sides.

### 3. `see` is the first permission, and it is named once

The flow is `authenticate → see → grant → accredit`. `see` is a distinct step, not a synonym for
access:

- **see** - the provider may observe that the network exists and what it publishes publicly.
- **grant** - the provider may act on the network's behalf within a named scope (RFC-0023).
- **accredit** - the provider may attest to the network to a third party (RFC-0013's certificate
  authorities).

A grant without `see` is not expressible, because it would be an authority over something the holder
cannot observe. The band draws the four steps in order and a lane that has not reached a step shows
the step as `absent`, never as a shorter arrow.

### 4. An accreditation is a claim with an issuer

An accreditation badge names **who attests** and **what they attest**, in that order:
`provider - membership`. It never appears as a bare icon or a colour, because a colour is not a
claim: two deployments will not agree on what green means, and an accreditation whose issuer is
unknown cannot be checked.

A badge with no issuer is UNKNOWN and is drawn as UNKNOWN. This is the same rule RFC-0046 applies to
a capability without a protocol, and for the same reason.

### 5. The band is a diagram, so it gets more air than a grid

The canvas is a grid at a 20px rhythm. The swimlanes use a larger vertical step - the lane pitch is
deliberately greater than the canvas gap - because a lane carries a direction and a diagram needs
room between its rows to read as flow rather than as a table.

The horizontal axis is shared with the spectrometer: the same four steps, in the same order,
imported from one module. A lane and a column that disagree about the order would be two diagrams of
the same thing.

The band is static. Lanes that depend on a joined room are hydrated with the session (RFC-0017);
with no session the band draws the provider and the owner's network and nothing else, which is the
truthful picture of a reader who has joined nothing.

### 6. A lane states its own layer

Each lane carries the layer it operates at, because "who trusts whom" without "at what layer" is
ambiguous the moment two networks peer:

- **transport** - the connection is encrypted and authenticated (RFC-0026).
- **identity** - the actor's key is verified against an authority (RFC-0013).
- **content** - the record's audience permits this reader (RFC-0012).
- **policy** - the operator's own rules apply (RFC-0038).

A lane that spans more than one layer states the highest layer it reaches and draws the lower ones
as implied. The layer is what makes the band answerable to RFC-0022's isolation claim: a lane that
is transport-isolated but not policy-isolated is a real and common state, and the diagram says so.

## Context

RFC-0020 states the trust model, RFC-0013 the keys, RFC-0023 the delegation, RFC-0022 the isolation.
Each is correct and none is legible from the product. The composition shows what a person published
and what they could publish; it does not show the relationship that made publishing to a network
possible at all.

The swimlanes are that relationship, drawn as the thing it is - two actors facing each other, each
doing one half of the same handshake. The band exists because a person who has just read the canvas
asks "who else can see this", and the honest answer is a diagram, not a sentence.

## Alternatives considered

**A single "trusted" badge on the canvas.** Rejected: it collapses two directions and four steps
into a boolean, and the boolean is the part that is not true.

**A permissions matrix under the canvas.** Rejected: that is the spectrometer (RFC-0046). The
spectrometer states what a peer runs; the swimlanes state the relationship that lets it run. Merging
them produces one table that answers neither question well.

**Drawing people as lanes.** Rejected on rule 1. It makes the band grow with membership rather than
with relationships, and it invites reading a network as a set of individuals.

**Animating the flow.** Rejected: the band states a standing relationship, not an event. Motion
belongs to the publish gesture, which is the only verb that changes state (RFC-0043).

## Consequences

- The band is the first surface that makes the trust model reviewable by someone who is not reading
  the RFCs, so it becomes the artifact a security review is conducted against.
- Two directions mean two owners: an inbound failure is the provider's, an outbound one is the
  network's. The band makes that attribution visible, which is the point.
- The lane set is dynamic, so the band's height changes with the deployment. A layout that assumed a
  fixed number of lanes would break on the second peer.
- Adding a layer is a vocabulary change (RFC-0019) before it is a design change, which keeps the
  band from growing a fifth column that means nothing.

## Verification

| Claim                               | Test                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Two directions are always drawn     | render with one lane; both the inbound and the outbound arrow are present                               |
| `see` precedes every grant          | a grant whose lane has no `see` step fails the band's own prop contract                                 |
| A badge names its issuer            | a badge rendered with an empty issuer reads UNKNOWN, never a colour                                     |
| One step order, imported not copied | the step array is a single export read by both the band and the spectrometer                            |
| The band is static                  | it renders with `Emulation.setScriptExecutionDisabled`; only joined-room lanes are added by the session |
| Lane pitch exceeds the canvas gap   | `verify-composition.mjs` gains a lane-pitch invariant greater than the 20px canvas gap                  |

## Open questions

- Whether an `accredit` step belongs on every lane or only on the provider's. Today it is drawn on
  any lane holding a certificate, which may be too permissive a reading of RFC-0013.
- Whether a peer network's lane should show its own provider. The recursion is real and the band
  does not currently draw it; the alternative is a second band, which is a layout decision left
  open.
- The exact lane pitch. It must exceed 20px and it must let four lanes and their labels sit inside
  the band without the band becoming a second canvas; that is a design-pass measurement, not a
  decision this record can make from prose.
