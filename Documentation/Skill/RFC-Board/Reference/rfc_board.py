#!/usr/bin/env python3
# Archived tool: rfc_board.py
#
# What it does: Compare the RFC project board with the committed record files and report the difference; render one body per record; verify the published board. It writes to GitHub only when its `sync` command is named, and then only what the report it printed says.
# Kept here so a later session reuses it instead of rewriting it.
# Run it from the repository root; it reads the paths it names and nothing else.
# Archived: 2026-11-03 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
"""Assemble the RFC project board from the records in `Documentation/RFC/proposed/`.

One direction of flow: the record file is authoritative, the issue follows it, the
project item follows the issue. Nothing here writes back into a record.

The board is shared state: anyone with repository permission can edit it, so a run
that rewrote items and fields would silently discard their edits. This tool therefore
reads by default and writes only when told to.

  plan     the default, and what a bare run does. Compare the committed records
           with the board and report what it would create, what it would update and
           what already agrees. No write call on this path: exit 0 when the board
           agrees, 1 when it does not.
  render   read every committed record, write one issue body per record into the
           work directory, leak-scan the bodies and prove each Decision section
           survived the round trip byte for byte. Touches nothing remote.
  verify   an independent read of the published project - counts, field values,
           views, one file-to-board trace, every item's axes against its record,
           a leak sweep - and an exit code. Reads only.
  readme   report whether the project's README matches `Reference/project-README.md`.
           Reads only.
  sync     the only writer. Perform what `plan` reports, printing one line per
           mutation. It refuses to run on a board that holds items unless `--reason`
           names why the write is justified; on an empty board the run is the
           initial sync and needs no reason.

Every write passes through one seam, `gh` or `graphql`, and that seam refuses a
mutation unless `sync` has declared itself first. A write added later is refused by
default rather than by review.

Only committed records are published, and "committed" means one commit's snapshot:
`HEAD` is resolved once, `git ls-tree -r` names the records inside that commit, and
every record's text comes from `git show <commit>:<path>`. The index is never the
list and the working tree is never the source, so a record that was staged and
never committed is absent from the run, and a record edited after its commit
renders the bytes that commit holds. A record on disk but not in the commit is
reported as skipped. Commit the record, run `plan` to see the delta, and `sync` to
land it.

The procedure that wraps this tool is `Documentation/Skill/RFC-Board/SKILL.md`.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PROPOSED = "Documentation/RFC/proposed"

DEFAULT_OWNER = "TimeLine-DELO"
DEFAULT_REPO = "TimeLine"
DEFAULT_PROJECT = 1
DEFAULT_BRANCH = "Current"

STATUS_OPTIONS = ("Proposed", "Implemented")

# The record's own status vocabulary is lowercase and is a lifecycle, not a board
# option: `settled` is the record's word for what the project calls Implemented.
# `superseded` has no option on the board, so a record that carries it renders its
# own word in the body and leaves the field alone rather than claiming a state.
BOARD_STATUS = {
    "proposed": "Proposed",
    "settled": "Implemented",
    "superseded": "Superseded",
}


# The three classification axes, each a closed vocabulary. No value appears on
# two axes: `governance` was a class and an area at once, so a table sorted by
# one and a board filtered by the other returned the same rows, and the second
# axis taught a reader nothing.
AXES = (
    ("Kind", ("architecture", "contract", "policy", "specification", "method")),
    (
        "Subject",
        (
            "data",
            "transport",
            "identity",
            "surface",
            "network",
            "operation",
            "economy",
            "text",
        ),
    ),
    ("Horizon", ("now", "next", "later")),
)
AXIS_OPTIONS = dict(AXES)

FIELDS = ("RFC", "Status", "Kind", "Subject", "Horizon", "Cards")

# Records per mutation request. Each record contributes up to five aliases, so a
# slice of four stays inside the twenty aliases GitHub answers reliably; a wider
# request is answered with a 502 that has to be retried anyway.
SLICE = 4
ADD_WORKERS = 6

# The em dash is built at runtime. A literal U+2014 does not survive the tool
# transport that writes this file or passes it as an argument - it arrives as an
# ASCII hyphen, and every issue title silently loses its separator.
SEP = "\u2014"

# Patterns that must never reach a public body. A kanban card id is absent on
# purpose: the record files carry them and the repository is public.
#
# The home root is assembled from parts, not written as one literal, because the
# archiver that copies this file into the skill tree scrubs a literal home root
# on the way in and would replace it inside the pattern. The `.local` branch
# excludes a following dot, so a repository path such as
# `Maintain/Spacetime/spacetime.local.json` is a path and not a hostname. The
# `/Volumes/` branch carries a negative lookbehind: RFC-0010's verification table
# greps for `\|/Volumes/`, and a pattern that names a path is the test for a
# leak, not a leak.
LEAK = re.compile(
    "/"
    + "Users"
    + "/|(?<!\\|)/Volumes/|\\bNikolas-|\\.local\\b(?!\\.)|\\blocal-[0-9a-f]{8}"
    + r"|gho_|ghp_|github_pat_|BEGIN [A-Z ]*PRIVATE KEY|/private/tmp"
)

# A record states its metadata in a YAML block at the top of the file. The block
# is written by `Scripts/RFC-Frontmatter.mjs`, and it is read here by a parser for
# the shape that writer emits rather than by a general YAML library: this tool
# runs under whatever `python3` the operator has, and a dependency on PyYAML would
# make `pnpm run RFC:Board` fail on a machine that has no network. The parser is
# narrow on purpose - a construct it does not know is a `RecordError` naming the
# line, never a value guessed into place.
KEY_LINE = re.compile(r"^([a-z_]+):(?:[ ](.*))?$")
ITEM_LINE = re.compile(r"^([ ]*)- (.*)$")
CARD_ID = re.compile(r"\bt_[0-9a-f]{8}\b")

ITEMS_QUERY = """
query($p: ID!, $after: String) {
  node(id: $p) {
    ... on ProjectV2 {
      items(first: 100, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content {
            __typename
            ... on Issue { number title url }
          }
          rfc: fieldValueByName(name: "RFC") {
            ... on ProjectV2ItemFieldNumberValue { number }
            ... on ProjectV2ItemFieldTextValue { text }
          }
          kind: fieldValueByName(name: "Kind") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          status: fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          subject: fieldValueByName(name: "Subject") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          horizon: fieldValueByName(name: "Horizon") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          cards: fieldValueByName(name: "Cards") { ... on ProjectV2ItemFieldTextValue { text } }
        }
      }
    }
  }
}
"""


class RecordError(Exception):
    """A record that cannot be parsed. Reported, never fatal to the whole run."""


# --------------------------------------------------------------------------- #
# Repository and records
# --------------------------------------------------------------------------- #


def repo_root() -> Path:
    """The first directory above this file that holds the corpus.

    Discovered by walking up rather than by counting parents, so the tool runs
    from the skill tree, from a scratch copy, or from a subdirectory of either.
    """
    here = Path(__file__).resolve()
    for candidate in (here, *here.parents):
        if (candidate / PROPOSED).is_dir():
            return candidate
    raise SystemExit(f"no {PROPOSED} above {here}; run this from inside the repository")


def git(root: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True
    )
    if proc.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def head_commit(root: Path) -> str:
    """The one commit every record is read from, resolved once per run.

    A run reads a snapshot, not a state. The index and the working tree are
    whatever a person happens to be doing at the moment; `HEAD` is the agreement,
    so it is the only thing a published board may be derived from.
    """
    proc = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "--verify", "HEAD"],
        capture_output=True,
        text=True,
    )
    commit = proc.stdout.strip()
    if proc.returncode != 0 or not commit:
        raise SystemExit(
            f"no commit to read in {root}: "
            f"{proc.stderr.strip() or 'git rev-parse HEAD answered nothing'}"
        )
    return commit


def committed_files(root: Path, commit: str) -> list[str]:
    """The records inside `commit` - never the ones the index lists.

    `git ls-files` answers with the index, which carries a file that was staged
    and never committed. `git ls-tree` answers with one tree, so a record joins
    the corpus by being committed and by no other means.
    """
    out = git(root, "ls-tree", "-r", "--name-only", "-z", commit, "--", PROPOSED)
    names = sorted(name for name in out.split("\0") if name.endswith(".md"))
    if not names:
        raise SystemExit(
            f"no committed record under {PROPOSED} at {commit[:12]}; "
            "nothing to publish (commit a record first)"
        )
    return names


def committed_text(root: Path, commit: str, name: str) -> str:
    """One record's bytes as `commit` holds them - never as the disk holds them.

    Read as bytes and decoded here rather than through `text=True`, so a blob
    that is not UTF-8 is a message naming the record instead of a traceback out
    of the subprocess decoder.
    """
    proc = subprocess.run(
        ["git", "-C", str(root), "show", f"{commit}:{name}"], capture_output=True
    )
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace").strip()
        raise SystemExit(
            f"cannot read {name} at {commit[:12]}: {detail or 'git show failed'}"
        )
    try:
        return proc.stdout.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SystemExit(f"{name} at {commit[:12]} is not UTF-8 text: {error}")


def untracked_files(root: Path) -> list[str]:
    out = git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", PROPOSED)
    return sorted(name for name in out.split("\0") if name.endswith(".md"))


def changed_files(root: Path) -> list[str]:
    """Every record whose index or working-tree text differs from `HEAD`."""
    out = git(root, "diff", "--name-only", "-z", "HEAD", "--", PROPOSED)
    return sorted(name for name in out.split("\0") if name.endswith(".md"))


def split_frontmatter(text: str) -> tuple[dict, str]:
    """The metadata block at the top of a record, and the body that follows it."""
    if not text.startswith("---\n"):
        raise RecordError("no frontmatter block at the top of the file")
    end = text.find("\n---\n", 3)
    if end == -1:
        raise RecordError("the frontmatter block is never closed")
    return parse_block(text[4 : end + 1].split("\n")), text[end + 5 :]


def read_scalar(text: str):
    """One scalar: plain, double-quoted, or single-quoted."""
    if text.startswith('"'):
        try:
            return json.loads(text)
        except json.JSONDecodeError as error:
            raise RecordError(f"a double-quoted scalar does not read back: {error}")
    if text.startswith("'"):
        if len(text) < 2 or not text.endswith("'"):
            raise RecordError("a single-quoted scalar is not closed")
        return text[1:-1].replace("''", "'")
    return text


def read_block(lines: list[str]) -> str:
    """A literal block scalar: the lines under `|-`, with their common indent removed."""
    body = [line for line in lines if line.strip()]
    if not body:
        raise RecordError("a block scalar holds nothing")
    indent = min(len(line) - len(line.lstrip(" ")) for line in body)
    return "\n".join(line[indent:] if line.strip() else "" for line in lines).rstrip(
        "\n"
    )


def parse_block(lines: list[str]) -> dict:
    """Every top-level `key: value` in a block, with the sequences it holds."""
    fields: dict[str, object] = {}
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        match = KEY_LINE.match(line)
        if not match:
            raise RecordError(f"unreadable frontmatter line {index + 1}: {line!r}")
        key, rest = match.group(1), (match.group(2) or "").strip()
        index += 1
        if rest in ("|-", "|"):
            start = index
            while index < len(lines) and (
                not lines[index].strip() or lines[index].startswith(" ")
            ):
                index += 1
            fields[key] = read_block(lines[start:index])
        elif rest == "[]":
            fields[key] = []
        elif rest:
            fields[key] = read_scalar(rest)
        else:
            fields[key], index = parse_sequence(lines, index)
    return fields


def parse_sequence(lines: list[str], index: int) -> tuple[list, int]:
    """A block sequence, whose items are scalars, block scalars or small mappings."""
    items: list = []
    indent = None
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        match = ITEM_LINE.match(line)
        if match is None or (indent is not None and len(match.group(1)) != indent):
            if indent is None:
                raise RecordError(
                    f"line {index + 1}: a key with no value holds no sequence"
                )
            break
        if indent is None:
            indent = len(match.group(1))
        first = match.group(2)
        index += 1
        base = indent + 2
        continuation: list[str] = []
        while index < len(lines):
            following = lines[index]
            if not following.strip():
                index += 1
                continue
            if len(following) - len(following.lstrip(" ")) < base:
                break
            continuation.append(following[base:])
            index += 1
        items.append(parse_item(first, continuation))
    if indent is None:
        raise RecordError(f"line {index + 1}: a key with no value holds no sequence")
    return items, index


def parse_item(first: str, continuation: list[str]):
    """One sequence item, in the three shapes the writer emits."""
    if first in ("|-", "|"):
        return read_block(continuation)
    if KEY_LINE.match(first):
        return parse_block([first, *continuation])
    if continuation:
        raise RecordError(f"a scalar item carries a continuation: {first!r}")
    return read_scalar(first)


def section(body: str, name: str, required: bool = True) -> str:
    """The verbatim text of `## <name>` up to the next `## ` at column zero."""
    marker = f"\n## {name}\n"
    index = body.find(marker)
    if index == -1:
        if required:
            raise RecordError(f"section {name!r} not found")
        return ""
    start = index + len(marker)
    rest = body[start:]
    end = rest.find("\n## ")
    return (rest if end == -1 else rest[:end]).strip("\n")


def parse_record(name: str, text: str) -> dict:
    """One record, parsed from the text one commit holds for `name`.

    The text is passed in rather than read from `name`, so the parser has no way
    to open the working tree: the only bytes it can see are the ones the caller
    took out of the commit.
    """
    fields, body = split_frontmatter(text)

    required = ("title", "rfc", "category", "kind", "status", "horizon", "depends")
    missing = [key for key in required if key not in fields]
    if missing:
        raise RecordError(f"the frontmatter is missing {', '.join(missing)}")
    if fields["kind"] != "rfc":
        raise RecordError(f"kind {fields['kind']!r} is not a record")

    category = str(fields["category"])
    kind, separator, subject = category.partition("/")
    if not separator:
        raise RecordError(f"category {category!r} is not <Kind>/<Subject>")
    kind, subject = kind.lower(), subject.lower()
    for axis, value in (
        ("Kind", kind),
        ("Subject", subject),
        ("Horizon", fields["horizon"]),
    ):
        if value not in AXIS_OPTIONS[axis]:
            raise RecordError(f"{axis} {value!r} is not one of {AXIS_OPTIONS[axis]}")

    status = BOARD_STATUS.get(str(fields["status"]).lower())
    if status is None:
        raise RecordError(
            f"status {fields['status']!r} is not one of {tuple(BOARD_STATUS)}"
        )

    try:
        number = int(str(fields["rfc"]).zfill(4))
    except ValueError:
        raise RecordError(f"rfc {fields['rfc']!r} is not a number")

    depends = fields["depends"]
    if not isinstance(depends, list):
        raise RecordError("depends is not a list")

    return {
        "number": number,
        "id": f"RFC-{number:04d}",
        "title": str(fields["title"]),
        "path": name,
        "status": status,
        "date": str(fields.get("date", "")),
        "kind": kind,
        "subject": subject,
        "horizon": str(fields["horizon"]),
        "task_dependencies": ", ".join(str(item) for item in depends),
        "applies_to": str(fields.get("applies_to", "")),
        "supersedes": str(fields.get("supersedes", "")),
        "superseded_by": str(fields.get("superseded_by", "")),
        "decision": section(body, "Decision"),
        "verification": section(body, "Verification"),
        "open_questions": section(body, "Open questions", required=False),
    }


def load(root: Path) -> tuple[list[dict], list[str], list[tuple[str, str]], list[str]]:
    """Every committed record, plus what was skipped and what could not be read.

    One commit is resolved here and everything below reads that commit: the
    enumeration, the bytes of each record and the report of what the tree holds
    that the commit does not.
    """
    commit = head_commit(root)
    committed = committed_files(root, commit)
    in_commit = set(committed)
    skipped = untracked_files(root)
    records: list[dict] = []
    errors: list[tuple[str, str]] = []
    for name in committed:
        try:
            record = parse_record(name, committed_text(root, commit, name))
        except RecordError as error:
            errors.append((name, str(error)))
            continue
        records.append(record)

    warnings: list[str] = []
    # Two states a reader has to be told about, because the board is silent about
    # both: a record staged and never committed is not in the snapshot at all, and
    # a record edited after its commit publishes the bytes the commit holds.
    for name in changed_files(root):
        if name in in_commit:
            warnings.append(
                f"{name}: edited since {commit[:12]}, so its committed bytes are what publishes"
            )
        elif name not in skipped:
            warnings.append(
                f"{name}: staged but not in {commit[:12]}, so it is not published (commit it)"
            )
    counts = collections.Counter(record["number"] for record in records)
    for number, count in sorted(counts.items()):
        if count > 1:
            warnings.append(f"RFC-{number:04d} appears in {count} committed files")
    numbers = sorted(counts)
    if numbers:
        gaps = [n for n in range(1, numbers[-1] + 1) if n not in counts]
        if gaps:
            warnings.append(f"numbering gaps: {gaps}")
    for record in records:
        if record["status"] not in STATUS_OPTIONS:
            warnings.append(
                f"{record['id']}: Status {record['status']!r} is not one of {STATUS_OPTIONS}"
            )
        for axis, options in AXES:
            value = record[axis.lower()]
            if value not in options:
                warnings.append(
                    f"{record['id']}: {axis} {value!r} is not one of {options}"
                )
    records.sort(key=lambda record: record["number"])
    return records, skipped, errors, warnings


def cards_of(record: dict) -> list[str]:
    return sorted(set(CARD_ID.findall(record["task_dependencies"])))


def report_load(
    root: Path,
    records: list[dict],
    skipped: list[str],
    errors: list[tuple[str, str]],
    warnings: list[str],
) -> None:
    print(f"committed records: {len(records)}")
    print(f"untracked records skipped: {len(skipped)}")
    for name in skipped:
        print(f"  skip {name} (untracked: not committed, so not published)")
    if errors:
        print(f"unreadable records: {len(errors)}")
        for name, reason in errors:
            print(f"  FAIL {name}: {reason}")
    for warning in warnings:
        print(f"  warn {warning}")
    classes = collections.Counter(record["kind"] for record in records)
    statuses = collections.Counter(record["status"] for record in records)
    print(f"kinds: {json.dumps(dict(sorted(classes.items())))}")
    print(f"statuses: {json.dumps(dict(sorted(statuses.items())))}")


# --------------------------------------------------------------------------- #
# Bodies
# --------------------------------------------------------------------------- #


def render_body(record: dict, slug: str, branch: str, tool: str) -> str:
    cards = cards_of(record)
    cards_line = ", ".join(f"`{card}`" for card in cards) if cards else "none named"
    source_url = f"https://github.com/{slug}/blob/{branch}/{record['path']}"
    parts = [
        "## Decision",
        "",
        record["decision"],
        "",
        "---",
        "",
        f"**Kind:** {record['kind']}  ",
        f"**Subject:** {record['subject']}  ",
        f"**Horizon:** {record['horizon']}  ",
        f"**Status:** {record['status']}  ",
        f"**Task dependencies:** {record['task_dependencies']}  ",
        f"**Implementing cards:** {cards_line}  ",
        f"**Source:** [`{record['path']}`]({source_url})",
        "",
        "## Verification",
        "",
        record["verification"],
        "",
        "---",
        "",
        f"<sub>Assembled from the record by `{tool}`, which reads the records and "
        "renders this text; the board itself is written only by that tool's `sync` "
        "command, run deliberately. The decision text above is the record's own "
        "section, copied verbatim. The issue is rebuilt from the file whenever the "
        "file changes, and never carries a summary.</sub>",
    ]
    return "\n".join(parts).rstrip() + "\n"


def bodies_for(
    records, slug, branch, tool
) -> tuple[dict[str, str], list[tuple[str, str]], list[str]]:
    bodies: dict[str, str] = {}
    leaks: list[tuple[str, str]] = []
    unplaced: list[str] = []
    for record in records:
        missing = [axis for axis, _ in AXES if not record[axis.lower()]]
        if missing:
            unplaced.append(f"{record['id']} ({', '.join(missing)})")
        body = render_body(record, slug, branch, tool)
        bodies[record["id"]] = body
        for match in LEAK.finditer(body):
            leaks.append((record["id"], match.group(0)))
    return bodies, leaks, unplaced


# --------------------------------------------------------------------------- #
# GitHub
# --------------------------------------------------------------------------- #


# The CLI's mutating verbs, as `gh <noun> <verb>` spells them. A call whose verb is
# here changes state other people own, so it is refused unless this run has declared
# itself the sync. The check lives in the seam rather than at each call site: a write
# added later is refused by default instead of by review.
MUTATING_VERBS = frozenset(
    {
        "add",
        "archive",
        "close",
        "comment",
        "create",
        "delete",
        "edit",
        "field-create",
        "field-delete",
        "item-add",
        "item-archive",
        "item-delete",
        "item-edit",
        "link",
        "merge",
        "remove",
        "reopen",
        "set",
        "transfer",
        "unlink",
        "update",
    }
)

# Empty until `sync` sets it, after its precondition has been met. A module global
# rather than a parameter because the seam is shared by every call site, and the
# point is that no call site can opt itself in.
WRITES: dict[str, str] = {"reason": ""}


def allow_writes(reason: str) -> None:
    """Declare this run the sync, with the reason a write is justified."""
    WRITES["reason"] = reason


def require_write(what: str) -> None:
    """Refuse a mutation unless this run is the sync.

    One line and a non-zero exit, never a traceback: a refusal is an answer about the
    command, not a fault in it.
    """
    if WRITES["reason"]:
        return
    raise SystemExit(
        f"refusing to {what}: this command reads the board and never writes it; "
        "the only writer is `sync`"
    )


def refuse(message: str) -> None:
    """The inputs, not the board, are wrong: one line on stderr and exit 2."""
    print(message, file=sys.stderr)
    raise SystemExit(2)


def parse_json(text: str, what: str) -> dict:
    """The JSON a command answered with, or a message naming what answered instead."""
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        first = (text.strip().splitlines() or [""])[0][:200]
        raise SystemExit(f"{what} answered with something that is not JSON: {error}: {first}")


def gh(
    *args: str, stdin: str | None = None, write: str = ""
) -> subprocess.CompletedProcess:
    """The one CLI seam. A mutating verb is refused unless `sync` enabled writes.

    `gh api` is excluded because it is a read or a write depending on its payload;
    every GraphQL call goes through `graphql` below, which makes that distinction.
    """
    if len(args) > 1 and args[0] != "api" and args[1] in MUTATING_VERBS:
        require_write(write or f"run `gh {' '.join(args[:2])}`")
    try:
        return subprocess.run(
            ["gh", *args], input=stdin, capture_output=True, text=True
        )
    except FileNotFoundError:
        raise SystemExit("gh is not installed or not on PATH")


def gh_json(*args: str, attempts: int = 3) -> dict:
    """A read through the CLI, retried while the refusal is a rate limit.

    A token shared with other clients is throttled in bursts: a query that a minute
    ago answered is refused, and the same query a few seconds later answers again.
    A read is safe to repeat, so it is repeated rather than reported as a failure of
    the board.
    """
    last = ""
    for attempt in range(attempts):
        proc = gh(*args)
        if proc.returncode == 0:
            return parse_json(proc.stdout, f"gh {' '.join(args[:2])}")
        last = proc.stderr.strip()
        # `unknown owner type` is the CLI's reading of a throttled owner lookup: it
        # asks which kind of owner the login is, gets nothing back, and reports the
        # absence as a fact about the login. Both refusals are retried.
        transient = "rate limit" in last.lower() or "unknown owner type" in last.lower()
        if not transient or attempt == attempts - 1:
            break
        time.sleep(5 * (attempt + 1))
    raise SystemExit(f"gh {' '.join(args)} failed: {last}")


def graphql(query: str, variables: dict | None = None) -> dict:
    """One GraphQL document. A `mutation` is refused unless this run is the sync."""
    if query.lstrip().startswith("mutation"):
        require_write("send a GraphQL mutation")
    proc = gh(
        "api",
        "graphql",
        "--input",
        "-",
        stdin=json.dumps({"query": query, "variables": variables or {}}),
    )
    if proc.returncode != 0:
        raise SystemExit(f"gh api graphql failed: {proc.stderr.strip()}")
    payload = parse_json(proc.stdout, "gh api graphql")
    if payload.get("errors"):
        raise SystemExit(f"graphql errors: {json.dumps(payload['errors'])[:800]}")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise SystemExit("gh api graphql answered with no data")
    return data


def project_id(owner: str, number: int) -> str:
    """The project's node id, resolved from the owner and the project number.

    An owner is either an organization or a user, and asking for both in one
    document fails the whole response: a missing user is a GraphQL error, not a
    null. So the two lookups are separate requests and the second is only tried
    when the first answers nothing.
    """
    queries = {
        "organization": (
            "query($owner: String!, $number: Int!){"
            "organization(login: $owner){projectV2(number: $number){id title}}}"
        ),
        "user": (
            "query($owner: String!, $number: Int!){"
            "user(login: $owner){projectV2(number: $number){id title}}}"
        ),
    }
    for holder, query in queries.items():
        proc = gh(
            "api",
            "graphql",
            "--input",
            "-",
            stdin=json.dumps(
                {"query": query, "variables": {"owner": owner, "number": number}}
            ),
        )
        if proc.returncode != 0:
            continue
        payload = json.loads(proc.stdout)
        if payload.get("errors"):
            continue
        project = ((payload.get("data") or {}).get(holder) or {}).get("projectV2")
        if project:
            return project["id"]
    raise SystemExit(f"no project {number} on {owner} (tried organization and user)")


FIELDS_QUERY = """
query($p: ID!) {
  node(id: $p) {
    ... on ProjectV2 {
      fields(first: 50) {
        nodes {
          __typename
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField { options { id name } }
        }
      }
    }
  }
}
"""


def project_fields(project: str) -> dict[str, dict]:
    """Every field with its id, data type and options, in one request.

    The data type is not decoration: a plain field holds text or a number
    depending on how it was created, and the value written into it has to be the
    matching shape. This project's `RFC` field holds the zero-padded text `0001`,
    so `{number: 1}` would be refused while `{text: "0001"}` is accepted.
    """
    data = graphql(FIELDS_QUERY, {"p": project})
    nodes = ((data.get("node") or {}).get("fields") or {}).get("nodes")
    if not nodes:
        raise SystemExit(
            f"project {project} answered no fields; check --owner and --project"
        )
    return {node["name"]: node for node in nodes}


def option_id(fields: dict[str, dict], field: str, name: str) -> str:
    for option in fields.get(field, {}).get("options", []):
        if option["name"] == name:
            return option["id"]
    raise SystemExit(
        f"no option {name!r} on field {field!r}: "
        f"{[o['name'] for o in fields.get(field, {}).get('options', [])]}"
    )


def gh_api(path: str) -> str:
    proc = gh("api", path)
    if proc.returncode != 0:
        raise SystemExit(f"gh api {path} failed: {proc.stderr.strip()}")
    return proc.stdout


def issue_index(slug: str, limit: int, with_body: bool = False) -> dict[str, dict]:
    """Title -> the issue's number and body, read over REST.

    REST rather than `gh issue list`, because that command is served by the search
    API and search has its own thirty-requests-a-minute budget, which a board build
    shares with every other client of the same token. The issues endpoint is
    paginated, and the pull requests that share it are skipped.
    """
    issues: dict[str, dict] = {}
    page = 1
    while True:
        batch = json.loads(
            gh_api(f"repos/{slug}/issues?state=all&per_page=100&page={page}")
        )
        for issue in batch:
            if "pull_request" in issue:
                continue
            entry = {"number": issue["number"], "title": issue["title"]}
            if with_body:
                entry["body"] = issue.get("body") or ""
            issues[entry["title"]] = entry
        if len(batch) < 100 or page * 100 >= limit:
            return issues
        page += 1


def items_page(project: str, cursor: str | None) -> dict:
    """One page of the project's items, or a message naming what answered instead."""
    data = graphql(ITEMS_QUERY, {"p": project, "after": cursor})
    page = (data.get("node") or {}).get("items")
    if not isinstance(page, dict):
        raise SystemExit(
            f"project {project} answered no items; check --owner and --project"
        )
    return page


def item_index(project: str) -> dict[str, dict]:
    """Title -> the item's id and the field values it already carries.

    The values are read as well as the ids, so a re-run can leave a field that
    already agrees with the record alone instead of rewriting every value on
    every run.
    """
    items: dict[str, dict] = {}
    cursor = None
    while True:
        page = items_page(project, cursor)
        for node in page["nodes"]:
            content = node.get("content") or {}
            if not content.get("title"):
                continue
            items[content["title"]] = {
                "id": node["id"],
                "rfc": rfc_number(node.get("rfc")),
                "kind": (node.get("kind") or {}).get("name"),
                "status": (node.get("status") or {}).get("name"),
                "subject": (node.get("subject") or {}).get("name"),
                "horizon": (node.get("horizon") or {}).get("name"),
                "cards": (node.get("cards") or {}).get("text"),
            }
        if not page["pageInfo"]["hasNextPage"]:
            return items
        cursor = page["pageInfo"]["endCursor"]


def rfc_number(value: dict | None) -> int | None:
    """The RFC field as a number, whichever shape the field holds it in.

    The field is a plain project field, and a plain field is text or a number
    depending on how it was created: this project's `RFC` holds the zero-padded
    text `0001`. Reading both shapes keeps the count and the comparison honest
    whether the value arrives as `1` or as `"0001"`.
    """
    value = value or {}
    if isinstance(value.get("number"), (int, float)):
        return int(value["number"])
    text = (value.get("text") or "").strip()
    return int(text) if text.isdigit() else None


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #


README_SOURCE = Path(__file__).resolve().parent / "project-README.md"


def rendered_readme(records: list[dict]) -> str | None:
    """The project README with its two tokens resolved.

    The file on disk is ASCII on purpose. A literal U+2014 does not survive the
    tool transport, and a count written into prose goes stale the moment a record
    is added, so the separator and the corpus size are tokens resolved here.
    """
    if not README_SOURCE.is_file():
        return None
    text = README_SOURCE.read_text(encoding="utf-8")
    return text.replace("@@DASH@@", SEP).replace("@@COUNT@@", str(len(records)))


def stored_readme(project: str) -> str:
    data = graphql(
        "query($p:ID!){node(id:$p){... on ProjectV2{readme}}}", {"p": project}
    )
    return (data.get("node") or {}).get("readme") or ""


def readme_state(project: str, records: list[dict]) -> tuple[str, str]:
    """The README against its source: a status word and the rendered text.

    `unchanged` and `differs` are the two answers a reader needs; `no source file`
    is the third and it is not an error, because a project may carry its README
    alone. Nothing is written here - the state is a read, and `sync` acts on it.
    """
    rendered = rendered_readme(records)
    if rendered is None:
        return "no source file", ""
    if stored_readme(project).rstrip("\n") == rendered.rstrip("\n"):
        return "unchanged", rendered
    return "differs", rendered


def update_readme(project: str, rendered: str) -> tuple[str, list[str]]:
    """Write the rendered README, then prove the stored text is what was sent."""
    data = graphql(
        "mutation($p: ID!, $r: String!){updateProjectV2(input:{projectId: $p, readme: $r})"
        "{projectV2{readme}}}",
        {"p": project, "r": rendered},
    )
    stored = ((data.get("updateProjectV2") or {}).get("projectV2") or {}).get(
        "readme"
    ) or ""
    if stored.rstrip("\n") != rendered.rstrip("\n"):
        return "updated, but the stored text differs", [
            f"readme round trip differs: stored {len(stored)} chars against rendered {len(rendered)}"
        ]
    return f"updated ({len(rendered)} chars)", []


def cmd_readme(args) -> int:
    """Report the README against its source. Reads only."""
    root, work, records, slug = prepare(args)
    project = project_id(args.owner, args.project)
    status, rendered = readme_state(project, records)
    print(f"project readme: {status}")
    if status == "differs":
        print(
            f"  the stored README is not the rendered source ({len(rendered)} chars); "
            "`sync` writes it"
        )
        return 1
    return 0


def prepare(args) -> tuple[Path, Path, list[dict], str]:
    root = repo_root()
    work = (
        Path(args.work).resolve()
        if args.work
        else root / "Maintain" / "Storage" / "RFC-Board"
    )
    work.mkdir(parents=True, exist_ok=True)
    records, skipped, errors, warnings = load(root)
    report_load(root, records, skipped, errors, warnings)
    if errors:
        raise SystemExit(
            f"{len(errors)} committed record(s) could not be read; "
            "the board cannot be compared against a corpus that does not parse"
        )
    (work / "records.json").write_text(
        json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return root, work, records, f"{args.owner}/{args.repo}"


def cmd_render(args) -> int:
    """The bodies on their own, in the work directory. Touches nothing remote."""
    root, work, records, slug = prepare(args)
    tool = relative_tool(root)
    bodies, leaks, unplaced = bodies_for(records, slug, args.branch, tool)
    out = write_bodies(work, records, bodies)

    print(f"\nbodies written: {len(bodies)} -> {out}")
    print(f"leak hits: {len(leaks)}")
    for record_id, hit in leaks:
        print(f"  LEAK {record_id}: {hit!r}")
    if unplaced:
        print(f"records missing an axis: {len(unplaced)} -> {unplaced}")

    broken = [
        record["id"]
        for record in records
        if record["decision"] not in bodies[record["id"]]
    ]
    print(f"decision text intact: {len(records) - len(broken)}/{len(records)}")
    for record_id in broken:
        print(f"  MISMATCH {record_id}")
    return 1 if (leaks or broken) else 0


def relative_tool(root: Path) -> str:
    here = Path(__file__).resolve()
    try:
        return here.relative_to(root).as_posix()
    except ValueError:
        return "Documentation/Skill/RFC-Board/Reference/rfc_board.py"


# --------------------------------------------------------------------------- #
# The plan: one computation, two readers
# --------------------------------------------------------------------------- #


class Change:
    """One mutation the board would need in order to agree with the records.

    A change is data, not an action: `plan` prints the list and exits, `sync`
    executes the same list. There is one computation and two readers of it, so the
    report a person reads cannot differ from the writes that follow it.
    """

    __slots__ = ("phase", "record", "field", "value", "line")

    def __init__(
        self,
        phase: str,
        record: str,
        field: str = "",
        value: object = None,
        line: str = "",
    ) -> None:
        self.phase = phase
        self.record = record
        self.field = field
        self.value = value
        self.line = line

    def __repr__(self) -> str:
        return f"Change({self.phase!r}, {self.record!r}, {self.field!r})"


# The order a sync has to perform the phases in: an item needs the issue that a
# create produces, and a field value needs the item that an add produces.
PHASES = ("issue", "body", "item", "field", "readme")


class Board:
    """The project as one run read it: schema, issues and items, resolved once."""

    __slots__ = ("project", "fields", "options", "ids", "rfc_text", "issues", "items")

    def __init__(
        self,
        project: str,
        fields: dict[str, dict],
        issues: dict[str, dict],
        items: dict[str, dict],
    ) -> None:
        self.project = project
        self.fields = fields
        self.options, self.ids, self.rfc_text = resolve_options(fields)
        self.issues = issues
        self.items = items


def resolve_options(
    fields: dict[str, dict],
) -> tuple[dict[str, dict[str, str]], dict[str, str], bool]:
    """The option ids and field ids the schema holds, and whether `RFC` is text.

    Resolved from the project's own field list on every run: a field's id changes
    when its data type does, so a remembered id is a stale id.
    """
    options: dict[str, dict[str, str]] = {}
    for field, values in (("Status", STATUS_OPTIONS), *AXES):
        present = [
            option["name"] for option in fields.get(field, {}).get("options", [])
        ]
        options[field] = {
            name: option_id(fields, field, name) for name in values if name in present
        }
    ids = {name: fields[name]["id"] for name in FIELDS if name in fields}
    return options, ids, fields.get("RFC", {}).get("dataType") == "TEXT"


def read_board(args, slug: str) -> Board:
    """Every read a plan needs, in one place, so no command compares half a board."""
    project = project_id(args.owner, args.project)
    fields = project_fields(project)
    issues = issue_index(slug, args.limit, with_body=True)
    items = item_index(project)
    return Board(project, fields, issues, items)


def desired_values(
    record: dict, fields: dict[str, dict], options: dict[str, dict[str, str]]
) -> dict[str, object]:
    """The field values the record states, restricted to what the project holds."""
    desired: dict[str, object] = {
        "RFC": record["number"],
        "Status": record["status"] or "Proposed",
    }
    for axis, _ in AXES:
        value = record[axis.lower()]
        if value in options.get(axis, {}):
            desired[axis] = value
    cards = cards_of(record)
    if cards and "Cards" in fields:
        desired["Cards"] = ", ".join(cards)
    return desired


def plan_board(
    board: Board, records: list[dict], bodies: dict[str, str], readme: str
) -> tuple[list[Change], dict[str, int], list[str]]:
    """What the board would change, what already agrees, and what cannot be written.

    Pure: it is given the board and the records and returns the work. A body that
    matches, an item that is present and a field that already holds the record's
    value are all counted as agreeing, so the report can say what is right and not
    only what is wrong.
    """
    changes: list[Change] = []
    agree: dict[str, int] = collections.Counter()
    warnings: list[str] = []
    for record in records:
        title = f"{record['id']} {SEP} {record['title']}"
        body = bodies[record["id"]]
        desired = desired_values(record, board.fields, board.options)
        issue = board.issues.get(title)
        if issue is None:
            # A missing issue means a missing item carrying no values: the record is
            # new to the board, so every field it states is written.
            changes.append(Change("issue", record["id"], line=f"create issue {title}"))
            changes.append(
                Change("item", record["id"], line=f"add item {record['id']}")
            )
            for field, value in desired.items():
                changes.append(
                    Change(
                        "field",
                        record["id"],
                        field,
                        value,
                        f"set {record['id']} {field}={value}",
                    )
                )
            continue
        if (issue.get("body") or "").rstrip("\n") != body.rstrip("\n"):
            changes.append(
                Change(
                    "body",
                    record["id"],
                    line=f"update body of #{issue['number']} {title}",
                )
            )
        else:
            agree["body"] += 1
        item = board.items.get(title)
        if item is None:
            changes.append(
                Change("item", record["id"], line=f"add item {record['id']}")
            )
            for field, value in desired.items():
                changes.append(
                    Change(
                        "field",
                        record["id"],
                        field,
                        value,
                        f"set {record['id']} {field}={value}",
                    )
                )
            continue
        agree["item"] += 1
        for field, value in desired.items():
            if item[field.lower()] == value:
                agree["field"] += 1
                continue
            if field != "Cards" and value not in board.options.get(field, {}):
                # The record carries a value the project has no option for. Writing
                # another option would be a claim; leaving it is a gap. Reported.
                warnings.append(
                    f"{record['id']}: {field} {value!r} has no option on the project"
                )
                continue
            changes.append(
                Change(
                    "field",
                    record["id"],
                    field,
                    value,
                    f"set {record['id']} {field}={value}",
                )
            )
    if readme == "differs":
        changes.append(
            Change(
                "readme",
                "",
                line="update the project README from Reference/project-README.md",
            )
        )
    elif readme == "unchanged":
        agree["readme"] += 1
    return changes, agree, warnings


def report_plan(
    records: list[dict],
    changes: list[Change],
    agree: dict[str, int],
    warnings: list[str],
    board: Board,
    readme: str,
) -> None:
    """The plan as a person reads it: what agrees, then one line per change."""
    total = len(records)
    print(f"\nissues on the repository: {len(board.issues)}")
    print(f"items on the project: {len(board.items)}")
    print(f"project readme: {readme}")
    for warning in warnings:
        print(f"  warn {warning}")
    print(
        f"already agrees: bodies {agree['body']}/{total}, "
        f"items {agree['item']}/{total}, fields {agree['field']}"
    )
    if not changes:
        print("\nplan: the board already agrees with the records; nothing to do")
        return
    counts = collections.Counter(change.phase for change in changes)
    summary = ", ".join(f"{phase} {counts[phase]}" for phase in PHASES if counts[phase])
    print(f"\nplan: {len(changes)} change(s) -> {summary}")
    for change in changes:
        print(f"  {change.phase:<6} {change.line}")


def write_bodies(work: Path, records: list[dict], bodies: dict[str, str]) -> Path:
    """The rendered bodies in the work directory: local, gitignored, not the board."""
    out = work / "bodies"
    out.mkdir(parents=True, exist_ok=True)
    for record in records:
        (out / f"{record['id']}.md").write_text(bodies[record["id"]], encoding="utf-8")
    return out


def cmd_plan(args) -> int:
    """Report what the board would have to change. No write call on this path."""
    root, work, records, slug = prepare(args)
    tool = relative_tool(root)
    bodies, leaks, unplaced = bodies_for(records, slug, args.branch, tool)
    if leaks:
        for record_id, hit in leaks:
            print(f"  LEAK {record_id}: {hit!r}")
        print(f"\nrefusing to plan: {len(leaks)} leak hit(s) in the rendered bodies")
        return 1
    if unplaced:
        print(f"records missing an axis: {len(unplaced)} -> {unplaced}")
    write_bodies(work, records, bodies)

    board = read_board(args, slug)
    absent = [name for name in FIELDS if name not in board.fields]
    if absent:
        print(f"  warn fields absent from the project: {absent}")
    readme, _rendered = readme_state(board.project, records)
    changes, agree, warnings = plan_board(board, records, bodies, readme)
    report_plan(records, changes, agree, warnings, board, readme)
    print("\nno write: this command reads the board, and `sync` is the only writer")
    return 1 if changes else 0


def cmd_sync(args) -> int:
    """The only writer: perform what `plan` reports, one printed line per mutation."""
    root, work, records, slug = prepare(args)
    tool = relative_tool(root)
    bodies, leaks, unplaced = bodies_for(records, slug, args.branch, tool)
    if leaks:
        for record_id, hit in leaks:
            print(f"  LEAK {record_id}: {hit!r}")
        print(f"\nrefusing to sync: {len(leaks)} leak hit(s) in the rendered bodies")
        return 1
    if unplaced:
        print(f"records missing an axis: {len(unplaced)} -> {unplaced}")

    board = read_board(args, slug)
    absent = [name for name in FIELDS if name not in board.fields]
    if absent:
        refuse(
            f"refusing to sync: the project is missing the field(s) {absent}; a copied "
            "project carries them, and this tool does not create fields"
        )
    readme, rendered = readme_state(board.project, records)
    changes, _agree, warnings = plan_board(board, records, bodies, readme)
    for warning in warnings:
        print(f"  warn {warning}")

    if not changes:
        print("the board already agrees with the records: nothing to sync")
        return 0

    # The gate. A board that holds items belongs to whoever put them there, so the
    # write is refused unless the caller names why it is justified. An empty board
    # is the initial sync: there is nothing of anyone else's to lose.
    if board.items and not args.reason:
        refuse(
            f"refusing to sync: the project holds {len(board.items)} item(s), so these "
            'writes would overwrite state other people own; pass --reason "<why>" if '
            "that is intended"
        )
    reason = args.reason or "the board is empty: this is the initial sync"
    allow_writes(reason)

    print(f"\nsync reason: {reason}")
    print(f"syncing {len(changes)} change(s)")
    out = write_bodies(work, records, bodies)
    return execute(board, changes, records, bodies, out, rendered, slug, args)


def field_literal(change: Change, record: dict, board: Board) -> str:
    """GraphQL input objects take unquoted keys, so each value is a literal."""
    if change.field == "RFC":
        if board.rfc_text:
            padded = f"{record['number']:04d}"
            return f"{{text: {json.dumps(padded)}}}"
        return f"{{number: {record['number']}}}"
    if change.field == "Cards":
        return f"{{text: {json.dumps(str(change.value))}}}"
    return "{singleSelectOptionId: " + json.dumps(
        board.options[change.field][str(change.value)]
    ) + "}"


def send_field_slice(aliases: list[str], start: int, failures: list[str]) -> bool:
    """One aliased mutation for a slice of records, retried while GitHub is flaky.

    A slice is four records because each contributes up to five aliases and about
    twenty is the ceiling before GitHub answers 502.
    """
    query = "mutation{" + " ".join(aliases) + "}"
    for attempt in range(4):
        try:
            graphql(query)
            return True
        except SystemExit as error:
            if attempt == 3:
                failures.append(f"field slice at {start}: {error}")
                print(f"  FAIL field slice at {start}: {error}")
                return False
            time.sleep(2 * (attempt + 1))
    return False


def execute(
    board: Board,
    changes: list[Change],
    records: list[dict],
    bodies: dict[str, str],
    out: Path,
    rendered: str,
    slug: str,
    args,
) -> int:
    """Perform the plan, printing one line per mutation it makes."""
    by_id = {record["id"]: record for record in records}
    phase: dict[str, list[Change]] = collections.defaultdict(list)
    for change in changes:
        phase[change.phase].append(change)
    failures: list[str] = []
    made: dict[str, int] = collections.Counter()

    # 1 - issues. A create comes first, because the item needs the issue's number.
    for change in phase["issue"]:
        record = by_id[change.record]
        title = f"{record['id']} {SEP} {record['title']}"
        proc = gh(
            "issue",
            "create",
            "--repo",
            slug,
            "--title",
            title,
            "--body-file",
            str(out / f"{record['id']}.md"),
            write=f"create issue {title}",
        )
        if proc.returncode != 0:
            failures.append(f"create {title}: {proc.stderr.strip()[:200]}")
            print(f"  FAIL create {title}")
            continue
        # gh 2.102.1 has no --json on `issue create`; it prints the issue URL.
        url = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else ""
        match = re.search(r"/issues/(\d+)$", url)
        if not match:
            failures.append(f"create {title}: unparsable output {proc.stdout!r}")
            print(f"  FAIL create {title}: unparsable output")
            continue
        board.issues[title] = {
            "number": int(match.group(1)),
            "title": title,
            "body": bodies[record["id"]],
        }
        made["issue"] += 1
        print(f"  create #{board.issues[title]['number']} {title}")
        time.sleep(1.0)

    # 2 - the bodies that drifted from their record.
    for change in phase["body"]:
        record = by_id[change.record]
        title = f"{record['id']} {SEP} {record['title']}"
        issue = board.issues.get(title)
        if issue is None:
            failures.append(f"no issue for {title}")
            print(f"  FAIL refresh {title}: no issue")
            continue
        proc = gh(
            "issue",
            "edit",
            str(issue["number"]),
            "--repo",
            slug,
            "--body-file",
            str(out / f"{record['id']}.md"),
            write=f"edit issue #{issue['number']}",
        )
        if proc.returncode != 0:
            failures.append(f"refresh #{issue['number']}: {proc.stderr.strip()[:200]}")
            print(f"  FAIL refresh #{issue['number']} {title}")
            continue
        made["body"] += 1
        print(f"  body   #{issue['number']} {title}")

    # 3 - items. One process per item, so the adds run in a small pool; `map` yields
    # in the plan's order, which is the order the lines are printed in.
    def add(change: Change) -> tuple[Change, str, str]:
        record = by_id[change.record]
        title = f"{record['id']} {SEP} {record['title']}"
        number = board.issues.get(title, {}).get("number")
        if number is None:
            return change, "", "no issue to add"
        proc = gh(
            "project",
            "item-add",
            str(args.project),
            "--owner",
            args.owner,
            "--url",
            f"https://github.com/{slug}/issues/{number}",
            "--format",
            "json",
            write=f"add item for {title}",
        )
        if proc.returncode != 0:
            return change, "", proc.stderr.strip()[:200]
        try:
            return change, parse_json(proc.stdout, "gh project item-add")["id"], ""
        except (SystemExit, KeyError) as error:
            return change, "", str(error)

    if phase["item"]:
        with ThreadPoolExecutor(max_workers=ADD_WORKERS) as pool:
            for change, item_id, failure in pool.map(add, phase["item"]):
                record = by_id[change.record]
                title = f"{record['id']} {SEP} {record['title']}"
                if not item_id:
                    failures.append(f"add {title}: {failure}")
                    print(f"  FAIL add {title}")
                    continue
                # A new item carries no values yet, so every field is written.
                board.items[title] = {
                    "id": item_id,
                    "rfc": None,
                    "kind": None,
                    "status": None,
                    "subject": None,
                    "horizon": None,
                    "cards": None,
                }
                made["item"] += 1
                print(f"  item   {record['id']} -> {item_id}")

    # 4 - field values. The requests are aliased four records to a slice; the report
    # is one line per value, because a value is what a person approved.
    grouped: dict[str, list[Change]] = {}
    for change in phase["field"]:
        grouped.setdefault(change.record, []).append(change)
    order = [record["id"] for record in records if record["id"] in grouped]
    for start in range(0, len(order), SLICE):
        chunk = order[start : start + SLICE]
        aliases: list[str] = []
        lines: list[str] = []
        for position, record_id in enumerate(chunk):
            record = by_id[record_id]
            title = f"{record['id']} {SEP} {record['title']}"
            item = board.items.get(title)
            if item is None:
                failures.append(f"no project item for {title}")
                print(f"  FAIL no project item for {title}")
                continue
            for change in grouped[record_id]:
                aliases.append(
                    f"f{position}_{change.field}: updateProjectV2ItemFieldValue(input:{{"
                    f"projectId: {json.dumps(board.project)}, "
                    f"itemId: {json.dumps(item['id'])}, "
                    f"fieldId: {json.dumps(board.ids[change.field])}, "
                    f"value: {field_literal(change, record, board)}}})"
                    "{projectV2Item{id}}"
                )
                lines.append(change.line)
        if not aliases:
            continue
        if send_field_slice(aliases, start, failures):
            for line in lines:
                print(f"  field  {line}")
            made["field"] += len(lines)

    # 5 - the project README, when it is not the rendered source.
    readme_status = "unchanged"
    if phase["readme"]:
        readme_status, readme_failures = update_readme(board.project, rendered)
        failures.extend(readme_failures)
        print(f"  readme {readme_status}")

    print(
        f"\ncreated={made['issue']} bodies_refreshed={made['body']} "
        f"items_added={made['item']} fields_written={made['field']} "
        f"readme={readme_status} failures={len(failures)} records={len(records)}"
    )
    return 1 if failures else 0


def cmd_verify(args) -> int:
    """An independent read of the published board. Writes nothing."""
    root, work, records, slug = prepare(args)
    tool = relative_tool(root)
    failures: list[str] = []

    # 1 - the CLI's own count against the committed corpus.
    listing = gh_json(
        "project",
        "item-list",
        str(args.project),
        "--owner",
        args.owner,
        "--limit",
        str(args.limit),
        "--format",
        "json",
    )
    board_count = len(listing.get("items") or [])
    print(f"\n[1] committed records: {len(records)}   board items: {board_count}")
    if board_count != len(records):
        failures.append(
            f"board holds {board_count} items, corpus holds {len(records)} committed records"
        )

    # 2 - field values on every item.
    project = project_id(args.owner, args.project)
    items: list[dict] = []
    cursor = None
    while True:
        page = items_page(project, cursor)
        items.extend(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            break
        cursor = page["pageInfo"]["endCursor"]
    print(f"[2] graphql items: {len(items)}")

    titled = [item for item in items if (item.get("content") or {}).get("title")]
    for item in titled:
        item["rfc"] = rfc_number(item.get("rfc"))

    for label, key in (
        ("RFC", "rfc"),
        ("Status", "status"),
        *((axis, axis.lower()) for axis, _ in AXES),
    ):
        missing = [item["content"]["title"] for item in titled if not item.get(key)]
        print(f"    without {label}: {len(missing)}")
        if missing:
            failures.append(f"{len(missing)} items lack {label}: {missing[:3]}")

    on_board = sorted(item["rfc"] for item in titled if item.get("rfc"))
    expected = sorted(record["number"] for record in records)
    print(
        f"    RFC numbers: {len(on_board)} present, unique {len(set(on_board))}, "
        f"expected {len(expected)}"
    )
    if on_board != expected:
        extra = sorted(set(on_board) - set(expected))
        absent = sorted(set(expected) - set(on_board))
        failures.append(
            f"board RFC numbers differ from the corpus: extra {extra} absent {absent}"
        )

    for axis, _ in AXES:
        key = axis.lower()
        counts = collections.Counter(
            item[key]["name"] for item in titled if item.get(key)
        )
        print(f"    {axis} on the board: {json.dumps(dict(sorted(counts.items())))}")

    # 2b - every item's axes equal its record's. This is what the three header
    # fields are for: the board is derived from the files, so a disagreement is a
    # stale projection and not a second opinion.
    by_number = {record["number"]: record for record in records}
    disagreements: list[str] = []
    for item in titled:
        record = by_number.get(item["rfc"]) if item.get("rfc") else None
        if record is None:
            continue
        for axis, _ in AXES:
            on_item = (item.get(axis.lower()) or {}).get("name")
            in_file = record[axis.lower()]
            if on_item != in_file:
                disagreements.append(
                    f"RFC-{record['number']:04d} {axis}: board {on_item!r} file {in_file!r}"
                )
    print(f"    items whose axes disagree with their record: {len(disagreements)}")
    for line in disagreements[:5]:
        print(f"    {line}")
    if disagreements:
        failures.append(
            f"{len(disagreements)} board value(s) disagree with the record: {disagreements[:3]}"
        )

    # 3 - the fields, their data types and their options.
    fields = project_fields(project)
    names = list(fields)
    print(f"[3] fields: {len(names)} -> {names}")
    absent_fields = [name for name in FIELDS if name not in names]
    if absent_fields:
        failures.append(f"fields absent: {absent_fields}")
    for name in ("RFC", "Cards", "Status", *[axis for axis, _ in AXES]):
        if name in fields:
            options = [option["name"] for option in fields[name].get("options", [])]
            print(
                f"    {name}: {fields[name].get('dataType')}"
                + (f" -> {options}" if options else "")
            )

    # 4 - the views, and the step no API can take.
    views = graphql(
        "query($p:ID!){node(id:$p){... on ProjectV2{views(first:10){nodes{name layout}}}}}",
        {"p": project},
    )["node"]["views"]["nodes"]
    print(f"[4] views: {json.dumps(views, ensure_ascii=False)}")
    if len(views) < 3:
        failures.append(f"only {len(views)} views")
    print(
        "    group-by is a manual interface step: no input object on the GraphQL schema "
        "accepts groupBy or sortBy"
    )

    # 5 - one record end to end: file -> issue -> project item.
    probe = records[0]["id"] if records else "RFC-0009"
    record = next((entry for entry in records if entry["id"] == probe), None)
    item = next(
        (entry for entry in titled if entry["content"]["title"].startswith(probe)), None
    )
    file_status = record["status"] if record else ""
    print(f"[5] {probe}: file says Status={file_status!r}")
    if item is None:
        failures.append(f"{probe}: no project item found")
        print("    NO ITEM on the project")
    else:
        print(f"    issue #{item['content']['number']} {item['content']['url']}")
        print(
            f"    board says Status={item['status']['name'] if item['status'] else None!r} "
            + " ".join(
                f"{axis}={item[axis.lower()]['name'] if item.get(axis.lower()) else None!r}"
                for axis, _ in AXES
            )
            + f" RFC={item['rfc']}"
        )
        if not item["status"] or item["status"]["name"] != file_status:
            failures.append(f"{probe}: board status != file status {file_status}")
        if record is None:
            failures.append(f"{probe}: the item has no committed record")
        else:
            for axis, _ in AXES:
                on_item = (item.get(axis.lower()) or {}).get("name")
                if on_item != record[axis.lower()]:
                    failures.append(
                        f"{probe}: board {axis} {on_item!r} != file {record[axis.lower()]!r}"
                    )

    # 6 - leak sweep and verbatim decision text over the published bodies.
    bodies, leaks, _ = bodies_for(records, slug, args.branch, tool)
    published = issue_index(slug, args.limit, with_body=True)
    hits = [
        (issue["number"], match.group(0))
        for issue in published.values()
        for match in LEAK.finditer(issue.get("body") or "")
    ]
    print(f"[6] leak sweep over {len(published)} published bodies: {len(hits)} hits")
    for number, hit in hits[:10]:
        print(f"    #{number}: {hit!r}")
    if hits:
        failures.append(f"leak sweep found {len(hits)} hits")
    if leaks:
        failures.append(f"{len(leaks)} leak hit(s) in the rendered bodies")

    drifted = [
        record["id"]
        for record in records
        if (
            published.get(f"{record['id']} {SEP} {record['title']}", {}).get("body")
            or ""
        ).rstrip("\n")
        != bodies[record["id"]].rstrip("\n")
    ]
    print(
        f"    bodies in sync with their record: {len(records) - len(drifted)}/{len(records)}"
    )
    if drifted:
        failures.append(f"bodies drifted from the record: {drifted[:5]}")

    expected_titles = {f"{record['id']} {SEP} {record['title']}" for record in records}
    extra = sorted(
        title
        for title in published
        if re.match(r"^RFC-\d{4}\b", title) and title not in expected_titles
    )
    if extra:
        print(
            f"    warn {len(extra)} RFC issue(s) on the repository have no committed record: "
            f"{extra[:3]}"
        )

    print("\n=== VERDICT ===")
    if failures:
        for failure in failures:
            print(f"FAIL {failure}")
        return 1
    print("all checks passed")
    return 0


def build_parser() -> argparse.ArgumentParser:
    """The command surface: the read commands and the one writer, listed apart."""
    parser = argparse.ArgumentParser(
        prog="rfc_board.py",
        description=(
            "Compare the RFC project board with the committed record files. The board is "
            "shared state, so a run reads and reports; only `sync` writes it."
        ),
        epilog=(
            "read commands - no write call on any of them:\n"
            "  plan    (the default) what the board would create, update, or already agrees with\n"
            "  render  the issue bodies, into the work directory\n"
            "  verify  the published board, read independently\n"
            "  readme  whether the project README matches its source\n"
            "\n"
            "the one writer:\n"
            "  sync    perform what plan reports; refuses on a board that holds items unless\n"
            "          --reason names why the write is justified\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--owner", default=DEFAULT_OWNER, help="project and repository owner"
    )
    common.add_argument("--repo", default=DEFAULT_REPO, help="repository name")
    common.add_argument(
        "--project", type=int, default=DEFAULT_PROJECT, help="project number"
    )
    common.add_argument(
        "--branch", default=DEFAULT_BRANCH, help="branch the source link points at"
    )
    common.add_argument(
        "--work",
        default=None,
        help="work directory (default Maintain/Storage/RFC-Board)",
    )
    common.add_argument(
        "--limit",
        type=int,
        default=500,
        help="issue and item page cap (default 500; raise it when the corpus outgrows it)",
    )

    commands = parser.add_subparsers(dest="command", metavar="command")
    commands.add_parser(
        "plan",
        parents=[common],
        help="report what the board would change (the default)",
        description=(
            "Compare the committed records with the board and report what it would create, "
            "what it would update and what already agrees. No write call on this path: exit 0 "
            "when the board agrees, 1 when it does not."
        ),
    )
    commands.add_parser(
        "render",
        parents=[common],
        help="write one issue body per record into the work directory",
        description=(
            "Render every committed record's issue body into the work directory, leak-scan it "
            "and prove each Decision section survived the round trip. Touches nothing remote."
        ),
    )
    commands.add_parser(
        "verify",
        parents=[common],
        help="read the published board back and exit non-zero on a disagreement",
        description=(
            "Read the published project independently of the plan and exit non-zero on the "
            "first disagreement. Reads only."
        ),
    )
    commands.add_parser(
        "readme",
        parents=[common],
        help="report whether the project README matches its source",
        description=(
            "Report whether the project's README is the rendered "
            "`Reference/project-README.md`. Reads only."
        ),
    )
    sync = commands.add_parser(
        "sync",
        parents=[common],
        help="write the board: perform what plan reports",
        description=(
            "The only writer. Perform what `plan` reports - create the missing issues, update "
            "the drifted bodies, add the missing items, set the field values that disagree and "
            "update the README - printing one line per mutation."
        ),
        epilog=(
            "Precondition: this refuses to run when the project holds items unless --reason "
            "names why the write is justified. An empty board is the initial sync and needs no "
            "reason, because there is nothing of anyone else's to lose. Fields are never "
            "created here: a copied project carries them."
        ),
    )
    sync.add_argument(
        "--reason",
        default="",
        help="why writing over a populated board is justified",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    # The old name gets one sentence rather than a screen of usage text, and it is
    # not in the command list: a name that cannot write has no place there.
    if argv and argv[0] == "publish":
        refuse(
            "publish is gone: this tool reads the board by default, so `plan` reports and "
            '`sync --reason "<why>"` writes; nothing was written'
        )
    # A bare run, or flags with no command, is the read path. Help is not: it has to
    # reach the top-level parser or the command list is unreachable.
    if not argv or (argv[0].startswith("--") and argv[0] not in ("-h", "--help")):
        argv.insert(0, "plan")
    args = build_parser().parse_args(argv)
    command = {
        "plan": cmd_plan,
        "render": cmd_render,
        "verify": cmd_verify,
        "readme": cmd_readme,
        "sync": cmd_sync,
    }[args.command]
    return command(args)


if __name__ == "__main__":
    sys.exit(main())
