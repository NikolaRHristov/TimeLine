# RFC-0071 - Who may publish a library, and what revocation can reach

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** library publication,
the review record, revocation, a host's refusal to publish **Kind:** policy **Subject:** network
**Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0042
(admission by review record and revocation by republish; this record decides who does either),
RFC-0025 §3 (a module is composed from reviewed libraries), RFC-0022 §1 and §2 (the publish path and
declared egress), RFC-0016 §2 (staged rollout), RFC-0058 (a room's face names the artifact a reader
can check); implementing card to be created: "Review record, revocation advisory and the publish
check"

## Decision

Anyone may publish a library; admission to the reviewed set is a named person's recorded judgement;
and a revocation is an advisory plus a host-side refusal, because forcing it on every room would
require the global authority the set refuses.

1. **Publishing is open, admission is not.** A library exists when someone publishes it. It becomes
   composable into a room only when a review record exists (RFC-0042 §3). Open publishing keeps the
   ecosystem from needing a gatekeeper at the door; admission keeps a room from running unreviewed
   code, which is the property that matters.
2. **The reviewer is a named identity and the judgement is theirs.** A review record is
   `{library, version, hash, reviewer, scope, at, signature}`. There is no committee and no
   anonymous review, because the value of the record is that a bad admission has a person's name on
   it - which RFC-0042's Consequences already accept.
3. **Review is of a hash, not of a name.** A library's identity for admission is its content hash -
   RFC-0025 §1's rule applied one level down. A new version is a new review, and a library that
   changes without a version change fails admission rather than being trusted for its name.
4. **Scope is what the reviewer checked, and it is enumerated.** Tables, reducers, egress, and the
   shape of the rows it writes. A review that checked less says so; a review that says "all" without
   an enumeration is a review nobody can audit.
5. **Revocation is an advisory with a deadline.** `{library, hash, reason, at, deadline, signature}`
   is published where the review records live. It states what was found and by when a room should
   stop running it. It is not a kill switch, because there is none.
6. **The host's lever is refusal at republish, not republish.** A host may refuse to publish an
   artifact containing a revoked library after the deadline (RFC-0022 §1's publish path, RFC-0016
   §2's staged rollout). It cannot rebuild a room's artifact, cannot republish on the room's behalf,
   and cannot stop a room that never republishes. A room that keeps running a revoked library keeps
   running it, and its artifact hash says so - the honest limit of a system with no global
   authority.
7. **A room that ignores a revocation is visible.** The room's public face names its artifact hash
   (RFC-0058) and the composition manifest names the libraries inside it, so a reader can check a
   room's hash against the revocation list without the room's cooperation. Visibility is the
   enforcement.
8. **Retracting a review is a revocation of the review, not of the library.** A reviewer who was
   wrong, or a review that turns out to have checked nothing, gets its own retraction, and the rooms
   that composed on it are who the advisory addresses. A review record is never edited, for the same
   reason a rule set is versioned (RFC-0031 §6).

## Context

RFC-0042 decides that extension is composition, that a library is admitted by a review record
pinning its hash, and that revocation is a republish by the room's authority. It does not decide who
may publish, who reviews, or what happens to the rooms that do not act - and the last is the
question the topic asks, because "a bad module is revoked across every room that runs it" is a
sentence that assumes a power the set grants nobody.

The reason is structural rather than timid. RFC-0005 makes a room a database, RFC-0013 makes trust
per room, RFC-0020 refuses a global root, and RFC-0016 §5 gives a host exactly one lever: suspend
the room. A revocation reaching every room would be a global root by another name, and it would have
to be able to republish someone else's database.

Nothing of the kind exists. `ls Maintain/Spacetime/` holds the module and no registry, and
RFC-0042's own open question records that the engine's registry documents no signature and no
version pinning - so a hash cannot be checked against a review today, which is why rule 3's "fails
admission" is a check this system performs rather than one it inherits.

## Alternatives considered

| Option                                         | Why not chosen                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A registry gatekeeper who publishes libraries  | one party decides what code exists, and RFC-0025 §3 already reads the registry as a marketplace rather than a gate      |
| An anonymous review pool                       | an admission with no name on it is an admission nobody answers for                                                      |
| A central kill switch that republishes rooms   | it would need write access to every room's database and would be the global authority RFC-0013 and RFC-0020 refuse      |
| Revocation by deleting the library's rows      | the rows are the room's history, which RFC-0042 §5 already refuses to touch                                             |
| Trust the registry's author field              | RFC-0025's open question records that it is a string with no review behind it                                           |
| No revocation at all                           | a library found to exfiltrate through declared egress (RFC-0022 §2) would have no channel to reach the rooms running it |
| A revocation that blocks new publications only | it would let every existing room keep the code and stop the next room from getting the fix the revocation is about      |

## Consequences

- A revocation is a publication whose effect depends on rooms reading it, so the ecosystem's health
  depends on a shared list somebody maintains: a real institution with a real failure mode.
- The host's refusal at republish gives a revocation teeth against any room that upgrades - most
  rooms eventually and none immediately.
- A room's artifact hash becomes a public accountability handle, so a room pinning an old artifact
  is visibly old: pressure that works slowly and only on rooms that care.
- Because review is of a hash, every version bump re-opens review, making a library's release
  cadence a cost its consumers pay.
- A reviewer's identity becomes something that can be attacked, and a review set with one active
  reviewer is a single point of trust that looks distributed.

## Verification

| Claim                          | Test                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Publishing needs no permission | publish a fixture library with no review record; it exists and no room can compose it (RFC-0042, intent)                                  |
| Admission is a hash            | change one byte of a reviewed library and republish under the same name; admission fails and the new hash has no record (intent)          |
| A review names its scope       | `jq -r '.scope' review.json` enumerates tables, reducers and egress, and "all" is not a value (review rule)                               |
| Revocation is an advisory      | publish a revocation; no room's artifact changes and no module is republished by it (intent)                                              |
| A host refuses at republish    | attempt to publish an artifact containing a revoked library past its deadline; the host refuses and names the revocation (intent)         |
| An ignoring room is visible    | a fixture room keeps its artifact; its public face's hash matches the composition manifest and the revocation's target (RFC-0058, intent) |
| A review is never edited       | retract a review; the original row is byte-identical and a retraction row exists beside it (intent)                                       |

## Open questions

- Who maintains the revocation list, and whether there can be more than one. Two lists that disagree
  are two authorities, which is either federation or a split.
- Whether a host should refuse to _run_ a revoked library in an existing room at the next restart -
  a stronger lever than refusing a republish, and one no page describes.
- Whether a review should be paid for. A reviewer's judgement is the scarce good in this model and
  nothing in the set prices it.
- UNKNOWN whether the engine's registry can serve a hash for a library at all, which decides whether
  rule 3 is checkable by a client or only by whoever fetched the bytes. RFC-0042's open question is
  the same one and this record does not answer it.
