# RFC-0057 - Recovery restores the name, not the archive

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the client keystore,
the epoch wrap, the recovery secret, the guardianship ceremony **Decision class:** policy
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0013 (the recovery secret
and the escrow holder; this record extends its recovery clause), RFC-0056 §4 (guardianship over
rotations, not restated here), RFC-0028 §4 (the copies erasure cannot reach), RFC-0038 (what the
operator owes); implementing card to be created: "Recovery ceremony and the archive wrap"

## Decision

A person has two recoverables. The **identity key** proves who they are; the **archive key** opens
what they wrote. RFC-0056 §4 recovers the first with a guardian threshold over a rotation. This
record decides the second, and its rule is that recovering one never implies the other.

1. **A rotation restores the name and opens no ciphertext.** An epoch is wrapped to a member's
   public key (RFC-0013). A new identity key does not open an old wrap, so a rotated identity reads
   a room from its `notBefore` forward and reads nothing it wrote before that. That is arithmetic,
   not policy, and it is why this record exists.
2. **Every epoch is wrapped twice, and the second target is offline.** The recovery secret RFC-0013
   already requires is the private half of a recovery key. Each epoch wrapped to a member is also
   wrapped to `recovery(identity)`. The client refuses to complete a wrap it cannot address to both,
   so a member cannot acquire an epoch that recovery would not open.
3. **The recovery secret is a file, not a service.** No operator, guardian or peer holds it.
   Restoring an archive is: import the secret on a new device, unwrap the epochs, decrypt. Nothing
   else in the system participates, which is what keeps the operator blind through a recovery.
4. **Guardianship never touches the archive key.** A guardian holds a rotation share (RFC-0056 §4),
   never a share of the recovery key. A captured guardian set can therefore change a name and cannot
   read a single post, and the two mechanisms cannot be recombined into a secret-sharing scheme by a
   client that wants to help.
5. **The four outcomes are named, and the client says which one applies.** (a) device lost, both
   keys intact: nothing to recover. (b) device lost, recovery secret intact, identity key lost: the
   archive opens and the name does not until a rotation completes. (c) identity key intact, recovery
   secret lost: the name survives, every epoch already wrapped to the device survives, and anything
   not yet delivered is gone. (d) both lost with no rotation: the archive is gone. In (d) a member
   who holds the epoch can still read what the person wrote, the tombstones stay, and nothing the
   person authored becomes unreadable to others - only to them.
6. **Case (d) is stated at setup, not discovered at failure.** The keystore ceremony says once, in
   the same words the failure screen uses, that losing both keys loses the archive. A recovery
   warning written only in a failure message is a warning nobody reads.
7. **A room may be recoverable, and pays for it in blindness.** The escrow holder RFC-0013 permits
   is the only mechanism that outlives case (d) for a whole room. A room that configures one cannot
   claim provider blindness against it, and the room's public face declares which case it is in
   (RFC-0058).
8. **The cost is a count of parties who could read, not a slogan.** Provider blindness survives
   every case above because the operator holds nothing. A guardian set reads nothing. An escrow
   holder reads everything it holds. A member choosing between them is choosing a number, and the
   client shows the number.

## Context

Two records name recovery and neither closes it. RFC-0013 stores the identity key offline as a
recovery secret, forbids server-side escrow by default, and states that a lost identity key loses
every room at once. RFC-0056 §4 adds a guardian threshold over a key rotation. Read together they
are consistent and they leave a hole: a rotated identity cannot decrypt what it wrote, because the
wrap is to a key that no longer exists. Nothing in the set notices, because RFC-0013's own rotation
clause is about a subkey's expiry and the room's `CK` epoch, never about the identity key being
replaced.

The hole is the difference between "I lost my phone" and "I lost my archive", and the second is the
one the product's posture is built to make survivable. An archive that cannot be re-read after a
theft is an archive a thief destroys by taking a bag.

Nothing of this exists. `grep -rln "keystore\|recovery" Maintain/Source/` prints nothing, so there
is no keystore, no secret format and no wrap target to extend. RFC-0013's `CK_e` wrap is prose, and
this record adds a second addressee to it before either is implemented - the cheapest moment to add
it.

## Alternatives considered

| Option                                                     | Why not chosen                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Share the identity key across guardians                    | shares of the key are the key, which RFC-0056 rejects; one reconstructed secret signs as the person                       |
| Derive the archive key from the identity key               | the two become one recoverable, so every rotation destroys the archive and every archive restore is a signing capability  |
| Make the escrow holder the default                         | it converts provider blindness into "blind unless asked", which is a different product, and RFC-0013 already refuses that |
| Wrap every epoch to every device instead of a recovery key | a member with three devices recovers from the fourth, and the fourth is the one that was stolen                           |
| A recovery service that holds a wrapped copy               | a service is a party and a party is a subpoena target; RFC-0056 rule 6 already refuses the operator in this role          |
| Say "your data is gone" and offer nothing                  | honest and unacceptable at this archive's size; rule 2 costs one extra wrap per epoch                                     |

## Consequences

- Every epoch write costs a second wrap, so joining a room is slower and a room's key material grows
  by one row per member per epoch.
- A recovery secret is a file a person can lose separately from the key it recovers, which is a new
  way to fail; the ceremony has to make the two failure modes distinguishable or it has taught
  nothing.
- Case (b) leaves a person holding their archive and unable to prove who they are until a rotation
  completes, so the client needs a state that is neither signed in nor locked out.
- The count in rule 8 gives a member a number to compare across rooms, which makes a room with an
  escrow holder visibly different from one without - a comparison the product wants and an operator
  may not.
- Because the operator holds nothing, no support desk can restore an archive. The product says so
  before the failure rather than after it.

## Verification

| Claim                              | Test                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A wrap has two addressees          | `spacetime sql <room> "SELECT count(*) FROM key_epoch"` equals the member wraps plus the recovery wraps for one epoch (intent) |
| A rotation opens no old ciphertext | rotate an identity in a fixture room, then decrypt a pre-rotation post: fails with the named code for case (b) (intent)        |
| The secret restores the archive    | restore the secret on a clean client profile, unwrap the epochs, decrypt a post authored before the loss (intent)              |
| A guardian cannot read             | the guardian's key appears in no wrap row, and a guardian's rotation transcript decrypts nothing (intent)                      |
| The operator cannot restore        | remove every operator endpoint from the client's configuration, then run the restore: it completes (intent)                    |
| Case (d) is stated at setup        | the keystore ceremony's text names case (d), and `grep -c` for that sentence in the failure copy returns 1 (review rule)       |
| A room declares its case           | a room with an escrow holder publishes a public face whose recovery field is not `self` (RFC-0058, intent)                     |

## Open questions

- Whether the recovery key should be derived from the identity key's seed with a distinct derivation
  path, so one secret backs up both, or be independent, so its compromise costs only the archive.
  The record assumes independent and the ceremony is easier with derived.
- Whether a rotation should re-wrap old epochs to the new key for the member who still holds the
  recovery secret. It would restore history to the rotated identity and would give every guardian a
  path to ask for it, which is a second recovery power nobody has specified.
- How a person proves case (d) to a room's authority when they want old posts attributed to a new
  identity. The rotation is the only proof the system accepts and it needs a key.
- UNKNOWN whether a browser keystore can hold a wrap for a key it has never seen, which decides
  whether the recovery target can be an offline-only public key or must be derived on the device
  performing the wrap. Spike: wrap to a public key generated in another profile, then unwrap there.
