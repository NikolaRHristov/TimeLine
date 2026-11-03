# RFC-0055 - DELO and the provider position

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the brand, the
vocabulary of an action, the promise the showcase pages make, the footer attribution **Kind:**
policy **Subject:** economy **Horizon:** now **Supersedes:** none **Superseded by:** none **Task
dependencies:** RFC-0013 (identity and keys), RFC-0019 (vocabulary), RFC-0020 (the trust model),
RFC-0026 (peer-carried transport), RFC-0038 (what the operator owes), RFC-0047 (the swimlanes),
RFC-0053 (the showcase)

## Decision

DELO is the parent company. The product is a **network**: the operator carries what its users send
and learns nothing about what that is. A unit of action travelling through the network is a
**motion**.

Five rules make that position checkable rather than aspirational.

### 1. The operator is a carrier, not a custodian

The operator routes motions. It does not read them, index them, rank them or moderate them, because
the transport is end-to-end encrypted between peers (RFC-0026) and the keys are the participants'
(RFC-0013). "We know nothing about your content" is therefore not a policy promise; it is a
consequence of the protocol, and a consequence can be checked.

A promise that rests on the operator's good behaviour is a promise RFC-0038 already refuses to make.
This one rests on the operator being unable to read, which is the only kind worth printing.

### 2. A motion is the unit of action

The vocabulary is `motion`, and it replaces `request`, `action`, `event` and `job` in user-facing
copy:

- a motion is **raised** by a participant, **carried** by the network, and **settled** when its
  outcome is recorded;
- a motion has an author, an audience and an id that makes it idempotent (RFC-0024 §5);
- a motion is never modified in transit; a change of intent is a second motion.

The word is chosen for the legal sense: something put forward, passed between parties, and answered.
It also gives the product one noun for a thing that currently has four, which is what RFC-0019 asks
for.

Internal identifiers may keep their existing names - `Event`, `vote.cast`, `scrape.started` -
because renaming a schema to match a brand is a migration with no product benefit. The vocabulary
rule binds the copy, not the tables.

### 3. The brand appears once

DELO appears in the shell's attribution and in the licence line, and nowhere else in the product
surface. The network itself is named by the person who runs it; a hosted deployment names it after
its owner, not after the company that carries it.

A product that brands every surface with its parent company is advertising at its users. A carrier
that signs the footer is a carrier.

### 4. The showcase states the position as a capability

Each claim on a showcase page (RFC-0053) is a capability the reader can check, in the form the
spectrometer uses (RFC-0046): a protocol and a state, not an adjective.

- "Your content is unreadable to us" is stated as the cipher suite and the fact that the keys are
  not held.
- "You decide who sees it" is stated as the grant set and the `see` step (RFC-0047).
- "We cannot moderate it" is stated as a consequence, not an apology, because it is what the
  architecture buys.

### 5. The operator answers for the network, not for the content

The split RFC-0038 already draws becomes the product's own: the operator owes availability,
authenticated transport and a truthful status surface (RFC-0048). It does not owe an opinion on what
travels.

A support question about content is answered by naming the peer who authored it, never by inspecting
it - and the status surfaces are what make that answer credible, because they show what the operator
can actually see.

## Context

The repository has been built as one person's archive. The product it belongs to is larger: a
network that other people run, carrying motions between peers, with the company as a carrier. That
position was implicit in RFC-0026 and RFC-0038 and was never stated as a product decision, so every
surface inherited the archive's voice instead of the carrier's.

## Alternatives considered

**"Platform" as the category.** Rejected: a platform is something others build on, and this is
something others send through. The distinction matters because it decides what the operator may
claim.

**Keeping the existing nouns.** Rejected on rule 2: four words for one thing is the vocabulary
defect RFC-0019 exists to catch.

**Naming the network after the company.** Rejected on rule 3: the network belongs to whoever runs
it, and a carrier that names it is claiming custody it does not have.

## Consequences

- The copy across every showcase page changes register: from describing an archive to stating what a
  carrier can and cannot do.
- `motion` enters the vocabulary record and the copy layer; the schema keeps its names.
- The footer's attribution becomes the only place the company is named, which is a deliberate
  constraint on future design work.

## Verification

| Claim                          | Test                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| The brand appears once         | `grep -rc "DELO" Source/` returns at most the shell's attribution        |
| The promise is a capability    | every showcase claim names a protocol or a record, per RFC-0046 rule 2   |
| The vocabulary is used in copy | `grep` for "request"/"job"/"action" in `Content/` returns nothing        |
| The operator reads nothing     | the transport is E2E (RFC-0026) and no server-side key exists (RFC-0013) |

## Open questions

- Whether `motion` also replaces `vote` in the copy, or whether a vote is a kind of motion.
- Whether the company name belongs in the licence line, the footer, or both.
- How a self-hosted deployment presents itself when the carrier's brand is deliberately absent.
