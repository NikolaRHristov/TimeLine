# Content layer

Every word the code prints lives in `Content/`, one Markdown file each, and the build bakes those
files into the bundle as string literals. Nothing reads a file at run time, and the site ships no
copy it does not print.

## The two folders that look alike

`Content/` is what the code embeds. `Documentation/` is what a person reads in the repository. A
sentence can appear in both, and when it does the two are independent: editing
`Documentation/Reference/Content.md` changes this document, editing
`Content/String/Page/Index/Picks.md` changes the site.

`Source/Content/` is a third thing again - the site's Astro content collections, which hold
published posts. The content layer never touches it.

## Layout

```
Content/
  Configuration.json           values substituted into ${NAME}
  String/<Group>/<Name>.md     one short string per file
  Document/<Name>.md           long-form copy
  Instruction/<Name>.md        an instruction sent to a model
```

The folder is tracked. `Content/Configuration.json` is tracked; `Content/Configuration.local.json`
is gitignored and merged over it, so a clone sets its own licence or origin without editing a
tracked file.

## The key is the path

`Content/String/Command/Store/Push/Summary.md` is `CONTENT_STRING_COMMAND_STORE_PUSH_SUMMARY`.
Segments are upper-cased and joined with `_`; every non-alphanumeric run inside a segment becomes
`_`. The prefix follows the folder: `CONTENT_STRING_`, `CONTENT_DOCUMENT_`, `CONTENT_INSTRUCTION_`.

Two files that resolve to one name fail the build rather than shadowing each other.

## Two placeholder syntaxes

| Syntax     | Resolved   | Source of the value                                  |
| ---------- | ---------- | ---------------------------------------------------- |
| `${NAME}`  | build time | `Content/Configuration.json`, then the `.local` file |
| `{{name}}` | run time   | the caller, through `fill()`                         |

Only an all-caps name is a build-time reference, so a template that interpolates a count writes
`${count}` in lower case and it survives to run time untouched. `\${NAME}` is the escape for a
literal, which is what lets a content file talk about the syntax itself.

An unresolved `${NAME}` fails the build with the file and the name:

```
Error: String/CLI/Contract.md: NOT_CONFIGURED has no value in Content/Configuration.json
```

The build-time values also include `PACKAGE_NAME` and `VERSION_PACKAGE`, read from `package.json`.

## How each build consumes it

| Build      | Reads                               | Hands the map to                                        |
| ---------- | ----------------------------------- | ------------------------------------------------------- |
| tool layer | `Maintain/Configuration/Content.ts` | esbuild `define` in `Maintain/Configuration/ESBuild.ts` |
| site       | `Scripts/Content.ts` (same module)  | Vite `define` in `astro.config.ts`                      |

Both get the same names, so a content file renamed once renames for both.
`Maintain/Configuration/Content.ts` sits outside `Maintain/Source` on purpose: `Maintain/Source` is
the tool layer, which the site build must never import, and this module is build configuration.

`define` keys are written `process.env.<NAME>`, and the sources read them as
`process.env["<NAME>"]` - esbuild and Vite both substitute the bracket form from the dotted key, and
the bracket form is what TypeScript's `noPropertyAccessFromIndexSignature` allows.

## The index modules

Two hand-maintained modules name every export the code can use:

| Module                            | Covers                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `Maintain/Source/Content/Text.ts` | the CLI's strings: `CLI`, `Command`, `Option`, `Example`, `Hint`, `Reference`, `Document` |
| `Source/Library/Content.ts`       | the site's: a nested object whose shape is the folder, e.g. `Content.Page.Index.Picks`    |

Each export is a `define` reference plus a guard. Built, the guard is dead code and the export is
the literal; run without the define - `node Source/Index.ts` - the guard names the missing key
instead of printing `undefined` inside a sentence. `fill()` throws on a `{{name}}` with no value for
the same reason.

## Rules for the files

- One string per file. A 300-line `Strings.json` defeats the point.
- A file's bytes are its value: exactly one trailing line terminator is dropped and every other byte
  is kept. `Content/` is therefore in `.prettierignore` - rewrapping a paragraph to fit a column
  would change what the build bakes in.
- Markdown is a container, not a format here. Nothing parses it, so a heading or a list marker in a
  content file is part of the string.
- Diagnostics that interpolate a value (`--<name> expects an integer`) stay in the source: they are
  built from a value and a sentence, and moving the sentence buys nothing a reader of the code would
  notice.

## Verifying a change

| Claim                                        | Command                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| The build bakes every file in                | `node Maintain/Target/Index.js --help`                                              |
| One file changed, one output changed         | edit `Content/String/Page/Index/Picks.md`, rebuild the site, diff the rendered text |
| An unresolved reference fails the build      | add `${NOT_CONFIGURED}` to any content file, run `pnpm run Build`                   |
| Quotes, backticks, `${` and newlines survive | put them in `Content/String/CLI/Contract.md`, rebuild, diff `--help`                |
| No string lives in two places                | every value in `Content/` searched for in `Maintain/Source` and `Source`            |
