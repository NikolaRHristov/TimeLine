# Chat-Research reference

Ten tools that carry one research question to a web chat product and bring the answer back as
text: six for the conversation itself and four for the parts of a capture that are not the
answer's prose. Each opens with a header stating what it does and what it exits with; nothing
here names a machine, an account or an absolute path, and the endpoint comes from `CDP` (default
`http://127.0.0.1:9222`).

They are drivers, not a test suite, and they are the whole workflow: `cdp-open.mjs` creates the
background target and reports its handle, `cdp-send.mjs` puts the question in the composer and
verifies the send, `cdp-read.mjs` waits for the answer to stop streaming, `cdp-extract.mjs`
captures the answer as Markdown with its maths and code intact, `cdp-trace.mjs` keeps the step
tree that reached it, and `cdp-click.mjs` reaches a control that no label match can find. Exit `2`
with one `blocker:` line means the run could not proceed; exit `1` means it ran and its claim did
not hold. No script installs a dependency: the global `WebSocket` and `fetch` of Node 22 are the
transport.

`research.mjs` is the command a worker runs, and it is the whole capture in one step: a thread id
in, a Markdown file out. A worker has no person to copy a `ws` handle out of `/json/list` for it, so
the script resolves the id to a page target itself and then spawns `cdp-extract.mjs` with that
handle. The serialiser stays in one file, and a fix to how TeX or code is read reaches every caller.
Where several tabs carry the id the first is used and the choice is printed, so a capture never
silently reads the wrong thread; a missing tab, or no browser at all, is one `blocker:` line and
exit `2`.

| File              | What it does                                                                                            | Notes                                |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `cdp-open.mjs`    | Create a background target, navigate it, and print the `ws` handle, the title and the head of the text. | nothing is activated or focused      |
| `cdp-send.mjs`    | Click the visible composer, replace its text, click Submit, then check the composer emptied.            | `sent: true` is the only success     |
| `cdp-click.mjs`   | Click one control by accessible label, or by `css:` selector when it carries no label.                  | a zero rect is reported, not clicked |
| `cdp-read.mjs`    | Poll `document.body.innerText` until it stops changing, then print the text or its tail.                | `--stable` is the completion rule    |
| `cdp-extract.mjs` | Serialise the rendered answer to Markdown, reading TeX from KaTeX's annotation and code from `pre`.     | `--out` writes the artefact          |
| `research.mjs`    | Resolve a thread id to the page target whose URL carries it, then capture that tab as Markdown.         | the command a worker runs            |
| `cdp-trace.mjs`   | Read the answer's collapsible steps as a tree and write one JSON line per step and per source.          | `--fixture` needs no browser         |
| `observe.mjs`     | Watch the page after a send and print a line per change until it stops changing.                        | exit `1` when the timeout fired      |
| `bundle.mjs`      | Turn a directory into deterministic batches a composer will accept, with a manifest.                    | no browser; same tree, same batches  |
| `attach.mjs`      | Set a batch or a list of files on the composer's hidden file input.                                     | exit `1` when the page took fewer    |

`cdp-read.mjs` is for knowing when an answer has stopped arriving. `cdp-extract.mjs` is for keeping
it: `innerText` returns a rendered formula as hundreds of positioned glyphs, one per line, so an
equation survives only if the extractor reads the original TeX out of
`annotation[encoding="application/x-tex"]`. The same reader is why code blocks vanish from an
`innerText` capture and appear under `pre > code`.

## The trace is a tree

An answer renders its work as nested collapsible steps, and that nesting is the evidence for how it
was reached - it is not in the answer text, so a capture that keeps only the prose loses the
argument. `cdp-trace.mjs` reads the nesting the DOM already states and writes one JSON line per step
with `id` and `parent` on it, plus one line per source. Depth is a consequence of nesting, never an
input to it: the driver does not count indentation and rebuild a tree from the count.

A collapsed step has no rendered children, so its subtree does not exist to be read. `--expand`
clicks every collapsed header and repeats, because opening a node renders headers that were not in
the DOM a moment ago; it stops when a pass opens nothing, and reports what stayed shut. The count of
still-collapsed headers is the progress signal - a click is not an opening.

Two self-checks need no browser. `--selftest` parses the page-side scripts, which are strings, so a
broken escape is a SyntaxError only the browser would otherwise report. `--fixture <file.json>`
feeds the same shape the page returns through the tree serialiser, which is how the ids are tested
without a page. The reader also reports `unread`: a container that still holds headers while its
step recorded no children is a hole in the tree, not a leaf.

## The capture contract

What a capture must contain, and what it must refuse, so that two captures of the same thread are
comparable.

**Keep** - the answer's own prose; every formula as its TeX source; every code block with its
language; lists and tables as structure; each source as a link with its href; the step trace
(`cdp-trace.mjs`) as separate JSON lines, because the trace is how the answer was reached and it is
not in the answer text.

**Refuse** - navigation chrome (`New`, `Projects`, `Recents`, the account button), the composer and
its controls, the suggestion chips under an answer, and any string that only exists because a panel
was open. The `main` selector excludes most of it; a capture that starts with `New` and `Projects`
is evidence that a narrower selector was needed, not that the page was empty.

**Never capture with `innerText`.** A rendered page loses the source of everything it renders.

**A capture is bounded by what the DOM has mounted.** A long thread virtualises its older turns, so
extracting a thread that has been scrolled to the top returns only the visible window - the same
thread can yield 12k characters at one moment and 20k at another. When a capture must be complete,
scroll the thread from the top in steps and concatenate the segments, and record the segment count
in the artefact so a reader knows whether they are holding the whole conversation or its last
screen.

**Name the artefact after the thread id**, never after its title: titles change when a follow-up is
asked, ids do not.

## Feeding a corpus into a thread

A question about a body of code is answered better with the code attached than pasted into the
composer, and the composer takes files through an `<input type="file" multiple>` that is usually
hidden. Three tools make that one operation, and each one reports what the page actually took.

`bundle.mjs` turns a directory into batches: `tree.txt` (the shape), `batch-NN.txt` (each file
preceded by a `--- FILE: <relative path> ---` line) and `manifest.json` (what went where, and what
was left out for being larger than `--max-bytes`). Order is by path and the split is by file count
and byte budget, so two runs over the same tree produce the same batches and batch 3 can be diffed
between them. The exclude list is matched case-insensitively, because a Rust workspace puts its
build in `Target/` while the list is written as `target`, and on a case-sensitive volume those are
two different directories.

`attach.mjs` sets the files on the input with `DOM.setFileInputFiles`. A click cannot do it: the
input is hidden and the page's handler is a React `onChange`, so only the protocol call sets the
files *and* lets the page react to them. It reads the input's `multiple` and `accept` first and
stops on a `blocker:` when the files cannot be taken, then checks the composer for each name - the
page can refuse a file silently, so what the composer shows is the only proof.

`observe.mjs` is the optional half. After a send it installs a MutationObserver, samples the
character count, the composer, the submit control, the mode toggle and the attachment markers, and
prints a line only when one of them changed. It exits `0` once the page has been quiet for `--idle`
samples *and* the composer is empty, and `1` when `--timeout` fired first. A page that has not
changed since the watch began is a page whose answer has not started, never a page that has settled.

`research.mjs` captures what is rendered at the moment it runs, so a thread that is still streaming
needs `cdp-read.mjs --stable 3` first; otherwise the file is a partial answer that reads as a whole
one.
