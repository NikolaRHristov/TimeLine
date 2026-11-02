# The composition

The measured geometry of the frame every workspace surface is built from. The reference image is
`Documentation/Assets/Full Composition.png`; this file is the numbers behind it, so a component can
be checked against the design without opening Figma or reading an image.

Every value here was read from the file's own layer tree, not estimated from the picture. A
component that diverges from a number below records why in its header comment.

---

## The frame

One frame, `Full Composition`, 1440 × 1300, laid out as four bands. The rail is fixed width and the
other three share a 1200-wide column to its right.

- **Timeline Selector** - the rail. 224 × 360 at `0, 0`.
- **File Drawer** - the private band. 1200 × 360 at `240, 0`.
- **HR Separator** - the publish seam. 1200 × 40 at `240, 360`.
- **Blank bento layout** - the canvas. 1200 × 900 at `240, 400`.

---

## The rail

224 wide, `#1c1c1e`, a 1px `#2e2e30` rule on its right edge, 12px inline and 16px block padding.

The header is two lines: an eyebrow (`Provenance`, 11px, uppercase, `#8e8e93`) over a title
(`Ingestion timeline`, 13px, semibold, `#e5e5ea`).

### The drum

268 tall, and the whole perspective is one table indexed by distance from the selected stage.
Thirteen bands are drawn; the selected stage is the tall opaque one in the middle.

| Distance | Height | Opacity | Marker | Marker radius | Border | Track | Label |
| -------- | ------ | ------- | ------ | ------------- | ------ | ----- | ----- |
| 0        | 44     | 1.00    | 12     | 6             | 2      | 12    | 10    |
| 1        | 28     | 0.72    | 12     | 6             | 2      | 14    | 9     |
| 2        | 22     | 0.55    | 10     | 5             | 1      | 12    | 8     |
| 3        | 16     | 0.38    | 10     | 5             | 1      | 16    | -     |
| 4        | 12     | 0.28    | 8      | 4             | 1      | 12    | -     |
| 5        | 10     | 0.22    | 6      | 3             | 1      | 10    | -     |
| 6        | 8      | 0.18    | 6      | 3             | 1      | 8     | -     |

Two things sit on top of the stack and are not optional: a 40px gradient from the page colour to
transparent at the top, and the mirror of it at the bottom. They are what turn a clipped stack into
a cylinder.

The selected band carries a `rgb(99 102 241 / 8%)` plate, a capsule track (999px radius) and a
right-aligned caption in its own accent.

### Under the drum

A 6px scroll track (`#2c2c2e`, capsule) with an indigo thumb, and a 10px `#636366` note. The block
is 31 tall.

---

## The drawer

1200 × 360, `#1c1c1e`, 20px top and 28px inline padding, 12px between rows.

### Header, 30 tall

Three groups on one row, justified apart.

- **Left** - a 28 × 28 control (`#2c2c2e`, 1px `#3a3a3c`, 8px radius) with a 12px chevron, then the
  two-line title block, then a second control. 6px gaps.
- **Centre** - a 14px lock glyph and a 12px `#636366` line.
- **Right** - the view switch. Two chips, 4px apart, `4px 10px` padding, 6px radius, 11px type. The
  active chip is `#48484a` and semibold; the other is `#3a3a3c` and `#8e8e93`.

### Tab row, 22 tall

Right-aligned: a `#2c2c2e` chip with an 11px plus glyph and an 11px `#636366` label, `4px 8px`
padding, 6px radius.

### Columns, 240 tall

Four columns, 10px apart, each `flex: 1`, 10px inner padding, 6px between items.

- **Inactive** - `#1f1f21`, 1px `#2e2e30`, 12px radius.
- **Active** - `#232325`, 1px `#3a3a3c`, and a tab shape: square at the top-left, 12px everywhere
  else. That one corner is the only thing distinguishing the live column.

### Items

One component, three heights, because the height and the leading element are the same decision.

- **Text** - 36 tall. 12px glyph, 11px semibold title, 9px meta, 12px trailing action.
- **Media** - 44 tall. 28px thumbnail at 6px radius, then the same two lines.
- **Comment** - 44 tall. 24px circular avatar with a two-letter mark, then the same two lines.
- **Control** - 28 tall, centred, 10px type, 10px trailing chevron, no leading element.

Selected: 1px `#6366f1` border, and the title, meta and glyph all take that accent. Default: 1px
`#3a3a3c`, title `#d1d1d6`, meta `#636366`.

### The drop ghost

28 tall, `#1c1c1e` face, a 1px dashed border in the column's own accent, 50-55% opacity, an 11px
arrow and a 10px label. One per column, always last. It is an invitation, never a record.

---

## The seam

1200 × 40, `#1c1c1e`, 28px inline padding.

Left: two 24 × 24 capsule steps around a 13px `#e5e5ea` label. Centre: a 1px `#3a3a3c` rule that
takes the remaining width. Right: a 12px circle-arrow glyph and a 13px `#636366` line.

---

## The canvas

1200 × 900, `#fafafa`, 48px padding, 20px gaps, six columns by four rows of equal tracks. Tiles are
24px radius.

The greys are three, and which one a tile takes is a hierarchy, not a pattern: `#e2e2e2` for the
loudest, `#e9e9e9` for the middle, `#eee` for the quietest. An empty tile is a real state - a thin
archive draws the full mosaic in the quietest value rather than leaving holes.

---

## The palette

- **Chrome** - `#1c1c1e` ground, `#1f1f21` inactive face, `#232325` active face, `#2c2c2e` control,
  `#48484a` active control, `#2e2e30` line, `#3a3a3c` strong line.
- **Chrome ink** - `#e5e5ea` bright, `#d1d1d6` body, `#8e8e93` muted, `#636366` faint.
- **Stages** - source `#6366f1`, ingestion `#34d399`, processing `#f59e0b`, review `#ec4899`,
  publish `#6e9efa`, file `#f0a045`, template `#9b77fa`.
- **Canvas** - `#fafafa` ground, `#e2e2e2` / `#e9e9e9` / `#eee` tiles.

A colour is a claim about identity: a band, a column head and an event row sharing an accent are
naming the same stage. None of the seven is decoration.

---

## Where it lives in the code

- **Tokens** - `Source/Stylesheet/Global.css`, one `:root` block for the chrome and stages.
- **Mixins** - `Source/Stylesheet/Material.scss`: `panel`, `face`, `card`, `control`, `inset`,
  `label`, `ellipsis`, `reset`.
- **Sheets** - `Source/Stylesheet/Component/{Provenance,Drawer,Bento,Workspace}.scss`.
- **Components** - `Source/Component/Workspace/`, one file per part, Solid `.tsx`.

A number in this file that a sheet hardcodes as a literal instead of a custom property is a defect
in the sheet, not in the design.
