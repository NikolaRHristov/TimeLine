---
title: The material, the tokens and the component contract
rfc: 0045
category: Contract/Surface
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: |-
    every sheet under `Source/Stylesheet/`, every component under `Source/Component/`, every page under `Source/pages/`, and `Source/Layout/Base.astro`
supersedes: none
superseded_by: none
depends:
    - RFC-0009 (the build that compiles a sheet)
    - RFC-0010 (documentation voice)
    - RFC-0017 (the client surface this material dresses)
    - "RFC-0019 (vocabulary); `t_15d5d8fd` (the token set promoted to the whole site)"
    - "`t_30030978` (the token contract tests)"
    - "`t_6b11bda7` (the fidelity pass)"
    - "`t_bd4c07b0`"
    - "`t_e2a377d0`"
    - "`t_52a99949` (the surfaces that adopt the material)"
statuses:
    - name: The site is built from one material, one token set, one stage map and one...
      state: open
      evidence: the rule names no file or command
---

## Decision

The site is built from one material, one token set, one stage map and one component contract, and
each of the four is a single artifact that every other file reads. A surface is a value step rather
than a shadow; a colour is a token rather than a literal; a stage accent is an entry in one map
rather than a decision each sheet makes; a component receives its data and its state as props and
never reads a collection. The rules below are the whole contract, and a change that breaks one is a
defect in the change rather than a preference about the design.

## The material

### The nouns

Five nouns describe every drawn thing on the site, plus the live state of one of them. A part is one
of the five or a composition of them; there is no sixth.

| Noun          | What it is                                       | Mixin     | Fill               | Edge                       | Corner            |
| ------------- | ------------------------------------------------ | --------- | ------------------ | -------------------------- | ----------------- |
| **Surface**   | the ground a workspace region sits on            | `panel`   | `--chrome-void`    | none                       | none              |
| **Face**      | a region that sits above the ground              | `face`    | `--chrome-deep`    | 1px `--chrome-line`        | `--radius-column` |
| **Live face** | the face a person is working in                  | `face`    | `--chrome-raised`  | 1px `--chrome-line-strong` | square top-left   |
| **Card**      | a record inside a face                           | `card`    | `--chrome-control` | 1px `--chrome-line-strong` | `--radius-card`   |
| **Control**   | a pressable that holds no record                 | `control` | `--chrome-control` | 1px `--chrome-line-strong` | `--radius-card`   |
| **Inset**     | a groove that carries a fill rather than content | `inset`   | `--chrome-control` | none                       | 2px               |

Three consequences follow from the table and are part of the contract:

- **A card and a control differ in what they hold, not in what they are.** Both take the control
  fill and the strong line; a control is a card that performs an action, and a row is a card that
  holds a record. A control has no leading element, and a row always has one.
- **An inset reads as a groove because it has no edge.** It is the control fill with no border and a
  2px corner, drawn inside a surface. It is not darker than the card beside it; the missing border
  is what makes it read as recessed.
- **The live face is a face with one corner changed.** It takes the raised fill and the strong line
  and squares its top-left corner so it rises into the tab row above it. No other part carries that
  corner, and no heading colour or underline is added to say the same thing twice.

The paper ramp carries the same nouns. The note is `card` with `--color-surface` and `--color-line`;
a pill is `control` with the same pair and `--radius-full`. A surface on the published side is
`--color-surface`; a sunken face on it is `--color-surface-sunken`.

### Depth is drawn

Depth is a value step, an edge, a corner, a coloured edge or a transparency. It is never simulated.
The five ways, and the one thing each is for:

| Way               | How it is drawn                                                                 | Where it is used                                |
| ----------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Value step**    | the next step of a ramp: `void` < `deep` < `raised` < `control` < `active`      | a face on a surface, a card on a face           |
| **Edge**          | 1px of a line token; the strong weight where a person has to find the edge      | every face, card and control                    |
| **Corner**        | a radius step, or the squared top-left of a live face                           | faces, cards, the live column                   |
| **Coloured edge** | 3px of a stage accent along a tile's top edge; 1px of it around a selected row  | a published tile, a selected drawer row         |
| **Transparency**  | the stage's own accent at 8%, or a fade from the surface to its zero-alpha form | the selected band's plate, the drum's two fades |

The prohibitions are as binding as the ways:

- **No cast shadow.** A shadow asserts a light source the composition does not have, and at 9px type
  a blurred edge reads as dirt rather than as height.
- **No blur.** A `filter` that softens a surface destroys the flat fill the material is made of.
- **No gradient except the two drum fades.** The fades are the one place a gradient is permitted:
  exactly two `linear-gradient`s, both in the rail, both 40px tall, one at the drum's top edge and
  one at its bottom, each running between `--chrome-void` and its zero-alpha form. A third gradient
  anywhere is a defect.
- **No opacity on a surface as a substitute for depth.** Opacity is permitted where it encodes
  distance (the drum's ladder) or absence (the drop ghost at 0.5, which is an invitation rather than
  a record), and nowhere else.

### The drum

The rail's perspective is one table indexed by distance from the selected stage. It is data, held by
the component, not styling held by the sheet: a stage further away than the last entry reuses the
last entry, which is what lets the rail hold any number of stages without a new rule.

| Distance | Height | Opacity | Marker | Marker radius | Border | Track | Label |
| -------- | ------ | ------- | ------ | ------------- | ------ | ----- | ----- |
| 0        | 44     | 1.00    | 12     | 6             | 2      | 12    | 10    |
| 1        | 28     | 0.72    | 12     | 6             | 2      | 14    | 9     |
| 2        | 22     | 0.55    | 10     | 5             | 1      | 12    | 8     |
| 3        | 16     | 0.38    | 10     | 5             | 1      | 16    | -     |
| 4        | 12     | 0.28    | 8      | 4             | 1      | 12    | -     |
| 5        | 10     | 0.22    | 6      | 3             | 1      | 10    | -     |
| 6        | 8      | 0.18    | 6      | 3             | 1      | 8     | -     |

Every dimension in the table reaches the sheet as a custom property set by the component
(`--band-height`, `--band-opacity`, `--band-label-size`, `--marker-size`, `--marker-radius`,
`--marker-border`, `--marker-top`, `--track-height`, `--band-progress`). A sheet that hardcoded
seven band heights would make an eighth stage a stylesheet change, which is what the table exists to
avoid.

### The mixins

`Source/Stylesheet/Material.scss` holds one mixin per noun plus three that are vocabulary rather
than shape. A component sheet states structure and reads a mixin for everything else.

| Mixin      | What it draws                                      | Parameters                             |
| ---------- | -------------------------------------------------- | -------------------------------------- |
| `panel`    | a surface: the void fill and the body ink          | none                                   |
| `face`     | a face: fill, 1px edge, column radius              | `$surface`, `$line`, `$radius`         |
| `card`     | a card: fill, 1px edge, card radius                | `$surface`, `$line`, `$radius`         |
| `control`  | a control: fill, 1px edge, card radius, muted ink  | `$surface`, `$line`, `$ink`, `$radius` |
| `inset`    | a groove: a fill with no edge and a 2px corner     | `$height`, `$radius`, `$track`         |
| `label`    | the eyebrow voice: uppercase, tracked, faint       | `$size`, `$ink`                        |
| `ellipsis` | one-line truncation                                | none                                   |
| `reset`    | a `<button>` made to look like the row it replaced | none                                   |

Each mixin defaults to the chrome ramp and takes the ramp's values as arguments, so the same shapes
are available on the paper ramp. A sheet that names a fill or a line directly instead of calling a
mixin is a second place the palette lives.

## The token set

`Source/Stylesheet/Global.css` declares every value two or more surfaces must agree on. Nothing else
declares one. The set is two ramps plus the scales, and the tables below are the set: a token added,
renamed or removed is an edit to this section in the same change, because a table that lags the file
specifies nothing.

### The paper ramp

| Token                    | Value     | Reads                                                     |
| ------------------------ | --------- | --------------------------------------------------------- |
| `--color-surface`        | `#ffffff` | `Note.scss` (a panel's fill), `Pill.scss` (a pill's fill) |
| `--color-surface-sunken` | `#f5f5f5` | `Note.scss` (the inline-code fill)                        |
| `--canvas`               | `#fafafa` | `Bento.scss` (the mosaic ground)                          |
| `--tile-1`               | `#e2e2e2` | `Bento.scss` (the `sunken` tone)                          |
| `--tile-2`               | `#e9e9e9` | `Bento.scss` (the `plain` tone, the default)              |
| `--tile-3`               | `#eee`    | `Bento.scss` (the `quiet` tone, an empty tile)            |

### The line ramp

| Token                 | Value     | Reads                                                             |
| --------------------- | --------- | ----------------------------------------------------------------- |
| `--color-line-faint`  | `#f5f5f5` | `Global.css`, through `--hairline-faint`                          |
| `--color-line`        | `#e5e5e5` | `Global.css`, through `--hairline`; `Note.scss`; `Pill.scss`      |
| `--color-line-strong` | `#d4d4d4` | `Roster.scss` (a label's underline); `Pill.scss` (a hovered edge) |

### The ink ramp

| Token               | Value     | Reads                                                                                             |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `--color-ink`       | `#171717` | `Global.css` (the focus ring), `Note.scss`, `Bento.scss`, `Roster.scss`, `Pill.scss`, `Page.scss` |
| `--color-ink-muted` | `#525252` | `Note.scss`, `Bento.scss`, `Roster.scss`, `Pill.scss`, `Page.scss`                                |
| `--color-ink-faint` | `#737373` | `Bento.scss`, `Roster.scss`, `Page.scss`                                                          |

### The scales

| Token              | Value                               | Reads                                                                                                |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--space-1`        | `0.25rem`                           | `Note.scss`, `Roster.scss`, `Pill.scss`, `Shell.scss`, `Page.scss`                                   |
| `--space-2`        | `0.5rem`                            | `Note.scss`, `Bento.scss`, `Roster.scss`, `Pill.scss`, `Provenance.scss`, `Shell.scss`, `Page.scss`  |
| `--space-3`        | `0.75rem`                           | `Note.scss`, `Roster.scss`, `Pill.scss`, `Drawer.scss`, `Provenance.scss`, `Shell.scss`, `Page.scss` |
| `--space-4`        | `1rem`                              | `Bento.scss`, `Drawer.scss`, `Provenance.scss`, `Shell.scss`, `Page.scss`                            |
| `--space-6`        | `1.5rem`                            | `Note.scss`, `Pill.scss`, `Shell.scss`                                                               |
| `--space-8`        | `2rem`                              | `Pill.scss`                                                                                          |
| `--space-10`       | `2.5rem`                            | `Shell.scss`, `Page.scss`                                                                            |
| `--text-3xs`       | `0.625rem`                          | `Shell.scss` (a sitemap's smallest line)                                                             |
| `--text-2xs`       | `0.6875rem`                         | `Material.scss`, the `label` mixin's default                                                         |
| `--text-xs`        | `0.75rem`                           | `Note.scss`, `Roster.scss`, `Pill.scss`, `Shell.scss`, `Page.scss`                                   |
| `--text-sm`        | `0.875rem`                          | `Note.scss`, `Roster.scss`, `Shell.scss`, `Page.scss`                                                |
| `--text-base`      | `1rem`                              | `Note.scss` (a note's title)                                                                         |
| `--text-lg`        | `1.125rem`                          | `Page.scss` (a section heading)                                                                      |
| `--text-2xl`       | `1.5rem`                            | `Page.scss` (a page title)                                                                           |
| `--font-mono`      | the system mono stack               | `Note.scss` (inline code), `Shell.scss` (the brand mark)                                             |
| `--radius-sm`      | `0.25rem`                           | `Note.scss`, `Shell.scss`                                                                            |
| `--radius-card`    | `0.5rem`                            | `Material.scss`, the `card` and `control` defaults                                                   |
| `--radius-column`  | `0.75rem`                           | `Material.scss`, the `face` default                                                                  |
| `--radius-tile`    | `1.5rem`                            | `Bento.scss`                                                                                         |
| `--radius-full`    | `9999px`                            | `Pill.scss`                                                                                          |
| `--hairline`       | `1px solid var(--color-line)`       | `Page.scss` (a heading's rule, a footer's rule)                                                      |
| `--hairline-faint` | `1px solid var(--color-line-faint)` | `Roster.scss` (the rule between rows)                                                                |
| `--header-height`  | `3.5rem`                            | `Shell.scss`                                                                                         |
| `--rhythm-block`   | `3rem`                              | `Shell.scss`, `Page.scss`                                                                            |
| `--content-width`  | `48rem`                             | `Shell.scss`, the `.page` column                                                                     |

### The chrome ramp

| Token                  | Value     | Reads                                                                                        |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `--chrome-void`        | `#1c1c1e` | `Material.scss` (`panel`), `Drawer.scss`, `Provenance.scss`, `Workspace.scss`                |
| `--chrome-deep`        | `#1f1f21` | `Material.scss` (the `face` default)                                                         |
| `--chrome-raised`      | `#232325` | `Drawer.scss` (the live column)                                                              |
| `--chrome-control`     | `#2c2c2e` | `Material.scss` (`card`, `control`, `inset`), `Drawer.scss`, `Provenance.scss`, `Shell.scss` |
| `--chrome-active`      | `#48484a` | `Drawer.scss` (the active view chip)                                                         |
| `--chrome-line`        | `#2e2e30` | `Material.scss` (the `face` default), `Drawer.scss`, `Provenance.scss`, `Shell.scss`         |
| `--chrome-line-strong` | `#3a3a3c` | `Material.scss` (`card`, `control`), `Drawer.scss`, `Shell.scss`                             |
| `--chrome-ink-white`   | `#ffffff` | `Provenance.scss` (a label on a stage's own colour)                                          |
| `--chrome-ink-bright`  | `#e5e5ea` | `Drawer.scss`, `Provenance.scss`, `Shell.scss`                                               |
| `--chrome-ink`         | `#d1d1d6` | `Material.scss` (`panel`), `Drawer.scss`, `Workspace.scss`                                   |
| `--chrome-ink-muted`   | `#8e8e93` | `Material.scss` (`control`, `label`), `Drawer.scss`, `Provenance.scss`, `Shell.scss`         |
| `--chrome-ink-faint`   | `#636366` | `Drawer.scss`, `Provenance.scss`                                                             |

### The rules

1. **One home.** A colour, a spacing step, a type step, a radius, a line weight and the measure are
   declared in `Global.css` and read everywhere else. A hex literal outside `Global.css` is a
   defect: it is invisible to a token change, so a theme edit reaches the sheets and not that file.
   The single exception is the `theme-color` meta tag in `Base.astro`, which is HTML metadata rather
   than a style, cannot read a custom property, and must equal the fill the shell header is drawn on
   (`--chrome-void`).
2. **A transparency is derived, not written.** A tint or a fade is
   `color-mix(in srgb, var(--token) <percent>%, transparent)`, and the drum's two fades run between
   `--chrome-void` and the `transparent` keyword. An `rgb()`, `rgba()` or `hsl()` triple is a hex
   with its digits rearranged and is a defect.
3. **No orphan token.** Every declared token is read by at least one sheet, mixin or component. A
   stage token is read when the stage map names it. A token with no reader is deleted or given a
   reader; it is never kept for a future use.
4. **No undefined token.** Every `var(--x)` resolves, either to a declaration in `Global.css` or to
   a custom property a component sets on the element. An unresolved custom property fails in
   silence, which reads as a colour or a dimension that has disappeared rather than as an error. The
   component-scoped set is closed: `--band-height`, `--band-label-size`, `--band-opacity`,
   `--band-progress`, `--band-tone`, `--ghost-tone`, `--marker-border`, `--marker-left`,
   `--marker-radius`, `--marker-size`, `--marker-top`, `--scroll-thumb`, `--tile-stage`,
   `--track-height`.
5. **Material is a token; geometry is the composition.** A value two surfaces must agree on is a
   token. A value that describes one part's own shape - a band's height, a chip's 6px corner, the
   10px gap between columns - stays in that part's sheet and is traceable to
   `Documentation/Reference/Design-Composition.md`. A geometry literal that appears in two sheets
   has become material and moves to `Global.css`.
6. **A breakpoint is an SCSS variable, not a custom property.** A custom property cannot be read
   inside a media query, so a breakpoint shared by two sheets is a `$` variable in `Material.scss`.
   The workspace fold is 900px.
7. **One sheet per component.** A component has one sheet, in SCSS, using the mixins. A `.css` and
   an `.scss` for the same part is two palettes waiting to disagree.
8. **An edge is a token, not a composition.** The paper ramp composes its edges as `--hairline` and
   `--hairline-faint`; the chrome ramp composes none, so three rules assemble one -
   `Provenance.scss` for the rail's right edge, `Shell.scss` for the header and the footer. A line
   is material, so it is composed once: `--hairline-chrome` declares the chrome edge, and the three
   rules read it instead of assembling a width and a colour.

## The stage accents

Seven accents, one per stage of the event pipeline. The four steps are the axis the rail draws; the
three kinds are the forms a record takes when it leaves a step. Each is a token in `Global.css` and
an entry in `Source/Library/Stage.ts`, which is the only place that answers which colour a stage
draws.

| Stage          | Kind | Token                | Value     | What it names                                                        | Where it is read                                           |
| -------------- | ---- | -------------------- | --------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| **source**     | step | `--stage-source`     | `#6366f1` | a record as it was captured: the post, its author, its metrics       | the rail's first band, the Bookmarks column, a tile's edge |
| **ingestion**  | step | `--stage-ingestion`  | `#34d399` | the event row recording the capture: its time, its transport         | the rail's second band                                     |
| **processing** | step | `--stage-processing` | `#f59e0b` | a scored record: a nomination, a vote count, a rank candidate        | the rail's third band                                      |
| **review**     | step | `--stage-review`     | `#ec4899` | the owner's decision: curated, ranked, approved                      | the rail's fourth band                                     |
| **file**       | kind | `--stage-file`       | `#f0a045` | a record stored as a file in the drawer                              | the Voted column                                           |
| **template**   | kind | `--stage-template`   | `#9b77fa` | a shape reused: a list, a column, a bento arrangement                | the Curated column                                         |
| **publish**    | kind | `--stage-publish`    | `#6e9efa` | a record that has left the private side: the canvas, a public handle | the Authors column, the canvas                             |

Four rules bind the set:

- **A colour is a claim about identity.** A band, a column head and an event row that share an
  accent are naming the same stage. None of the seven is decoration, so an element takes a stage
  accent only when it can say which stage it means.
- **The map is the only mapping.** A page passes a token reference - `StageAccent.source`,
  `ColumnAccent("bookmark")` - and never a value. A sheet may read a stage token directly, because
  that is a use rather than a map; a second module that names a stage accent is a defect.
- **A column feeds a stage; it is not a stage.** `ColumnStage` binds each drawer column to the stage
  it publishes into, and `StageKey` stays the four steps. Adding a step is a token, a map entry and
  a place in the pipeline, in that order; adding a column is one entry in `ColumnStage`.
- **A selected row takes the accent of the column it lives in.** The row receives it as
  `--ghost-tone`'s sibling - the column sets the tone for everything inside it - rather than reading
  a fixed accent. `Drawer.scss` currently draws every selected row in the source accent, which is
  the defect this rule replaces.

## The component API

A component under `Source/Component/Workspace/` receives everything it draws. The page derives; the
component renders.

| Component        | Prop                                | Kind  | Type                                                   |
| ---------------- | ----------------------------------- | ----- | ------------------------------------------------------ |
| **Workspace**    | `Stages`                            | data  | `Stage[]`                                              |
|                  | `Columns`                           | data  | `Column[]`                                             |
|                  | `Tiles`                             | data  | `Tile[]`                                               |
|                  | `Note`                              | data  | `string` - the rail's standing note                    |
|                  | `Eyebrow`                           | data  | `string` - the drawer's depth path                     |
|                  | `Title`                             | data  | `string`                                               |
|                  | `Hint`                              | data  | `string` - the lock line                               |
|                  | `Destination`                       | data  | `string` - what a drop lands on                        |
|                  | `Instruction`                       | data  | `string` - the seam's standing line                    |
| **Provenance**   | `Stages`                            | data  | `Stage[]`                                              |
|                  | `Selected`                          | state | `string` - a stage key                                 |
|                  | `Note`                              | data  | `string`                                               |
|                  | `OnSelect`                          | state | `(Key: string) => void`                                |
| **Drawer**       | `Eyebrow`, `Title`, `Hint`          | data  | `string`                                               |
|                  | `Columns`                           | data  | `Column[]`                                             |
|                  | `Active`                            | state | `string` - a column key                                |
|                  | `View`                              | state | `"graph" \| "list"`                                    |
|                  | `OnActivate`                        | state | `(Key: string) => void`                                |
|                  | `OnView`                            | state | `(View: DrawerView) => void`                           |
|                  | `OnOpen`                            | state | `(Id: string) => void`                                 |
|                  | `OnAdd`                             | state | `() => void`                                           |
|                  | `OnPublish`                         | state | `(Key: string) => void`                                |
| **DrawerColumn** | `Column`                            | data  | `Column`                                               |
|                  | `Active`                            | state | `boolean`                                              |
|                  | `OnActivate`, `OnOpen`, `OnPublish` | state | as above                                               |
| **DrawerItem**   | `Entry`                             | data  | `Entry`                                                |
|                  | `OnOpen`                            | state | `(Id: string) => void`                                 |
| **Bento**        | `Tiles`                             | data  | `Tile[]`                                               |
|                  | `Column`, `Row`                     | data  | `number` - the grid the empty fill is computed against |
| **Publish**      | `Label`                             | data  | `string` - the destination                             |
|                  | `Note`                              | data  | `string` - the standing instruction                    |
|                  | `Armed`                             | state | `string \| undefined` - the record a drop would file   |
| **Icon**         | `Name`                              | data  | `string` - a key of the closed set                     |
|                  | `Class`                             | data  | `string`                                               |

The four shapes a page builds are the component's public surface: `Stage`, `Column`, `Entry` and
`Tile`. A page constructs them from the content collections; a component does not reshape them.

Six rules complete the contract:

1. **Data flows down; state lives in one place.** `Source/Script/Workspace/Store.ts` holds the only
   signals - the selected stage, the live column, the view, the open record, the tiles published
   this session and the session slot - and every island reads them and dispatches to them, so a rail
   and a body on one page cannot disagree about what is selected or what is published. Every
   component is a function of its props, so the same component renders an empty archive and a full
   one.
2. **A component never reads a collection.** `astro:content` is imported by pages and by nothing
   under `Source/Component/`; the page derives the four shapes and hands them over. A component that
   read a collection would be a second source of truth, and the empty-archive state would differ
   between the two.
3. **A component never names a colour.** It receives a token reference and sets it as a custom
   property - `--band-tone` on a band, `--ghost-tone` on a drop ghost, `--tile-stage` on a tile - so
   the colour still resolves at paint time and a theme change reaches it.
4. **A drawn control is wired.** A callback that resolves to nothing is a defect: the control is
   either given its action or not drawn. `Workspace` currently passes `OnAdd` as a no-op while the
   drawer draws an add control.
5. **Placement is data.** A tile names the column and row it starts at and how many tracks it spans;
   the empty fill is derived from the placed tiles, never stored. Rearranging the canvas is a change
   to the array, not to the sheet.
6. **The icon set is closed.** A name outside the set renders nothing, which is a visible gap in
   review rather than a silent fetch of an unapproved glyph. Every icon is stroked in
   `currentColor`, so the container decides its colour.

## The measure

Prose keeps `--content-width` (48rem). An application surface opts into `.page--wide`.

- **The shell owns the measure.** `.page` is `width: 100%`, `max-width: var(--content-width)`,
  centred, with `--space-6` of inline padding. The header, the main column and the footer use it, so
  their left edges align at every width.
- **One opt-in per page.** `.page--wide` sets `max-width: none` and removes the inline padding.
  `Base.astro` takes `Wide?: boolean` and applies it to the `<main>` column only: the header and the
  footer keep the measure while the application surface is released, because the release is about
  the surface a person works in, not about the site's frame.
- **A surface that owns the screen drops the frame.** `Bare?: boolean` renders the page with no
  header, no footer and no block padding, because the workspace's rail starts at the viewport's
  top-left and a sticky header above it would break every proportion the composition states in
  absolute pixels. `Bare` and `Wide` answer different questions - one removes the frame, the other
  releases the measure - and a page that needs both states both.
- **No component sets its own width.** A component that capped itself would negotiate against the
  shell at every viewport, and two surfaces would disagree about the column by a few pixels that no
  one can name. `max-width` appears in the shell and in two media queries, and nowhere else.

The reason is one decision in one place. A drawer of columns and a six-track mosaic are laid out
against the viewport, not against a measure: a 48rem cap squeezes both, and the same cap is right
for a page of prose. Making the measure the shell's default and the release a page's single flag
keeps the decision in the shell, where a reader looks for it, and out of every component that would
otherwise repeat it.

## Fidelity

The Figma frame is the reference. `Documentation/Assets/Full Composition.png` is the frame, 1440 x
1300, and `Documentation/Reference/Design-Composition.md` holds its measured geometry - the four
bands, the drum's ladder, the drawer's header, columns and items, the seam and the canvas - read
from the file's own layer tree rather than estimated from the picture.

- **The numbers in the reference are the specification.** A component is checked against them, not
  against an impression of the image.
- **A divergence is recorded where the divergence lives.** A component that does not match a number
  in the reference records why in its own header comment: the number it does not use, the value it
  uses instead, and the reason. A comment that names a future task is not a record; the reason is.
- **A record beats a restatement.** Where the comment and this record disagree, the comment wins for
  that component and this record is corrected, because the component is the thing that renders.
- **The reference is not a mood board.** A number in it that a sheet hardcodes as a literal instead
  of reading a token is a defect in the sheet, not in the design - unless the number is that part's
  own geometry, which is where geometry is allowed to live.

## Context

The material exists and is one file: `Source/Stylesheet/Material.scss` holds eight mixins, and the
workspace sheets call them rather than naming a fill. The token set is one file:
`Source/Stylesheet/Global.css` declares the two ramps and the scales, and no other file declares a
colour. The stage map is one module: `Source/Library/Stage.ts` holds four steps, three kinds and the
column binding, and its values are `var(...)` references rather than hexes.

The colour rules had a check. The token contract, run as part of the gate, failed on five things: a
stray colour literal, an orphan token, an undefined token, a second stage map and a redefined
`Material` mixin. Every message named the file and the line. The contract is no longer in the tree,
so the five are review rules now, and this record is the statement they are reviewed against.

Three rules in this record are not checkable at all, and each already drifts:

- **A selected row reads a fixed accent.**
  `grep -n 'stage-source' Source/Stylesheet/Component/Drawer.scss` returns the selected-row rule:
  every selected row is drawn in the source accent, whichever column it lives in.
- **One drawn control has no action.** `grep -rn '=> undefined' Source/Component` returns
  `Workspace.tsx`, which passes `OnAdd` as a no-op while the drawer draws an add control.
- **Three edges are composed instead of read.** `grep -rn '1px solid var(' Source/Stylesheet`
  returns `Provenance.scss` and two rules in `Shell.scss`: each assembles a chrome edge from a width
  and a colour where the paper ramp reads `--hairline`.

The rest of the rules are review rules. A script cannot see that a component reads a collection or
that a gradient is the third one, and a reviewer comparing two files cannot see a hex that should
have been a token, because the defect looks like a value that works. The verification table below
says which claim each mechanism is responsible for.

The record is written in the voice RFC-0010 fixes for this tree: declarative, no identifiers, no
borrowed phrasing, and every claim carrying its test. Its geometry cross-references
`Documentation/Reference/Design-Composition.md` rather than restating a measurement the reference
already holds.

## Alternatives considered

| Option                                     | Why not chosen                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Tailwind utilities as the design system    | a utility is a value, not a name: a token change cannot reach it, and two surfaces agree only by coincidence          |
| A theme object in TypeScript               | a second palette in a second language, which is the arrangement the stage map exists to prevent                       |
| A component library with its own elevation | it brings a shadow-and-blur language that contradicts drawn depth, and the composition would be restyled around it    |
| Shadow-based elevation (Material Design)   | a cast shadow asserts a light source the composition does not have, and at 9px type a blur reads as dirt              |
| One stylesheet per page                    | the material is copied per page and two pages drift the first time one is edited                                      |
| A `.page--wide` per component              | every part would negotiate its own width against the shell, and the column would differ by a few pixels nothing names |
| A token per geometry value                 | a band's height belongs to one part; tokenising it makes the ladder a stylesheet edit and the component's data a lie  |

## Consequences

- A new colour is a `Global.css` edit plus a reader. It cannot be introduced inside a component, and
  a component that needs one is a component that is drawing something the material has no noun for.
- The stage set is closed by construction: a new stage costs a token, a map entry and a place in the
  pipeline, and the rail, the columns and the tiles pick it up without a sheet edit.
- Component sheets become structure-only. A reviewer reads every colour decision in the tree by
  opening one file.
- The drum's ladder is data, so the rail holds any number of stages and the sheet holds none of
  them.
- Geometry stays in the parts. A fidelity pass therefore edits sheets, deliberately: the alternative
  is a token per corner and a component that cannot state its own shape.
- No rule in this record has a check in the tree; all of them are review rules, and the record names
  them rather than implying that review covers everything.
- The record omits the template's `Date` field. Supersession orders this set, not recency: a reader
  asks which record replaced which, never which is newer.

## Verification

| Claim                                | Test                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every colour is a token              | `Source/Stylesheet/Global.css` is the only sheet that declares one; the `theme-color` meta is the one literal outside it (review rule)           |
| No rgb or hsl triple is written      | the same check covers `rgb()`; `grep -rn 'rgb(\|hsl(' Source/Stylesheet` returns no declaration                                                  |
| No orphan token                      | every token declared in `Global.css` has a `var()` reader in `Source/Stylesheet` (review rule)                                                   |
| No undefined token                   | every `var()` read resolves to a declaration in `Global.css`, a source-side setter, or a fallback (review rule)                                  |
| One stage map                        | `Source/Library/Stage.ts` holds the four steps, three kinds and the column binding; `grep -rn 'stage-' Source --include=*.scss` shows reads only |
| One material                         | `Source/Stylesheet/Material.scss` holds the eight mixins and no other sheet redefines one (review rule)                                          |
| A component never reads a collection | `grep -rn 'astro:content' Source/Component` returns nothing (true today)                                                                         |
| The shell owns the measure           | `grep -rn 'max-width' Source/Stylesheet Source/Component` returns `Shell.scss` and two media queries, nothing else                               |
| Depth is drawn, never simulated      | `grep -rn 'box-shadow\|blur(\|linear-gradient' Source/Stylesheet` returns the two fade rules and nothing else                                    |
| One sheet per component              | `find Source/Stylesheet -name '*.css'` returns `Base.css` and `Global.css` only                                                                  |
| No sheet composes an edge            | `grep -rn '1px solid var(' Source/Stylesheet` returns only `Global.css` and the three rules named in the token set (intent: `--hairline-chrome`) |
| A drawn control is wired             | `grep -rn '=> undefined' Source/Component` returns nothing (intent: the drawer's add control)                                                    |
| The index lists what exists          | `ls Documentation/RFC/proposed \| wc -l` equals the written count the index states                                                               |

## Open questions

- Whether the drum's 8px and 9px label sizes belong in the type scale or stay in the ladder. They
  exist only in the drum today, and the scale starts at 10px. UNKNOWN until a second surface needs
  them.
- Whether `--chrome-ink-white` and `--color-surface` are one value or two. Both are `#ffffff`, and a
  second white in the ramp is a claim that a label on a stage's own colour is a different ground
  from paper.
- Whether `--color-line-faint` and `--color-surface-sunken` are one value or two. Both are `#f5f5f5`
  and they play different roles - an edge that must be barely visible, and a face that must sit
  under content - so the duplication may be the honest form.
- Whether the 900px fold is one breakpoint or two. The rail folds above the drawer at 900px, and
  whether the drawer then folds to a single column at a second width is undecided.
