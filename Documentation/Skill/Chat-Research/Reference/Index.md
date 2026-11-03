# Chat-Research reference

Six CDP drivers that carry one research question to a web chat product and bring the answer back as
text. Each opens with a header stating what it does and what it exits with; nothing here names a
machine, an account or an absolute path, and the endpoint comes from `CDP` (default
`http://127.0.0.1:9222`).

They are drivers, not a test suite, and they are the whole workflow: `cdp-open.mjs` creates the
background target and reports its handle, `cdp-send.mjs` puts the question in the composer and
verifies the send, `cdp-read.mjs` waits for the answer to stop streaming, `cdp-extract.mjs` captures
the answer as Markdown with its maths and code intact, and `cdp-click.mjs` reaches a control that no
label match can find. Exit `2` with one `blocker:` line means the run could not proceed; exit `1`
means it ran and the send did not take. No script installs a dependency: the global `WebSocket` and
`fetch` of Node 22 are the transport.

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

`cdp-read.mjs` is for knowing when an answer has stopped arriving. `cdp-extract.mjs` is for keeping
it: `innerText` returns a rendered formula as hundreds of positioned glyphs, one per line, so an
equation survives only if the extractor reads the original TeX out of
`annotation[encoding="application/x-tex"]`. The same reader is why code blocks vanish from an
`innerText` capture and appear under `pre > code`.

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

`research.mjs` captures what is rendered at the moment it runs, so a thread that is still streaming
needs `cdp-read.mjs --stable 3` first; otherwise the file is a partial answer that reads as a whole
one.
