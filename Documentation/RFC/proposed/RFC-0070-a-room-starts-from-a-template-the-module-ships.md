---
title: A room starts from a template the module ships
rfc: 0070
category: Architecture/Network
kind: rfc
date: 2026-11-02
status: proposed
horizon: next
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: room creation, the module's initial rows, the rule set, seeding
supersedes: none
superseded_by: none
depends:
    - "RFC-0025 §1 (the module is a versioned artifact and the template is a row inside it)"
    - RFC-0014 (room creation is a publish)
    - "RFC-0031 §6 (a rule set exists at creation and is versioned)"
    - RFC-0012 (the audience defaults a template supplies)
    - RFC-0062 (seeding from an archive is an import)
    - |-
        RFC-0045 (a template names no visual choice); implementing card to be created: "Room template row and the creation transaction"
statuses:
    - name: A template is a named set of initial rows, versioned with the module
      state: open
      evidence: the rule names no file or command
    - name: The host authors the template, the module carries it, the room's authority...
      state: open
      evidence: the rule names no file or command
    - name: A template ships no content
      state: open
      evidence: the rule names no file or command
    - name: A template may ship empty structure that looks like content
      state: open
      evidence: the rule names no file or command
    - name: The template's rule set is a default, not a law
      state: open
      evidence: the rule names no file or command
    - name: Seeding from a person's archive is an import, not a template
      state: open
      evidence: the rule names no file or command
    - name: A template is small enough to read
      state: open
      evidence: the rule names no file or command
    - name: A template is not a theme
      state: open
      evidence: the rule names no file or command
---

## Decision

A new room is created from a template that is part of the module artifact, and the template supplies
structure - the rule set, the audience defaults, the channels - and no content.

1. **A template is a named set of initial rows, versioned with the module.**
   `{templateId, version, ruleSet, audienceDefaults, channels[], retentionTerms, seedPolicy}`. It
   ships inside the artifact (RFC-0025 §1), so a room's template is identified by the same hash as
   its module and cannot drift from it.
2. **The host authors the template, the module carries it, the room's authority accepts it.**
   RFC-0025 §3 makes the artifact composed and published; the template is one of its rows. A room's
   authority chooses a template at creation and may amend the rules afterwards as a recorded act
   (RFC-0031 §6), and the choice is a row so a member can see what the room started from.
3. **A template ships no content.** Not a welcome post, not a pinned example, not a demo thread.
   Starter content is authored by whoever writes it, with their key, and a template's text would be
   the host's words attributed to nobody - which RFC-0036 §3's impersonation rule and RFC-0060's
   chain both refuse.
4. **A template may ship empty structure that looks like content.** A channel with no posts, a rule
   set with no decisions, a retention term with a default. The distinction is that structure has no
   author and content does, and a template that crosses it has created a post nobody wrote.
5. **The template's rule set is a default, not a law.** The rule set is a versioned row at creation
   (RFC-0031 §6); the template supplies version 1 and a room that changes it records the change. A
   template that could not be changed would make the host the room's legislature.
6. **Seeding from a person's archive is an import, not a template.** A room created from an existing
   archive uses RFC-0015's import through RFC-0062's adapter, which carries authorship and marks
   foreign rows. A template is structure and an import is content, and conflating them would give a
   room's first posts an author they do not have.
7. **A template is small enough to read.** A template that is a thousand rows is a product, not a
   default, and a member joining a room should be able to read what the room started with. The limit
   is a review rule rather than a schema constraint, stated because every default that grows becomes
   unreadable.
8. **A template is not a theme.** Layout, colour and typography are RFC-0045's tokens and RFC-0049's
   component states; a template names no visual choice. A template that shipped a look would make
   every room running it look like the host, which is the opposite of the brand-once rule.

## Context

RFC-0025 §1 makes a room a pair of artifact hash and database identity, and RFC-0014 makes room
creation the publication of a module. Neither says what rows exist in the first transaction, and
that is the gap: a room created with no rule set has no rules to cite (RFC-0031 §6), and a room
created with no audience defaults has to be configured before it can be used.

The failure this record prevents is the ordinary one. Every product that ships a template ships a
welcome post, and the welcome post is text with no author. In this system that is not cosmetic: a
post is signed by a key (RFC-0013, RFC-0060) and the host holds no key that may write into a room.
The template's content half is therefore unavailable rather than merely discouraged, which is why
rule 3 is a statement about the cipher and not a matter of taste.

Nothing of the kind exists. `ls Maintain/Source/Command/` has no Room command, and the module's
schema (`Maintain/Spacetime/spacetimedb/src/Schema.ts:14-135`) declares six tables - `post`,
`author`, `media`, `observation`, `event` and a `membership` relation that is a curated-list join
(RFC-0014's Context) - with no rule-set, template or channel table among them.

## Alternatives considered

| Option                                              | Why not chosen                                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A template that ships a welcome post                | the post has no author, and authorship here is a signature the host cannot produce                                      |
| A template as a downloadable file the room applies  | a second artifact to version, sign and review beside the module, and one that can drift from the module's schema        |
| No template at all                                  | every creation is a blank schema and a rule set typed from memory, and RFC-0031 §6 requires a rule set at creation      |
| The host configures each room on request            | the host becomes a party to every room's rules, which RFC-0027 §4's non-powers refuse                                   |
| Templates per vertical (a book club, a study group) | useful, and each one is a template version; the record permits many and names the size limit instead of forbidding them |
| Seed a room by copying another room's rows          | it copies other people's authorship into a room that did not have it; that is an import with an origin, not a template  |
| A template that also sets the visual theme          | it would make every room running it look like the host, and RFC-0045 already owns tokens                                |

## Consequences

- Room creation is one transaction with a known set of rows, so a room's first state is reproducible
  and a bug in it is a bug in the template's version rather than in a person's configuration.
- Because the template is inside the artifact, changing a template is a module version and a rollout
  (RFC-0016 §2) - heavier than a config change and the right weight for something every new room
  inherits.
- A room's authority can amend its rules while a member can always see what it started from, a small
  accountability that costs one row.
- "No content" makes a new room look empty, so the empty state is the product's job (RFC-0050,
  RFC-0017) and a template cannot paper over it.
- Several templates mean the artifact carries several rule sets, so reviewing a module includes
  reviewing every template in it.

## Verification

| Claim                             | Test                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A template is in the artifact     | `spacetime describe <room> --json` returns the artifact hash, and the room's `template` row names a version inside it (intent) |
| A template ships no content       | create a room from every shipped template; `select count(*) from post` is 0 in each (intent)                                   |
| A rule set exists at creation     | the room's first rule-set version exists before any member joins (RFC-0031 §6, intent)                                         |
| The template is recorded          | the room's `template` row names the id and version, and the creation event carries it (intent)                                 |
| A room may amend its rules        | change the rule set after creation; a new version exists and the original still reads (RFC-0031, intent)                       |
| Seeding is an import              | create a room from an archive; rows carry `origin` and `signature: null` (RFC-0015, RFC-0062, intent)                          |
| A template names no visual choice | the template's schema has no colour, font or layout field, and `jq 'keys'` on a template row lists none (intent)               |

## Open questions

- Whether a template may declare channels, or whether a channel is a room and a room is one channel.
  RFC-0025 §5's live rows and RFC-0012's audiences can express a channel as an audience tier; a
  channel as a first-class row is a second structure this record does not decide.
- Whether the host should publish a catalogue of templates, which is RFC-0058's discovery question
  applied to templates rather than rooms.
- Whether a room should export its template with its export, so the room can be recreated from an
  archive alone. RFC-0015's manifest names the module; naming the template would make the export
  self-sufficient.
- UNKNOWN whether a room's initial rows can be written in the same transaction as the database's
  creation, or whether `init` and a first reducer call are two steps. Spike: publish a module with
  an `init` hook that writes a rule set, then describe the database.
