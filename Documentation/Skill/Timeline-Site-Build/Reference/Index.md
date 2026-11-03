# Timeline-Site-Build reference

Every file here was written during real work and archived rather than re-derived. Each tool opens
with a header stating what it does; nothing here names a machine, an account or an absolute path.

The three `.md` files are prose, not tools, and are placed by hand: the archiver stamps a comment
header chosen by file extension, which would add noise to a markdown file. They are listed here so
the directory has one inventory.

| File                  | What it does                                                                                                                                  | Notes                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `probe-built-page.js` | Serve-and-probe a built Astro page over CDP: island, structure, computed styles, console errors, screenshot.                                  | see the file's header |
| `Build-Repair.md`     | The four config-layer failures - PostCSS ESM default, CSS alias resolution, Sass `@use`, CI-only resolution - with probes and exact messages. | prose, placed by hand |
| `CI-Reproduction.md`  | Reproducing a build that fails only in CI: clean clone, frozen-lockfile install, the host's Node, the undeclared-dependency signature.        | prose, placed by hand |
| `Design-Intake.md`    | Reading a design file's layer tree into a spec: the two extraction calls, node-id spellings, the four values a screenshot hides.              | prose, placed by hand |
