# Hidden Properties and Disclosure

Workers and capabilities carry properties that are not public at first: what an agent can actually
do, how reliable it has proven, what it costs, what it is currently holding. Some of that becomes
known through its traces, some only by another actor paying to probe it.

Two frames are in play and they must not be merged.

- **Belief** - what an actor infers. POMDP belief states, hidden Markov models, epistemic logic.
  This is inference and planning: it decides what to _try_.
- **Authorization** - what an actor may know. This is policy: it decides what is _revealed_.

A belief never grants access. A client that guesses correctly learns nothing extra; a client that is
entitled to know does not have to guess.

## The data model

Three kinds of table, and the distinction is what keeps the secret from leaking:

1. **Private truth** - the property as it actually is. Readable by no subscriber; only reducers
   touch it.
2. **Observations** - immutable, audience-scoped records of what a specific actor learned at a
   specific time, tied to the property's version. A reveal writes one row; it never exposes the
   truth table.
3. **Beliefs** - derived, actor-specific interpretations computed from that actor's observations.
   Disposable: deleting them loses nothing that cannot be recomputed.

## The probe

A reveal is a reducer, not a view:

```
probe(target, action)
  authenticate ctx.sender
  check the target is visible to that sender
  check the action's prerequisites and its budget
  read the private property
  compute only the permitted disclosure
  insert the audience-scoped observation
  charge the cost / update probe state
```

All of that is one transaction, so "pay and reveal" is all-or-nothing, and two racing probes cannot
both spend a one-use allowance. The recipient is `ctx.sender`; a caller-supplied identity is never
authorization.

**Record the disclosure, do not join to the secret.** A view that joins an old grant to the current
value silently authorizes every future change. An observation tied to a property version states
exactly what was learned when; continuing to see the current truth is a separate entitlement,
granted explicitly.

## Traces are a second subscription surface

A step trace, a source label, an error string, a result count, an audit event - each can carry a
private value to every subscriber. Raw evidence stays private; the trace a client sees is an
audience-specific projection built with the same rules as any other reveal. Because traces are
append-only, an accidental publication cannot be undone by hiding a later projection.

The check that catches this: plant a canary in a private property and inspect every client-visible
row, trace, failure response and exported artefact.

## The non-leakage target

Before an authorized reveal, two database states that differ only in a protected property should
induce the **same observable transcript** for an unauthorized actor - or the same distribution when
randomness is involved. "The same visible values" is too weak: row existence, update timing, counts,
identifiers and success-versus-failure all carry information.

That is a specification to test, not a guarantee the database provides: run paired worlds with
different secrets and compare the complete client-observable transcript.

## What leaks anyway

- A reveal reveals - that is its purpose.
- Timing, traffic size, shared-resource contention and the operator's own access sit outside row
  filtering. Accept them, constrain the threat model, or pay for batching and padding.
- An authorized recipient can tell someone else. No schema prevents that.

Documenting the allowed leakage is part of the design; claiming total secrecy is not available at
this layer.

## What a card game actually teaches

Netrunner is worth borrowing from for one reason: disclosure there is **paid for and legible**.
Every reveal costs a click, the game states what was learned, and the hidden zone is a finite
resource the opponent can reason about without enumerating it.

That gives three rules worth copying:

- a reveal has a price, so information is never free to acquire;
- a reveal is recorded as a fact about the observer, not published to the table;
- what remains hidden stays _countable_ - the shape is public even when the contents are not, which
  is what makes inference possible without making the secret readable.
