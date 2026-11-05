# Showcase layout research

What four published pages do with their vertical space, and which of it this repository took.

The question was narrow: a page that holds no records still has to be worth scrolling. These four
were chosen because each solves that differently, and none of them is a bento grid.

---

## Method

Each page was read once through the local Crawl4AI server, which renders in a real browser and
returns Markdown. The bodies are not stored in this repository - vendor prose in a public tree is a
licensing question, and none of it is needed. What is stored here is the structure, which is what
the layout borrows.

```sh
read_url.py "<url>" --max-chars 3000 --out "ref-<hash>.md"
```

The signal taken from each was the heading skeleton: how many sections, how many blocks under each,
and what the blocks are. Spacing is not visible in Markdown and was not taken from it; the
dispersion was designed against the composition's own rhythm instead.

---

## What each page does

**`[vendor]/en/harness`** - three sections, six blocks. One hero claim (`Ready to use. Right now.`),
then a single section heading (_Expanding capabilities. Work on your terms._) over four feature
blocks, then a developer-experience section over two, then an ecosystem close.

The pattern: **one claim, one heading, four blocks.** The section heading carries the argument and
the blocks are evidence, so no block needs a sentence of context above it.

**`customer.io`** - seven sections. The load-bearing one is _Everything you need to engage
customers_ over **five** linked cards: Journeys, Audiences, Data & integrations, Design Studio,
Analytics. Each card is a name plus one sentence. A later section (_Meet your AI Agent_) repeats the
shape at three.

The pattern: **five named capabilities, one sentence each.** The names are the product's nouns, not
benefits - which is why the set reads as a system rather than a list of promises.

**`mastercard.com/…/mastercard-agent-pay`** - thirteen sections, and the ones that matter are the
named pillars: **Trust, Security, Visibility**, each a heading over a short body. A stat strip
(`800M`, `20%`, `39%`) opens the page.

The pattern: **three pillars, named.** The pillar names are abstract enough to survive a redesign,
which is what makes them usable as a closing band.

**`mastercard.com/…/mastercard-signals`** - four sections, fifteen large cards (report covers), each
linking out. Almost no body copy at all.

The pattern: **few, large, dispersed.** The page is mostly air and the cards are far apart, so each
one is read rather than scanned.

---

## What this repository took

The composition's showcase surface (`Source/Component/Showcase/Spread.astro`, RFC-0053) is the four
patterns combined:

- **one hero claim** from the [vendor] page, with nothing under it but air;
- **six boxes**, one per capability - the rail, the drawer, the seam, the canvas, the network, a
  motion - each an eyebrow, a heading and one sentence;
- **three closing pillars** - Authenticated, Encrypted, Authorised - which are the swimlane steps
  (RFC-0047), not a marketing triple;
- **dispersion** from the Signals page: boxes alternate left and right rather than aligning, and the
  gaps are `5.5rem` against the canvas's `1.25rem`.

The measured result, from a probe of the built page:

```
six boxes                                  6
boxes alternate their offset               201,569,201,581,201,384
the vertical gap exceeds the canvas rhythm 87,89,88,87,89
pillars are three columns                  3
```

---

## What was refused, and why

- **The stat strip.** The Mastercard page opens with three numbers. This deployment has no honest
  numbers to put there - a count of records on a page that reads no collection would be a lie on
  every cache, and RFC-0050 forbids a value without its age.
- **"Book a demo", "request access", "sign up".** All three are standard furniture on these pages
  and none can be honoured by this deployment. RFC-0053 rule 5 forbids an action the product cannot
  perform.
- **Benefit-led headings.** The four pages all name capabilities rather than outcomes, and that is
  the part worth copying exactly: `Audiences`, not `Reach more people`.

---

## The one thing the pictures could not give

None of this describes spacing, and spacing is most of what makes those pages feel the way they do.
The values here come from the composition's own scale - the tile radius, the three greys, the type
steps - because a showcase page that borrowed another site's rhythm would stop being a demonstration
of this system and become a copy of someone else's.

That is the rule for the next page built from this research: take the structure, never the values.
