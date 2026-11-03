# RFC-0075 - The layer tree is the authority, the picture is a likeness

**Status:** Proposed **Date:** 2026-11-03 **Owner:** operator **Applies to:** design intake from a
design file into `Documentation/Reference/`, and the tools under
`Documentation/Skill/Figma-MCP/Reference/` **Decision class:** methodology **Supersedes:** none
**Superseded by:** none **Task dependencies:** RFC-0017 (client surface), RFC-0045 (the material,
the tokens and the component contract), RFC-0072 (a verifier asserts the spec - the record this one
feeds numbers into); implementing card to be created: "Carry a node id from the metadata reply into
the spec's invariant table"

## Decision

A design file's layer tree is the authority for every measured value this repository builds to. A
rendered export is a picture of the result: it shows what the designer placed and hides the fills,
the nesting and the fixed pixel widths that produced it. Intake reads the tree over the MCP
endpoint, writes the reply to a file, and transcribes from there into the spec.

1. **The spec says which source it was measured from, and that source is the tree.**
   `Documentation/Reference/Design-Composition.md:3-5` states it: the reference image exists, but
   the document is the authority because every value in it was read from the file's own layer tree
   through the MCP and not estimated from the picture.
2. **Intake goes over the MCP endpoint, and the payload lands in a file.** `mcp_call.py:12-15`
   states why: a chat client replaces a large tool result with a short marker, so a design-metadata
   reply never reaches the model, and calling the endpoint directly writes the payload where it can
   be read, grepped and diffed. The invocation is `mcp_call.py <tool> '<json-args>' <out-file>`
   (`mcp_call.py:195-207`), and the output file is the artifact - stdout carries only a summary line
   and a 600-character preview (`:216-227`).
3. **A missing credential is reported, never guessed.** `mcp_call.py:22-24` names the rule: a silent
   fallback would send a request with no token and read the resulting 401 as a server fault. Both
   `MCP_URL` and `MCP_TOKEN_FILE` are required with no defaults (`:39-55`), the token is read from
   the file and never printed (`:68`, `:87`), and the endpoint is configuration because a constant
   would pin the tool to one server.
4. **Intake records what a picture cannot distinguish.** Three things a rendered export loses and
   the tree keeps: a fill stated as a literal rather than a token
   (`Documentation/Skill/Figma-MCP/SKILL.md:111-113` - the composition's colours are literal fills,
   so the palette comes from the generated classes and not from a variable set), the nesting that
   makes one band a child of the frame rather than a sibling (`Design-Composition.md:11-20`), and a
   width stated in fixed pixels - the progress widths are `60, 80, 95, 110, 104, 132, 92, 118` and a
   percentage is a different design (`Design-Composition.md:67-68`).
5. **The layers panel is a cross-check, not a source.** `cdp-figma-tree.js` walks the panel DOM
   (`:73-101`) and records five fields per row - id, name, the row's own left offset, its aria-level
   and a derived depth. It records no fill, no bounding box and no layout mode;
   `grep -rn absoluteBoundingBox Documentation/` answers `0`. Its caret toggle collapses as well as
   expands, so the row count oscillates between passes, and `SKILL.md:100-103` demotes it: the MCP
   reply is the authoritative tree and this is the cross-check.
6. **Generated markup is a description of the design, not the code to commit.** `SKILL.md:118-121`
   states the rule and the reason: the tool emits utility classes against its own conventions, and
   this repository takes `.scss` with BEM nesting and Solid `.tsx`, so the classes are translated
   and the markup is rewritten.
7. **No value is taken from a raster.** No screenshot or export call exists anywhere in the tree:
   `grep -rn get_screenshot Documentation/` answers `0`. Assets arrive only as expiring URLs inside
   `get_design_context` markup, and a URL under the asset host expires in seven days, so anything
   the page needs is downloaded and referenced locally (`SKILL.md:114-116`).
8. **The verdict is the tool's own error flag, not the process exit code.** `mcp_call.py:211-227`
   writes `isError` into the summary line and returns from `main` without setting a status, so a
   tool that answered with an error exits `0`. A caller that checks `$?` alone reads a failed call
   as a success; a caller that reads `isError` reads the truth.
9. **The transcription into the spec is manual, and the spec is where a number lives.**
   `get_metadata` returns XML, `Design-Composition.md` states the numbers in prose, and
   `verify-composition.mjs:40-105` restates them as literals. No node id travels from the reply into
   an assertion. The rule that follows is RFC-0072's: the spec is the invariant's provenance, and a
   number typed twice can be typed wrong once.

## Context

The intake path is four MCP tools and one endpoint:

| Step               | Tool                 | What it returns                                                                    |
| ------------------ | -------------------- | ---------------------------------------------------------------------------------- |
| The tree           | `get_metadata`       | every descendant of the node: id, name, size, position (`SKILL.md:107-108`)        |
| A section's markup | `get_design_context` | utility classes, `data-node-id` attributes, temporary asset URLs (`:109-110`)      |
| Variables          | `get_variable_defs`  | `{}` on a file with no local variables - a real answer, not a failure (`:111-113`) |
| Who the caller is  | `whoami`             | the handle, email and plans, used to resolve a team (`:82-87`)                     |

The endpoint is the design tool's MCP server, and the stored token carries the connect scope only -
a REST call to the same vendor's API answers 403, and `SKILL.md:42-52` records that the 403 is the
scope rather than an expired token. Every read therefore goes through the MCP endpoint, which is why
rule 2 is a rule about the transport and not a preference.

The node-id spelling differs by tool: the metadata call accepts a hyphenated id and the context call
accepts a colon-separated one, so a URL parameter maps to the other form by hand (`SKILL.md:76-78`).
That is a transcription hop of exactly the kind rule 9 describes, one level below the spec.

The failure vocabulary is uneven, and it is stated rather than smoothed over:

| Condition                        | Behaviour                                                           | Source                   |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------ |
| a required variable is unset     | names every missing variable and a usage hint, exits non-zero       | `mcp_call.py:42-55`      |
| the token file is unreadable     | `error: cannot read MCP_TOKEN_FILE` with the underlying error       | `mcp_call.py:62-66`      |
| the token file holds no token    | `error: MCP_TOKEN_FILE holds no access_token`                       | `mcp_call.py:70-71`      |
| the server answers 4xx or 5xx    | an uncaught HTTP error: a traceback, with no scope or auth hint     | `mcp_call.py:94`         |
| the reply is not JSON            | an uncaught decode error                                            | `mcp_call.py:121`        |
| an SSE reply with no matching id | the last message is accepted silently                               | `mcp_call.py:119`        |
| the tool itself errored          | written to the summary as `isError`, exit `0`                       | `mcp_call.py:211-227`    |
| the payload is large             | no cap by design: the whole body is read and the whole text written | `mcp_call.py:97`, `:206` |

The CDP drivers share one shape and one weakness. They discover the browser on the debug port, open
a background tab, and enable focus emulation before navigating (`cdp-page.js:12-67`,
`cdp-figma-tree.js:66`). A command that finds nothing exits `0` - `cdp-figma-click.js:82-86` prints
`no card` and returns - and a socket that closes mid-run hangs rather than erroring, because the
message map has no reject path and no timeout. A caller reading only the exit status cannot
distinguish "no card" from "clicked".

The composition's own numbers show what the tree carried that a picture would not: the rail is
`224 × 360` at `0, 0`, the drawer `1200 × 360` at `240, 0`, the seam `1200 × 40` at `240, 360`, and
the canvas `1200 × 900` at `240, 400`, with the sixteen pixels between rail and drawer being the
ground showing through rather than a gap inside a flex row (`Design-Composition.md:11-20`). A
screenshot shows four rectangles; it does not show that one of them is a sibling and the gap is the
page's background.

## Alternatives considered

| Option                                         | Why not chosen                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Measure the rendered export                    | it is a picture of the result: fills become colours, nesting becomes adjacency, and a fixed width becomes whatever the export scaled to   |
| Read the tree through the vendor's REST API    | the stored token carries the MCP connect scope only, so the API answers 403 (`SKILL.md:42-52`)                                            |
| Use the layers panel as the source             | it needs no MCP call, but it records no fill and no bounding box, and its caret toggle makes the row count oscillate (`SKILL.md:100-103`) |
| Let a chat client summarise the metadata reply | a large reply is replaced by a marker, so the numbers never arrive (`mcp_call.py:12-15`)                                                  |
| Treat a non-zero exit as the failure signal    | a tool that answered with an error exits `0`, so the flag is the signal (`mcp_call.py:211-227`)                                           |
| Commit the generated markup as the component   | it carries the design tool's utility classes, not this repository's sheets and component conventions (`SKILL.md:118-121`)                 |
| Reference the asset URLs directly              | they expire in seven days, so the component becomes a broken image (`SKILL.md:114-116`)                                                   |

## Consequences

- Every measured value in the spec has a provenance a reader can follow back to a metadata call, and
  no value has a provenance that stops at a screenshot.
- The intake needs a token file and an endpoint in the environment, so it cannot run unattended in
  CI and is a workstation tool by construction.
- A number crosses two manual hops - reply to spec, spec to verifier - and nothing detects a digit
  typed wrong at either.
- The payload file is the record, so an intake session leaves artifacts that can be re-read without
  calling the server again, which is the whole point of rule 2.
- Because the panel driver records only ids, names and indentation, it cannot contradict a geometric
  claim; it can only disagree about the shape of the tree.
- A hung CDP socket and a slow page look the same to a caller, since neither has a timeout.

## Verification

| Claim                                       | Test                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The spec names the tree as its source       | `grep -n "not estimated from the picture" Documentation/Reference/Design-Composition.md` → `:5`                                |
| The reference image is named and demoted    | `grep -n "reference image" Documentation/Reference/Design-Composition.md` → `:3`                                               |
| No screenshot is ever taken                 | `grep -rn get_screenshot Documentation/` → no match                                                                            |
| The intake writes to a file                 | `grep -n "out-file" Documentation/Skill/Figma-MCP/Reference/mcp_call.py` → the usage line at `:10`                             |
| Both variables are required                 | `grep -n "MCP_URL\|MCP_TOKEN_FILE" Documentation/Skill/Figma-MCP/Reference/mcp_call.py` → `:19-20`, `:39-40`                   |
| A missing variable is reported              | `python3 Documentation/Skill/Figma-MCP/Reference/mcp_call.py` → prints the usage block and names the missing variables, exit 1 |
| The error flag is not the exit status       | `grep -n "isError" Documentation/Skill/Figma-MCP/Reference/mcp_call.py` → `:211`, `:222`                                       |
| The panel is a cross-check                  | `grep -n "authoritative tree" Documentation/Skill/Figma-MCP/SKILL.md` → `:103`                                                 |
| The panel records no geometry of the canvas | `grep -rn absoluteBoundingBox Documentation/` → no match                                                                       |
| The progress widths are fixed pixels        | `grep -n "fixed pixels" Documentation/Reference/Design-Composition.md` → `:67`                                                 |
| Asset URLs expire                           | `grep -n "seven days" Documentation/Skill/Figma-MCP/SKILL.md` → `:114`                                                         |
| Generated markup is not committed           | `grep -n "not the code to commit" Documentation/Skill/Figma-MCP/SKILL.md` → `:119`                                             |
| No node id reaches an assertion             | `grep -c "nodeId" Documentation/Skill/Design-Verification/Reference/verify-composition.mjs` → `0`                              |

## Open questions

- Whether a node id should be carried from the metadata reply into the spec's invariant table, which
  would close rule 9's second hop. It needs a schema for the reply, and the reply is XML with no
  documented shape.
- Whether the intake should record the metadata call's own reply digest, so a later reader can tell
  whether the design file changed after the spec was written.
- Whether `mcp_call.py` should exit non-zero on `isError`. Today the flag is the signal, and a
  wrapper that checked the status would be silently wrong.
- UNKNOWN whether the metadata reply truncates a very deep tree. No file in this repository states a
  limit, and the composition is shallow enough that the question has never been exercised.
- Whether the CDP drivers should acquire a timeout. A detached socket hangs, and the fixed sleeps
  that stand in for liveness mean a slow page and a dead tab are indistinguishable.
