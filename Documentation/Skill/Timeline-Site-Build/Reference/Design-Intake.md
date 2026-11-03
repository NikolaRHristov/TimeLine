# Design intake: reading a design file's layer tree

The recipe behind the rule _measure the design file, never its picture_. Use it when a design has to
become components and the only artefact is a URL. The MCP transport itself - install, scope, the
direct call that survives a truncating client - is `Documentation/Skill/Figma-MCP/SKILL.md`.

## Two calls describe a whole frame

- **Structure** - `get_metadata` on the root frame returns every descendant as XML: id, name, type,
  `x/y/width/height`, parent-relative. One call, the whole composition.
- **Values** - `get_design_context` per section returns the markup with its utility classes,
  `data-node-id` attributes and temporary asset URLs. Pull it per band, not per frame; a whole frame
  is tens of kilobytes and mostly repetition.

Node-id spelling differs by tool: `get_metadata` takes `4-4`, `get_design_context` takes `4:4`. A
`node-id=4-4` URL parameter is the same node. When a call answers "node not found", try the other
separator before concluding the node is wrong.

Parse the XML locally rather than reading it in the transcript - an indented outline of
`id name WxH @x,y` for the first three levels is usually enough to plan every component, and the
arithmetic on the `y` values is what catches a missing or extra `gap`.

## When the client truncates the result

A client that replaces large tool results with a summary marker makes the layer tree unreachable
exactly when it is most useful. Call the server's endpoint directly and write the payload to a file:

```sh
export MCP_URL="<server endpoint>"
export MCP_TOKEN_FILE="<the token file the client wrote>"
python3 Documentation/Skill/Figma-MCP/Reference/mcp_call.py \
    get_metadata '{"fileKey":"<KEY>","nodeId":"4-4"}' frame.xml
```

The handshake is three messages over streamable-HTTP - `initialize`, `notifications/initialized`,
`tools/call` - with JSON-RPC ids matched per response, and the reply may be `application/json` or
`text/event-stream`. Keep the endpoint and the token path in environment variables: a hardcoded
token path makes the script unportable and names one profile's layout in a public tree.

## What to extract, per node

`x/y/width/height`, `bg-*`, `border-*` and its colour, `rounded-*`, `drop-shadow-*`, `opacity-*`,
text size, weight and colour, and each parent's `padding` and `gap`.

Then do the arithmetic. A header at `y=16`, a body at `y=47` and a footer at `y=315` inside a
360-tall rail means **no gap** between the three; a `gap: 12px` in the sheet pushes the last block
out of the frame. The sum is the test, and it catches the class of error a screenshot cannot show.

## The four traps, all invisible in a picture

1. **The page ground.** A frame whose panels are dark and whose canvas is light usually has a
   _third_ value as its root fill, and it shows through the gaps between panels. Reading the picture
   paints the whole page dark.
2. **A light band between two dark ones.** A separator that belongs to neither surface is often a
   light value; treating it as part of the dark panel erases the seam.
3. **A panel that does not fill its column.** A 224×360 rail sits at the top-left and the space
   below it is ground, not rail.
4. **Fixed widths, not percentages.** A progress bar at 60/80/95/110px is a different design from
   `60%`, and the percentage silently re-derives a value the designer chose.

A count in the data is also not a count in the design: a rail that draws thirteen bands is not
satisfied by one band per data stage - the ladder is the structure, and the real stages label
positions in it.

## Finish by writing the spec into the repository

Write `Documentation/Reference/Design-Composition.md`: the frame, each band's geometry, the ladders
and ramps as tables, the palette split by ramp, and a closing line saying that a number hardcoded in
a sheet instead of read from a token is a defect in the sheet. Cite it from each component's header.
A spec that lives in a scratch directory is gone by the next session.
