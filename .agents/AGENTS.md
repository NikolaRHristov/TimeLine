# Agent entry point

A tool that looks for `.agents/` finds this. The repository's own instructions are one level up in
`AGENTS.md`; this file exists so an agent that starts here is not stranded.

## Where the procedures live

`.agents/skills` is a symlink to `Documentation/Skill/`. The directory is the real one - every skill
carries a `SKILL.md` and a `Reference/Index.md`, and the tools a skill archived sit beside it.

Nothing is duplicated here. A second copy of a skill is a second answer to the same question, and
the copy that goes stale is always the one nobody is reading.

## The rule

Read the skill before the task, not after it fails. A skill states the failure it exists to prevent;
a reader who arrives without it repeats the failure and then reads the paragraph that predicted it.

## Which one

The table in `AGENTS.md` at the repository root maps a task to the skill that covers it. It is the
only list - this file does not keep a second one, for the reason above.

## If a skill is wrong

Fix it in place. A skill that documents a command nobody has is a lie, and a skill that omits the
failure it was written for is worse. The tree is public: a correction here reaches every clone.
