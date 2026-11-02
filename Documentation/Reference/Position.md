# Position - the carrier, the motion and the claim

The product is a network. DELO is the company that carries it. The unit of action travelling through
it is a **motion**. Those three sentences are the whole position, and the three rules that keep it
from drifting are counted by `Scripts/Position.mjs`, which `pnpm run check` runs.

The decision itself is RFC-0055. This page is the part a person needs at the keyboard: the word to
use, the one place the company is named, and the form a claim has to take before it may be printed.

## The vocabulary

`motion` is the copy's word for what a participant **raises**, the network **carries**, and the
outcome **settles**. It replaces four words the copy used to use for the same thing:

| Not in copy | In copy  | Because                                                         |
| ----------- | -------- | --------------------------------------------------------------- |
| `request`   | `motion` | a motion is not an ask; it is put forward, carried and settled  |
| `action`    | `motion` | an action is a verb; the thing that travels is a noun           |
| `job`       | `motion` | a job is a unit of work for one machine, not a thing peers send |
| `event`     | `motion` | an event is a record of what happened, not what was sent        |

The rule binds the copy and not the tables. A record keeps the name it was created with - `Event`,
`vote.cast`, `scrape.started`, the `event append` and `event tail` commands - because renaming a
schema to match a brand is a migration with no product benefit, and RFC-0019 already defines `event`
as one append-only fact about something that happened.

Two words stay apart on purpose:

- **motion** - a unit of action between participants, carried by the network.
- **event** - the pipeline's own append-only record of something that happened locally: a scrape, a
  publish, a build. The Activity page counts events because it reports the pipeline, not the
  network, and calling a scrape a motion would name a participant that does not exist.

The noun lives in `Content/String/Word/Motion.md` and `Word/Motions.md` and reaches a page as
`Content.Word.Motion`, so a surface that counts motions counts them in the same word.

## The brand appears once

`Content/String/Brand/Attribution.md` is the only file that names the company, and the shell renders
it in the footer's signature line beside the licence and the year:

```
Carried by DELO · MIT · 2026
```

The network keeps the name its operator gave it, `Content/String/Brand/Title.md`. A hosted
deployment names the network after its owner, not after the company carrying it, because a carrier
that signs every surface is advertising at its users.

The count is over `Source/` and `Content/` together, and the compiled mirror is excluded:

```sh
grep -rn "DELO" Source/ Content/ --exclude-dir=Generated    # one line: Content/String/Brand/Attribution.md
grep -rn "DELO" Source/ --exclude-dir=Generated             # no match
```

`Source/Generated/Content.ts` is written from `Content/` on every config load, so the attribution
appears there by construction. Counting it would make one mention look like two; the guard reports
it as `INFO` and counts the copy.

## The claim form

A showcase claim is a capability the reader can check, not an adjective (RFC-0053, RFC-0046 rule 2).
Every file under `Content/String/Claim/` therefore names a record - `RFC-NNNN` - and a claim that
talks about cryptography names its cipher suite as well.

| Claim        | Says                                                  | Names                                           |
| ------------ | ----------------------------------------------------- | ----------------------------------------------- |
| `Motion`     | what a motion is, and that it is idempotent           | RFC-0024, RFC-0026                              |
| `Cipher`     | the content is unreadable to the operator             | AES-GCM-256, HKDF-SHA256, X25519, RFC-0013      |
| `Grant`      | the reader decides who sees it                        | the `see` step, AES-GCM-256, RFC-0047, RFC-0013 |
| `Moderation` | the operator cannot moderate what it cannot read      | the report row, RFC-0031                        |
| `Status`     | the operator answers for the network, not the content | RFC-0048, RFC-0038                              |

The two forms are not interchangeable:

- `E2E - X25519 / ChaCha20-Poly1305` is a claim, because a reader can hold it against RFC-0013.
- `End-to-end encrypted` is not, because there is nothing to hold it against. A capability whose
  protocol cannot be named is `UNKNOWN`, and UNKNOWN is drawn rather than described.

Copy reaches a page through `@Library/Content.ts` like every other string: `Content.Claim.Cipher`,
`Content.Claim.Grant`, and so on. No claim is written into a component, and the guard fails a claim
file that has no key in `Source/Library/Content.ts`.

## The operator's side

The split RFC-0038 draws is the product's own (RFC-0055 rule 5). The operator owes:

- availability of the network it runs;
- authenticated transport between peers;
- a truthful status surface, reporting what it can actually observe - connection, sync, queue depth,
  failures (RFC-0048).

It owes no opinion on what travels. A support question about content is answered by naming the peer
who authored the motion, never by inspecting it, and the status surfaces are what make that answer
credible: they show what the operator can see, which is the connection and not the payload.

## The guard

`Scripts/Position.mjs` is plain JavaScript with no dependencies, because it runs before anything is
compiled. Three checks, each of which can fail:

1. **The brand appears once.** One mention, in the attribution file; `Source/` names it zero times.
2. **One word for the unit of action.** No `request`, `job` or `action` anywhere under `Content/`,
   matched as whole words, so `redaction` is not `action`.
3. **A claim names its protocol or its record.** Every claim names a record; a claim about
   cryptography names a cipher suite; every claim has a key in the content wrapper.

```
$ node Scripts/Position.mjs
== brand
INFO Source/Generated/Content.ts carries it 1 time(s) - the same string, compiled; the count above is the copy
PASS Content/String/Brand/Attribution.md names it once, and Source/ names it 0 times
== vocabulary
PASS no copy calls a motion a request, a job or an action
== claims
PASS Cipher: RFC-0013
PASS Grant: RFC-0047
PASS Moderation: RFC-0031
PASS Motion: RFC-0024
PASS Status: RFC-0048
---
RESULT positioned
```

It degrades rather than crashes: a tree with no content wrapper reports every claim as missing its
key, and `--root <path>` points the guard at a fixture so a failure path can be tested without
breaking the real tree. Exit 0 means the position holds, exit 1 means it does not.

## Claim → test

| Claim                            | Test                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| The brand appears once           | `node Scripts/Position.mjs` → `PASS`, one mention, in the attribution file                      |
| A second mention fails           | a `DELO` in any `Source/` file → `FAIL`, exit 1                                                 |
| The vocabulary is used           | `grep -rniE "\b(requests?\|jobs?\|actions?)\b" Content/` → no match                             |
| A banned word fails              | an `action` in a content file → `FAIL` naming the file and the line                             |
| Every claim names a record       | `node Scripts/Position.mjs` prints the RFC each claim is decided by                             |
| A cipher claim names its suite   | a claim about encryption with no suite → `FAIL`, exit 1                                         |
| A claim resolves through Content | every `Content/String/Claim/*.md` has a `CONTENT_STRING_CLAIM_*` in `Source/Library/Content.ts` |
| The guard runs in the check      | `pnpm run check` ends with `RESULT positioned`                                                  |
