# RFC index

Design records for this repository, in the house format used across the wider tree: one file per
decision, numbered, living under `proposed/` until the work lands and then moved to `implemented/`.
A card references its RFC by number; an RFC references the cards that implement it.

## Conventions

| Item         | Rule                                                   |
| ------------ | ------------------------------------------------------ |
| Filename     | `RFC-NNNN-kebab-case-title.md`                         |
| Location     | `proposed/` while open, `implemented/` once shipped    |
| Numbering    | assigned on creation, never reused                     |
| Supersession | a new RFC marks the old one `Superseded by`, both stay |
| Cards        | every RFC names the cards that implement it, by id     |

## Open

| RFC      | Title                              | Decision class | Cards                  |
| -------- | ---------------------------------- | -------------- | ---------------------- |
| RFC-0001 | Storage and projection model       | architecture   | t_fe20eeee             |
| RFC-0002 | Single schema source of truth      | architecture   | t_fe20eeee             |
| RFC-0003 | Transport seam                     | architecture   | t_7936cc8e             |
| RFC-0004 | Ingress and job orchestration      | architecture   | -                      |
| RFC-0005 | Network substrate                  | product        | t_1621cc5c             |
| RFC-0006 | Harvesting posture                 | policy         | -                      |
| RFC-0007 | Privacy, encryption and validation | policy         | -                      |
| RFC-0008 | Media handling                     | architecture   | -                      |
| RFC-0009 | Build, release and toolchain       | methodology    | t_17031e18, t_6e510f8e |
| RFC-0010 | Documentation and template policy  | governance     | t_34ee3d19, t_bceac9f5 |

## Settled already, by evidence rather than debate

These are not RFCs; they are facts the RFCs build on. Each has a test in the referenced document.

| Fact                                             | Where it is proven                               |
| ------------------------------------------------ | ------------------------------------------------ |
| The site is static and deploys on push           | `Documentation/Reference/Firebase.md`            |
| Firebase is backend only, no hosting block       | `Documentation/Reference/Firebase.md`            |
| A scrape opens its own background tab            | `Documentation/Plan/Bookmark-Pipeline.md`        |
| Redirects are generated, never hand-written      | `Documentation/Reference/Redirect-Generation.md` |
| The projection lags the files today (207 vs 209) | `Documentation/Reference/Spacetime.md`           |

## Writing an RFC

Copy `TEMPLATE.md`, assign the next number, and keep the Decision section to what is being decided -
context and alternatives belong below it. An RFC that cannot name its verification is not ready.
