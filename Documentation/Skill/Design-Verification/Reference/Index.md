# Design-Verification reference

Every file here was written during real work and archived rather than re-derived. Each one opens
with a header stating what it does; nothing here names a machine, an account or an absolute path.

All three files are ad-hoc verification rather than a test suite: they exit `0` when every invariant
holds, `1` when one broke, and `2` when a precondition is missing. The invariants come from
`Documentation/Reference/Design-Composition.md` and RFC-0053, never from the current
implementation - an invariant read off the code only proves the code agrees with itself. Each takes
`--url` to probe a server that is already running.

| File                     | What it does                                                                                                                                 | Notes                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `verify-composition.mjs` | Snapshot the build, serve it, probe `/Workspace/` and assert the frame's geometry and the seam's state.                                      | exits 2 without a build or a browser |
| `verify-showcase.mjs`    | Probe the five showcase surfaces at 1440 wide and assert the rail, the hero, the three boxes and that no record is drawn.                    | `/Showcase` is not one of them       |
| `verify-spread.mjs`      | Probe `/Showcase/` and assert the dispersion itself: distinct horizontal offsets, a gap wider than the canvas rhythm, three closing pillars. | the sixth page                       |
