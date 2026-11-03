# Skills

The procedures this repository carries. Each directory holds a `SKILL.md` - the rules - and a
`Reference/` holding the worked instances and the tools, listed by that directory's `Index.md`.

`.agents/skills` is a symlink to this directory, so a tool that looks for `.agents/` finds the same
files rather than a copy.

Read the skill before the task. A skill states the failure it exists to prevent.

## The set

- **`Chat-Research/`** - asking a web chat product a research question over CDP and reading the
  answer back: the three checks a composer send needs, the output contract the prompt must carry,
  and the mode and model that are part of the question.
- **`Design-Verification/`** - proving a built page matches the design rather than merely compiling.
  Two verifiers, `verify-composition.mjs` and `verify-spread.mjs`, asserting numbers read from
  `Documentation/Reference/Design-Composition.md`.
- **`Figma-MCP/`** - reading a design file into components over the Figma MCP endpoint, and the two
  failures that make it look broken: the `mcp:connect`-only token scope, and a large result replaced
  by a marker that was never stored.
- **`Parallel-Epic-Execution/`** - several agents on one tree. File ownership, the boundary pass,
  the four facts an escalation must carry.
- **`Progressive-Enhancement/`** - the first paint is the server's. `no-js-audit.mjs` loads every
  route twice and fails a page whose content waits for hydration.
- **`RFC-Board/`** - assembling the public project from the committed records. The file is
  authoritative, the issue follows it, the project item follows the issue; nothing writes back.
- **`Skill-Authoring/`** - where a lesson lives: this repository or an agent profile, the naming and
  the anonymisation gate, and `SkillContract.mjs`, the check that holds the tree to them.
- **`SpacetimeDB-Local/`** - running and editing the local module.
- **`Timeline-Bookmarks/`** - reading and refreshing the saved-post archive.
- **`Timeline-Browser-Transport/`** - driving a person's own browser over CDP.
- **`Timeline-Hermes-Maintenance/`** - the gateway, the board and the workers when they stall.
- **`Timeline-Site-Build/`** - the build layer: PostCSS and alias resolution, the CI-only failure,
  the Node floor, and the probe that proves a page hydrated.
- **`Tool-Archive/`** - a script that ran belongs to a skill. `archive_tool.py` puts it there,
  scrubs a home path, refuses a file that still carries one, and audits the result.

## The convention

- A skill's body holds rules; a worked instance lives in `Reference/` behind a one-line pointer.
- Every `Reference/Index.md` lists what the directory holds, and says what it does not archive and
  why when the runnable thing is a CLI rather than a script.
- A tool that names a machine cannot be archived: `archive_tool.py --audit` is the gate, and it
  covers Markdown as well as code so a skill's prose is held to the same rule.
