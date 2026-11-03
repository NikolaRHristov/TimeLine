# Skill-Authoring reference

The contract checker lives here rather than in `Scripts/` for the reason `Tool-Archive` states: a
script that ran belongs to the skill that documents it, and `Scripts/` is for the checks whose
procedure is a sentence. This one has a procedure - the five sections of `../SKILL.md` - so the tool
sits beside them.

| File                | What it does                                                                                                                                         | Notes                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `SkillContract.mjs` | Fail on a skill directory with no body, no index, no citation, no README mention, a mismatched `name`, an unlisted reference file or no claim table. | `pnpm run Check:Skills` |
| `Index.md`          | This inventory. The rule and its claim → test table live in `../SKILL.md`.                                                                           | no archived tools       |
