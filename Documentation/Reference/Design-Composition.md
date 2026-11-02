# The composition

The measured geometry of the frame every workspace surface is built from. The reference image is
`Documentation/Assets/Full Composition.png`, but this file is the authority: every value below was
read from the file's own layer tree through the Figma MCP, not estimated from the picture.

A component that diverges from a number here records why in its header comment.

---

## The frame

One frame, `Full Composition`, 1440 × 1300, ground `#f5f5f5`. Four bands sit on it, absolutely
positioned. The dark chrome is the top band only; everything below it is light.

- **Timeline Selector** - the rail. `224 × 360` at `0, 0`. Dark `#1c1c1e`, `1px #2e2e30` on the
  right edge, padding `16px 12px`, `overflow: clip`.
- **File Drawer** - the private band. `1200 × 360` at `240, 0`. Dark `#1c1c1e`, padding
  `20px 28px 16px`, 12px between rows.
- **HR Separator** - the seam. `1200 × 40` at `240, 360`. **Light `#ececec`**, padding inline 28px.
- **Blank bento layout** - the canvas. `1200 × 900` at `240, 400`. Light `#fafafa`, 48px padding,
  20px gaps.

The 16px between the rail and the drawer is the ground showing through, not a gap inside a flex row.

---

## The rail

Three blocks, flush - there is **no gap** between them. Header at `y=16`, drum at `y=47`, scroll at
`y=315`; the arithmetic is exact and leaves no slack.

### Header, 31 tall

Eyebrow `Provenance` - 11px, regular, uppercase, `#8e8e93`. Title `Ingestion timeline` - 13px,
semibold, `#e5e5ea`.

### The drum, 268 tall

Thirteen bands. The ladder is the perspective: the selected stage is tall and opaque in the middle,
and every band further away is shorter, fainter and smaller-marked.

| Distance | Height | Opacity | Marker | Radius | Track | Label |
| -------- | ------ | ------- | ------ | ------ | ----- | ----- |
| 0        | 44     | 1.00    | 12     | 6      | 12    | 10    |
| 1        | 28     | 0.72    | 12     | 6      | 14    | 9     |
| 2        | 22     | 0.55    | 10×12  | 5      | 12    | 8     |
| 3        | 16     | 0.38    | 10     | 5      | 16    | -     |
| 4        | 12     | 0.28    | 8      | 4      | 12    | -     |
| 5        | 10     | 0.22    | 6      | 3      | 10    | -     |
| 6        | 8      | 0.18    | 6      | 3      | 8     | -     |

The bands are symmetric about the selection: `far-top-3` down to `far-bottom-3`. Only distances 0, 1
and 2 carry a label, and a labelled band stacks `label → track` with a 2px gap (3px on the selected
one).

Every marker is filled with its band's stage accent, has a `1px #1c1c1e` border, and is absolutely
positioned over the progress bar. The selected band's track is a capsule (`999px`); every other
track is `2px`.

The selected band carries a `rgb(99 102 241 / 8%)` plate and a right-aligned 9px caption in its own
accent.

Two `40px × 200px` gradients sit on top of the stack - `#1c1c1e` to transparent at the top, the
mirror at `y=228`. They are what make a clipped stack read as a cylinder.

**Progress widths are fixed pixels, not percentages** - 60, 80, 95, 110, 104, 132, 92, 118 across
the bands. A percentage is a different design.

`Provenance.tsx` diverges here on purpose: it draws each bar at `Events / Widest(Stages)` of the
track, because a rail that reports where the work sits cannot carry a bar that never moves. The
export's widths are a mock's data, not a ladder - they are reproduced by a real archive with the
same counts, and the heights, opacity and fades above are what carry the perspective.

### Scroll state, 31 tall

A 6px track `#2c2c2e` with a capsule indigo thumb, 6px above a 10px `#636366` note.

---

## The drawer

### Header, 30 tall

Three groups, justified apart, 6px and 4px internal gaps.

- **Left** - two 28 × 28 controls (`#2c2c2e`, `1px #3a3a3c`, 8px radius) flanking a two-line block:
  `Depth / Schema` at 11px uppercase `#8e8e93`, `My Files` at 13px semibold `#e5e5ea`.
- **Centre** - a 14px lock glyph and a 12px `#636366` line.
- **Right** - two chips, 4px apart, `4px 10px`, 6px radius, 11px. Active `#48484a` semibold
  `#d1d1d6`; inactive `#3a3a3c` regular `#8e8e93`.

### Tab row, 22 tall

Right-aligned `#2c2c2e` chip, `4px 8px`, 6px radius, 11px `#636366`, an 11px plus glyph.

### Columns, 240 tall

Four, 10px apart, `flex: 1`, 10px padding, 6px between items.

- **Inactive** - `#1f1f21`, `1px #2e2e30`, 12px radius.
- **Active** - `#232325`, `1px #3a3a3c`, and the tab shape: square top-left, 12px elsewhere.

### Items

- **Text** - 36 tall, 12px glyph, `10px 8px` padding, 8px gap, 8px radius.
- **Media** - 44 tall, 28px thumbnail at 6px radius, `8px` inline padding.
- **Comment** - 44 tall, 24px circular avatar, `8px` inline padding.
- **Control** - 28 tall, centred, 10px type, 10px trailing chevron.

Title 11px semibold, meta 9px. Selected item: `1px #6366f1` border with title, meta and glyph in
that accent. Default: `1px #3a3a3c`, title `#d1d1d6`, meta `#636366`.

### The drop ghost

28 tall, `#1c1c1e` face, `1px dashed` in the column's own accent, 8px radius, one per column.
Opacity differs by column: `0.55` on the first, `0.50` on the rest. Label 10px in the accent.

---

## The seam

`#ececec`, 40 tall, padding inline 28px, three groups.

- **Left, 6px gaps** - two 24 × 24 white chips (`1px #d1d1d6`, 6px radius,
  `drop-shadow(0 1px 1.5px rgb(0 0 0 / 6%))`) holding 11px chevrons, around a label at **11px
  uppercase `#8e8e93`**.
- **Centre** - a `1px #d8d8d8` rule taking the remaining width.
- **Right, 4px gaps** - a 12px arrow-down-circle glyph and a **11px `#b0b0b8`** line.

The seam is light on purpose. It belongs to neither surface, so it reads as a rule between the dark
chrome and the light canvas rather than as part of either.

The left group is a control and not a caption: publishing is the one verb that crosses this seam
(RFC-0043 §4). A reader who may not publish sees the control in `locked` rather than without it
(RFC-0049 rule 4, RFC-0054 §3) - the label keeps its ink and gains a 12px lock after the right chip,
and the right-hand line states the reason instead of the stage
(`Publishing needs an identity - a published record carries an author`, RFC-0013). The control
carries `aria-disabled` and points its `aria-describedby` at that line, so the reason belongs to the
control rather than sitting beside it.

---

## The canvas

`#fafafa`, 48px padding, 20px gaps, six equal columns by four equal rows, tiles at 24px radius.

Three greys, assigned by hierarchy rather than pattern: `#e2e2e2` loudest, `#e9e9e9` middle, `#eee`
quietest. An empty tile is a real state - a thin archive draws the full mosaic in the quietest value
rather than leaving holes.

---

## The bands below the canvas

The composition grows downward from the canvas (RFC-0046, RFC-0047, RFC-0048). Three bands follow it
on the canvas's own 20px rhythm, and the rail's column closes with the fourth surface. These values
come from the three records rather than from the Figma frame, which stops at the canvas.

- **Swimlanes** - `1104` wide at `288`, `20` under the canvas. White face on the paper, `1px`
  `#f5f5f5` edge, `24px` corner, `24` padding. One lane per actor, laid out on the shared four
  tracks; the lane air is `28`, deliberately greater than the canvas's `20` gap. Two arrows always,
  facing opposite ways.
- **Spectrometer** - the same inset and the same corner, `20` under the swimlanes. One row per peer,
  one column per step, and the same four tracks as the lanes: `--band-columns` is `14.5rem` plus
  four equal tracks, declared once in `Global.css`. A column head carries three lines - the step,
  the suite in the monospace face at `9px`, and the record the state is read from - with the record
  anchored to the bottom so the four heads share one baseline.
- **Status footer** - `1200` wide at `240`, `20` under the spectrometer and flush at the bottom of
  the composition: `#ececec`, a `#d8d8d8` top rule, `12` block padding and `48` inline padding, so
  its first word starts on the panels' left edge. Four textual states, no tint and no mark: the word
  is the signal.
- **Security cluster** - `200` wide, centred in the rail's `224`, bottom-aligned in the rail column.
  Four marks, each with a state and the record that makes it a claim.

The rail is a column the height of the composition: the drum stays `224 × 360` at the top of it and
the cluster closes it. That arrangement is what puts the cluster's last mark on the footer's own
baseline - one instrument read across two columns.

A state is drawn as the shape of a mark and the word beside it, never as a tint: filled is `running`
or `engaged`, a solid outline is `available`, a dashed outline is `absent`, a dotted one is a record
the client could not read. A `1px` stroke in a line token is `1.5:1` on the paper, so the marks are
stroked in the muted ink; the open states are square because a corner radius eats the corner mark of
a dashed or dotted border.

---

## The palette

- **Chrome** - `#1c1c1e` ground, `#1f1f21` inactive face, `#232325` active face, `#2c2c2e` control,
  `#48484a` active control, `#2e2e30` line, `#3a3a3c` strong line.
- **Chrome ink** - `#e5e5ea` bright, `#d1d1d6` body, `#8e8e93` muted, `#636366` faint.
- **Stages** - source `#6366f1`, ingestion `#34d399`, processing `#f59e0b`, review `#ec4899`,
  publish `#6e9efa`, file `#f0a045`, template `#9b77fa`.
- **Paper** - ground `#f5f5f5`, seam `#ececec`, seam rule `#d8d8d8`, seam ink `#8e8e93`, seam faint
  `#b0b0b8`, canvas `#fafafa`, tiles `#e2e2e2` / `#e9e9e9` / `#eee`.

A colour is a claim about identity: a band, a column head and an event row sharing an accent are
naming the same stage.

---

## Where it lives in the code

- **Tokens** - `Source/Stylesheet/Global.css`, one `:root` block per ramp, plus `--band-columns` for
  the axis the two bands below the canvas share.
- **Mixins** - `Source/Stylesheet/Material.scss`: `panel`, `face`, `card`, `control`, `inset`,
  `label`, `ellipsis`, `reset`.
- **Sheets** - `Source/Stylesheet/Component/`, one sheet per part, each built from a `Material`
  mixin; `Source/Stylesheet/Layout/` holds the shell and the page frame.
- **Components** - `Source/Component/Workspace/`, one file per part, Solid `.tsx`.
- **State** - `Source/Script/Workspace/Store.ts` holds what a person is doing - the selected stage,
  the live column, the view, the open record, the published tiles and the session slot - so the rail
  and the body are two islands reading one value rather than two components each holding their own.
  `Source/Script/Workspace/Seat.ts` states the canvas's seat table, which the store publishes into
  and the canvas fills.
- **Vocabulary** - `Source/Library/Capability.ts` states the four steps and the states once;
  `Source/Library/Band.ts` states what the build can prove about the network, so the bands are one
  value rather than nine props assembled at a call site.

A number in this file that a sheet hardcodes as a literal instead of a custom property is a defect
in the sheet, not in the design.
