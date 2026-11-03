#!/usr/bin/env python3
# Archived tool: rfc_board.py
#
# What it does: Assemble the RFC project board from the committed record files: render one body per record, create and refresh the issues, add them to the project, write the five field values and verify the result.
# Kept here so a later session reuses it instead of rewriting it.
# Run it from the repository root; it reads the paths it names and nothing else.
# Archived: 2026-11-03 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
"""Assemble the RFC project board from the records in `Documentation/RFC/proposed/`.

One direction of flow: the record file is authoritative, the issue follows it, the
project item follows the issue. Nothing here writes back into a record.

  render   read every committed record, write one issue body per record into the
           work directory, leak-scan the bodies and prove each Decision section
           survived the round trip byte for byte. Touches nothing remote.
  publish  create the issues that are missing, refresh the bodies that drifted,
           add the issues to the project and write the five field values.
           Idempotent: a second run creates nothing and rewrites nothing.
  verify   an independent read of the published project - counts, field values,
           views, one file-to-board trace, a leak sweep - and an exit code.

Only committed records are published. `git ls-files Documentation/RFC/proposed` is
the list; a record still untracked is somebody's work in progress, so it is
reported as skipped and never published half-written. Commit the record, run
`publish` again, and the delta lands.

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
CLASS_OPTIONS = ("architecture", "product", "policy", "governance", "methodology")
AREA_OPTIONS = ("site", "network", "identity", "tooling", "governance")
FIELDS = ("RFC", "Status", "Class", "Area", "Cards")

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

HEADER_FIELD = re.compile(
    r"\*\*(Status|Date|Owner|Applies to|Decision class|Supersedes|Superseded by|"
    r"Task dependencies):\*\*"
)
H1 = re.compile(r"^# (RFC-\d{4})[ \t]+[-\u2014][ \t]+(.+)$")
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
          class: fieldValueByName(name: "Class") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          status: fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          area: fieldValueByName(name: "Area") {
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


def committed_files(root: Path) -> list[str]:
    out = git(root, "ls-files", "-z", "--", PROPOSED)
    return sorted(name for name in out.split("\0") if name.endswith(".md"))


def untracked_files(root: Path) -> list[str]:
    out = git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", PROPOSED)
    return sorted(name for name in out.split("\0") if name.endswith(".md"))


def split_header(text: str) -> tuple[str, str]:
    """Return (header block, remainder). The header is everything before `## `."""
    index = text.find("\n## ")
    if index == -1:
        raise RecordError("no section heading found")
    return text[:index], text[index:]


def parse_header(block: str) -> dict[str, str]:
    """Header fields wrap across lines, so the block is flattened first."""
    flat = re.sub(r"\s+", " ", block).strip()
    matches = list(HEADER_FIELD.finditer(flat))
    fields: dict[str, str] = {}
    for position, match in enumerate(matches):
        start = match.end()
        end = (
            matches[position + 1].start() if position + 1 < len(matches) else len(flat)
        )
        fields[match.group(1)] = flat[start:end].strip()
    return fields


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


def parse_record(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    first = text.splitlines()[0] if text else ""
    match = H1.match(first)
    if not match:
        raise RecordError(f"unexpected H1 {first!r}")
    header_block, body = split_header(text)
    fields = parse_header(header_block)
    decision = section(body, "Decision")
    return {
        "number": int(match.group(1).split("-")[1]),
        "id": match.group(1),
        "title": match.group(2).strip(),
        "path": path.as_posix(),
        "status": fields.get("Status", "").split()[0] if fields.get("Status") else "",
        "date": fields.get("Date", ""),
        "decision_class": fields.get("Decision class", "").split()[0]
        if fields.get("Decision class")
        else "",
        "task_dependencies": fields.get("Task dependencies", ""),
        "applies_to": fields.get("Applies to", ""),
        "supersedes": fields.get("Supersedes", ""),
        "superseded_by": fields.get("Superseded by", ""),
        "decision": decision,
        "verification": section(body, "Verification"),
        "open_questions": section(body, "Open questions", required=False),
    }


def load(root: Path) -> tuple[list[dict], list[str], list[tuple[str, str]], list[str]]:
    """Every committed record, plus what was skipped and what could not be read."""
    skipped = untracked_files(root)
    records: list[dict] = []
    errors: list[tuple[str, str]] = []
    for name in committed_files(root):
        try:
            record = parse_record(root / name)
        except RecordError as error:
            errors.append((name, str(error)))
            continue
        record["path"] = name
        records.append(record)

    warnings: list[str] = []
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
        if record["decision_class"] not in CLASS_OPTIONS:
            warnings.append(
                f"{record['id']}: Decision class {record['decision_class']!r} "
                f"is not one of {CLASS_OPTIONS}"
            )
    records.sort(key=lambda record: record["number"])
    return records, skipped, errors, warnings


def areas_of(root: Path, work: Path) -> dict[str, str]:
    """The record-to-Area map, read from the skill tree and then from the work dir."""
    candidates = [
        Path(__file__).resolve().parent / "area.json",
        root / "Documentation" / "Skill" / "RFC-Board" / "Reference" / "area.json",
        work / "area.json",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return json.loads(candidate.read_text(encoding="utf-8"))
    raise SystemExit(
        f"no area.json beside the tool; looked in {[str(c) for c in candidates]}"
    )


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
    classes = collections.Counter(record["decision_class"] for record in records)
    statuses = collections.Counter(record["status"] for record in records)
    print(f"classes: {json.dumps(dict(sorted(classes.items())))}")
    print(f"statuses: {json.dumps(dict(sorted(statuses.items())))}")


# --------------------------------------------------------------------------- #
# Bodies
# --------------------------------------------------------------------------- #


def render_body(record: dict, area: str, slug: str, branch: str, tool: str) -> str:
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
        f"**Class:** {record['decision_class']}  ",
        f"**Area:** {area}  ",
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
        f"<sub>Assembled from the record by `{tool}`, which creates the issue, adds it "
        "to the project and writes its fields; the decision text above is the record's "
        "own section, copied verbatim. The issue is rebuilt from the file whenever the "
        "file changes, and never carries a summary.</sub>",
    ]
    return "\n".join(parts).rstrip() + "\n"


def bodies_for(
    records, areas, slug, branch, tool
) -> tuple[dict[str, str], list[tuple[str, str]], list[str]]:
    bodies: dict[str, str] = {}
    leaks: list[tuple[str, str]] = []
    unplaced: list[str] = []
    for record in records:
        area = areas.get(record["id"], "")
        if not area:
            unplaced.append(record["id"])
        body = render_body(record, area or "unplaced", slug, branch, tool)
        bodies[record["id"]] = body
        for match in LEAK.finditer(body):
            leaks.append((record["id"], match.group(0)))
    return bodies, leaks, unplaced


# --------------------------------------------------------------------------- #
# GitHub
# --------------------------------------------------------------------------- #


def gh(*args: str, stdin: str | None = None) -> subprocess.CompletedProcess:
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
            return json.loads(proc.stdout)
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
    proc = gh(
        "api",
        "graphql",
        "--input",
        "-",
        stdin=json.dumps({"query": query, "variables": variables or {}}),
    )
    if proc.returncode != 0:
        raise SystemExit(f"gh api graphql failed: {proc.stderr.strip()}")
    payload = json.loads(proc.stdout)
    if payload.get("errors"):
        raise SystemExit(f"graphql errors: {json.dumps(payload['errors'])[:800]}")
    return payload["data"]


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
    nodes = graphql(FIELDS_QUERY, {"p": project})["node"]["fields"]["nodes"]
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


def item_index(project: str) -> dict[str, dict]:
    """Title -> the item's id and the field values it already carries.

    The values are read as well as the ids, so a re-run can leave a field that
    already agrees with the record alone instead of rewriting every value on
    every run.
    """
    items: dict[str, dict] = {}
    cursor = None
    while True:
        page = graphql(ITEMS_QUERY, {"p": project, "after": cursor})["node"]["items"]
        for node in page["nodes"]:
            content = node.get("content") or {}
            if not content.get("title"):
                continue
            items[content["title"]] = {
                "id": node["id"],
                "rfc": rfc_number(node.get("rfc")),
                "class": (node.get("class") or {}).get("name"),
                "status": (node.get("status") or {}).get("name"),
                "area": (node.get("area") or {}).get("name"),
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


def sync_readme(
    project: str, records: list[dict], dry_run: bool
) -> tuple[str, list[str]]:
    """Make the project's README the rendered source, or leave it alone."""
    rendered = rendered_readme(records)
    if rendered is None:
        return "no source file", []
    if stored_readme(project).rstrip("\n") == rendered.rstrip("\n"):
        return "unchanged", []
    if dry_run:
        return f"would update ({len(rendered)} chars)", []
    data = graphql(
        "mutation($p: ID!, $r: String!){updateProjectV2(input:{projectId: $p, readme: $r})"
        "{projectV2{readme}}}",
        {"p": project, "r": rendered},
    )
    stored = (data.get("updateProjectV2") or {}).get("projectV2", {}).get(
        "readme"
    ) or ""
    if stored.rstrip("\n") != rendered.rstrip("\n"):
        return "updated, but the stored text differs", [
            f"readme round trip differs: stored {len(stored)} chars against rendered {len(rendered)}"
        ]
    return f"updated ({len(rendered)} chars)", []


def cmd_readme(args) -> int:
    root, work, records, areas, slug = prepare(args)
    project = project_id(args.owner, args.project)
    status, failures = sync_readme(project, records, args.dry_run)
    print(f"project readme: {status}")
    for failure in failures:
        print(f"FAIL {failure}")
    return 1 if failures else 0


def prepare(args) -> tuple[Path, Path, list[dict], dict[str, str], str]:
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
            f"{len(errors)} committed record(s) could not be read; nothing published"
        )
    areas = areas_of(root, work)
    (work / "records.json").write_text(
        json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return root, work, records, areas, f"{args.owner}/{args.repo}"


def cmd_render(args) -> int:
    root, work, records, areas, slug = prepare(args)
    tool = relative_tool(root)
    bodies, leaks, unplaced = bodies_for(records, areas, slug, args.branch, tool)
    out = work / "bodies"
    out.mkdir(parents=True, exist_ok=True)
    for record in records:
        (out / f"{record['id']}.md").write_text(bodies[record["id"]], encoding="utf-8")

    print(f"\nbodies written: {len(bodies)} -> {out}")
    print(f"leak hits: {len(leaks)}")
    for record_id, hit in leaks:
        print(f"  LEAK {record_id}: {hit!r}")
    if unplaced:
        print(f"records with no Area in area.json: {len(unplaced)} -> {unplaced}")

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


def cmd_publish(args) -> int:
    root, work, records, areas, slug = prepare(args)
    tool = relative_tool(root)
    bodies, leaks, unplaced = bodies_for(records, areas, slug, args.branch, tool)
    if leaks:
        for record_id, hit in leaks:
            print(f"  LEAK {record_id}: {hit!r}")
        print(f"\nrefusing to publish: {len(leaks)} leak hit(s) in the rendered bodies")
        return 1

    out = work / "bodies"
    out.mkdir(parents=True, exist_ok=True)
    for record in records:
        (out / f"{record['id']}.md").write_text(bodies[record["id"]], encoding="utf-8")

    project = project_id(args.owner, args.project)
    fields = project_fields(project)
    missing_fields = [name for name in FIELDS if name not in fields]
    if missing_fields:
        print(f"  warn fields absent from the project: {missing_fields}")
    rfc_text = fields.get("RFC", {}).get("dataType") == "TEXT"
    options = {
        "Status": option_id(fields, "Status", "Proposed"),
        "Class": {
            name: option_id(fields, "Class", name)
            for name in CLASS_OPTIONS
            if name in [o["name"] for o in fields.get("Class", {}).get("options", [])]
        },
        "Area": {
            name: option_id(fields, "Area", name)
            for name in AREA_OPTIONS
            if name in [o["name"] for o in fields.get("Area", {}).get("options", [])]
        },
    }
    ids = {name: fields[name]["id"] for name in FIELDS if name in fields}

    issues = issue_index(slug, args.limit, with_body=True)
    print(f"issues on {slug}: {len(issues)}")

    created = refreshed = attached = 0
    failures: list[str] = []
    for record in records:
        title = f"{record['id']} {SEP} {record['title']}"
        issue = issues.get(title)
        body_file = out / f"{record['id']}.md"
        if issue is None:
            if args.dry_run:
                print(f"  would create {title}")
                created += 1
                continue
            proc = gh(
                "issue",
                "create",
                "--repo",
                slug,
                "--title",
                title,
                "--body-file",
                str(body_file),
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
                continue
            issue = {
                "number": int(match.group(1)),
                "title": title,
                "body": bodies[record["id"]],
            }
            issues[title] = issue
            created += 1
            print(f"  create #{issue['number']} {title}")
            time.sleep(1.0)
            continue
        if (issue.get("body") or "").rstrip("\n") != bodies[record["id"]].rstrip("\n"):
            if args.dry_run:
                print(f"  would refresh body of #{issue['number']} {title}")
                refreshed += 1
                continue
            proc = gh(
                "issue",
                "edit",
                str(issue["number"]),
                "--repo",
                slug,
                "--body-file",
                str(body_file),
            )
            if proc.returncode != 0:
                failures.append(
                    f"refresh #{issue['number']}: {proc.stderr.strip()[:200]}"
                )
                print(f"  FAIL refresh #{issue['number']}")
                continue
            refreshed += 1
            print(f"  refresh body of #{issue['number']} {title}")

    items = item_index(project)
    print(f"items on the project: {len(items)}")
    todo = [(record, f"{record['id']} {SEP} {record['title']}") for record in records]
    pending = [(record, title) for record, title in todo if title not in items]
    print(f"issues needing an item: {len(pending)}")

    def add(entry: tuple[dict, str]) -> tuple[str, str]:
        record, title = entry
        number = issues.get(title, {}).get("number")
        if number is None:
            return title, ""
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
        )
        if proc.returncode != 0:
            return title, ""
        return title, json.loads(proc.stdout)["id"]

    if pending and not args.dry_run:
        with ThreadPoolExecutor(max_workers=ADD_WORKERS) as pool:
            for title, item_id in pool.map(add, pending):
                if item_id:
                    # A new item carries no values yet, so every field is written.
                    items[title] = {
                        "id": item_id,
                        "rfc": None,
                        "class": None,
                        "status": None,
                        "area": None,
                        "cards": None,
                    }
                    attached += 1
                else:
                    failures.append(f"add {title}")
                    print(f"  FAIL add {title}")
    elif pending:
        for _, title in pending:
            print(f"  would add {title}")
        attached = len(pending)

    def value_of(field: str, record: dict) -> str:
        """GraphQL input objects take unquoted keys, so each value is a literal."""
        if field == "RFC":
            if rfc_text:
                padded = f"{record['number']:04d}"
                return f"{{text: {json.dumps(padded)}}}"
            return f"{{number: {record['number']}}}"
        if field == "Status":
            return f"{{singleSelectOptionId: {json.dumps(options['Status'])}}}"
        if field == "Class":
            return f"{{singleSelectOptionId: {json.dumps(options['Class'][record['decision_class']])}}}"
        if field == "Area":
            return f"{{singleSelectOptionId: {json.dumps(options['Area'][areas[record['id']]])}}}"
        raise AssertionError(field)

    slices = 0
    written = 0
    unchanged = 0
    for start in range(0, len(todo), SLICE):
        chunk = todo[start : start + SLICE]
        aliases: list[str] = []
        for position, (record, title) in enumerate(chunk):
            current = items.get(title)
            if current is None:
                failures.append(f"no project item for {title}")
                continue
            item_id = current["id"]
            area = areas.get(record["id"], "")
            desired: dict[str, object] = {"RFC": record["number"], "Status": "Proposed"}
            if record["decision_class"] in options["Class"]:
                desired["Class"] = record["decision_class"]
            if area in options["Area"]:
                desired["Area"] = area
            cards = cards_of(record)
            if cards and "Cards" in ids:
                desired["Cards"] = ", ".join(cards)
            for field, value in desired.items():
                if current[field.lower()] == value:
                    unchanged += 1
                    continue
                if field == "Cards":
                    literal = f"{{text: {json.dumps(value)}}}"
                else:
                    literal = value_of(field, record)
                aliases.append(
                    f"f{position}_{field}: updateProjectV2ItemFieldValue(input:{{"
                    f"projectId: {json.dumps(project)}, itemId: {json.dumps(item_id)}, "
                    f"fieldId: {json.dumps(ids[field])}, value: {literal}}})"
                    "{projectV2Item{id}}"
                )
                written += 1
        if not aliases:
            continue
        if args.dry_run:
            print(
                f"  would set {len(aliases)} field value(s) for records "
                f"{start + 1}-{start + len(chunk)}"
            )
            slices += 1
            continue
        query = "mutation{" + " ".join(aliases) + "}"
        for attempt in range(4):
            try:
                graphql(query)
                slices += 1
                print(
                    f"  fields set for records {start + 1}-{start + len(chunk)}"
                    + (f" (attempt {attempt + 1})" if attempt else "")
                )
                break
            except SystemExit as error:
                if attempt == 3:
                    failures.append(f"field slice at {start}: {error}")
                    print(f"  FAIL field slice at {start}: {error}")
                else:
                    time.sleep(2 * (attempt + 1))

    readme_status, readme_failures = sync_readme(project, records, args.dry_run)
    failures.extend(readme_failures)

    print(
        f"\ncreated={created} bodies_refreshed={refreshed} items_added={attached} "
        f"fields_written={written} fields_unchanged={unchanged} field_slices={slices} "
        f"readme={readme_status} failures={len(failures)} records={len(records)}"
        + ("  (dry run: nothing written)" if args.dry_run else "")
    )
    return 1 if failures else 0


def cmd_verify(args) -> int:
    root, work, records, areas, slug = prepare(args)
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
    board_count = len(listing["items"])
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
        page = graphql(ITEMS_QUERY, {"p": project, "after": cursor})["node"]["items"]
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
        ("Class", "class"),
        ("Status", "status"),
        ("Area", "area"),
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

    classes = collections.Counter(
        item["class"]["name"] for item in titled if item.get("class")
    )
    print(f"    classes on the board: {json.dumps(dict(sorted(classes.items())))}")

    # 3 - the five fields, their data types and their options.
    fields = project_fields(project)
    names = list(fields)
    print(f"[3] fields: {len(names)} -> {names}")
    absent_fields = [name for name in FIELDS if name not in names]
    if absent_fields:
        failures.append(f"fields absent: {absent_fields}")
    for name in ("RFC", "Cards", "Status", "Class", "Area"):
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
            f"Class={item['class']['name'] if item['class'] else None!r} "
            f"Area={item['area']['name'] if item['area'] else None!r} "
            f"RFC={item['rfc']}"
        )
        if not item["status"] or item["status"]["name"] != file_status:
            failures.append(f"{probe}: board status != file status {file_status}")

    # 6 - leak sweep and verbatim decision text over the published bodies.
    bodies, leaks, _ = bodies_for(records, areas, slug, args.branch, tool)
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Assemble and verify the RFC project board from the record files."
    )
    parser.add_argument("command", choices=("render", "publish", "verify", "readme"))
    parser.add_argument(
        "--owner", default=DEFAULT_OWNER, help="project and repository owner"
    )
    parser.add_argument("--repo", default=DEFAULT_REPO, help="repository name")
    parser.add_argument(
        "--project", type=int, default=DEFAULT_PROJECT, help="project number"
    )
    parser.add_argument(
        "--branch", default=DEFAULT_BRANCH, help="branch the source link points at"
    )
    parser.add_argument(
        "--work",
        default=None,
        help="work directory (default Maintain/Storage/RFC-Board)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=500,
        help="issue and item page cap (default 500; raise it when the corpus outgrows it)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="publish: report, write nothing"
    )
    args = parser.parse_args(argv)
    command = {
        "render": cmd_render,
        "publish": cmd_publish,
        "verify": cmd_verify,
        "readme": cmd_readme,
    }[args.command]
    return command(args)


if __name__ == "__main__":
    sys.exit(main())
