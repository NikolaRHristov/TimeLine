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

The noun lives in `Content/String/Word/Motion.md` and reaches the page as `Content.Word.Motion`,
which is what the showcase's motion card is labelled with - the word is printed, not just declared.
A surface that counts motions adds the plural in the same change that needs it.

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

A page that renders `Bare` has no shell and therefore no signature line. `/Workspace` is that page:
the composition owns the viewport, and a footer under it would push every proportion the design
states in absolute pixels.

## The claim form

A showcase claim is a capability the reader can check, not an adjective (RFC-0053, RFC-0046 rule 2).
Every card body and pillar note on a showcase page names a record - `RFC-NNNN` - and a claim that
talks about cryptography names its cipher suite as well.

| Claim on the page      | Says                                                 | Names                                      |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `Card/Provenance`      | the rail counts collections, so it cannot disagree   | RFC-0001                                   |
| `Card/Drawer`          | nothing reaches a canvas without a publish record    | RFC-0043                                   |
| `Card/Seam`            | publishing is the only verb that crosses             | RFC-0043                                   |
| `Card/Canvas`          | a tile carries its own placement                     | RFC-0045                                   |
| `Card/Network`         | the operator cannot read, index, rank or moderate it | AES-GCM-256, X25519, RFC-0026, RFC-0031    |
| `Card/Motion`          | what a motion is, and that it is idempotent          | RFC-0024, RFC-0026                         |
| `Pillar/Authenticated` | both halves of the handshake are drawn               | RFC-0047, RFC-0013                         |
| `Pillar/Encrypted`     | the suite, not a summary of it                       | AES-GCM-256, HKDF-SHA256, X25519, RFC-0013 |
| `Pillar/Authorised`    | `see` is the first permission, and grants are named  | RFC-0047                                   |

The two forms are not interchangeable:

- `E2E - X25519 / ChaCha20-Poly1305` is a claim, because a reader can hold it against RFC-0013.
- `End-to-end encrypted` is not, because there is nothing to hold it against. A capability whose
  protocol cannot be named is `UNKNOWN`, and UNKNOWN is drawn rather than described.

Copy reaches the page through `@Library/Content.ts` like every other string: the cards are
`Content.Page.Showcase.Card.<Name>.{Title,Body}`, the pillars
`Content.Page.Showcase.Pillar.<Name>. {Name,Note}`. No sentence is written into a component, and the
guard reads the copy where the page prints it - a claim kept in a file of its own would be a
sentence the site ships without printing.

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
3. **A claim names its protocol or its record.** Every `Card/*/Body.md` and `Pillar/*/Note.md` under
   `Content/String/Page/Showcase/` names a record, and a claim about cryptography names a cipher
   suite. A card title and the masthead do not: a heading is a heading, and a rule that demanded a
   cipher suite from one would be obeyed by making the headings worse.

```
$ node Scripts/Position.mjs
== brand
INFO Source/Generated/Content.ts carries it 1 time(s) - the same string, compiled; the count above is the copy
PASS Content/String/Brand/Attribution.md names it once, and Source/ names it 0 times
== vocabulary
PASS no copy calls a motion a request, a job or an action
== showcase
PASS Card/Canvas/Body
PASS Card/Drawer/Body
PASS Card/Motion/Body
PASS Card/Network/Body
PASS Card/Provenance/Body
PASS Card/Seam/Body
PASS Pillar/Authenticated/Note
PASS Pillar/Authorised/Note
PASS Pillar/Encrypted/Note
---
RESULT positioned
```

It degrades rather than crashes: a tree with no showcase copy reports `INFO` and passes, and
`--root <path>` points the guard at a fixture so a failure path can be tested without breaking the
real tree. Exit 0 means the position holds, exit 1 means it does not.

## Claim → test

| Claim                           | Test                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- |
| The brand appears once          | `node Scripts/Position.mjs` → `PASS`, one mention, in the attribution file      |
| A second mention fails          | a `DELO` in any `Source/` file → `FAIL`, exit 1                                 |
| The vocabulary is used          | `grep -rniE "\b(requests?\|jobs?\|actions?)\b" Content/` → no match             |
| A banned word fails             | an `action` in a content file → `FAIL` naming the file and the line             |
| A showcase claim names a record | every `Card/*/Body.md` and `Pillar/*/Note.md` prints `PASS` under `== showcase` |
| A cipher claim names its suite  | a claim about encryption with no suite → `FAIL`, exit 1                         |
| The guard runs in the check     | `pnpm run check` ends with `RESULT positioned`                                  |
