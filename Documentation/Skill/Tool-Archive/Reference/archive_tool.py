#!/usr/bin/env python3
"""Archive a working script into `Documentation/Skill/<Skill>/Reference/`.

A script written during a session lives in a scratch directory that is pruned,
and the next session pays to write it again. This tool is the way out: it copies
one file into the skill that owns it, stamps it with what it is for, and records
it in that skill's index so a later reader finds it without opening the
directory.

The repository is public and account-agnostic, so the copy is scrubbed on the way
in: a home directory, an absolute path under it, or one person's own name never
reaches a tracked file. A reference file is read by whoever clones this tree, and
a path to one machine is not an instruction they can follow.

Usage
-----
    archive_tool.py --skill Figma-MCP --file ./cdp-page.js \\
        --as cdp-page.js --summary "Navigate a URL in a background CDP tab and dump anchors."

    archive_tool.py --skill Tool-Archive --file ./probe.py --summary "..." --dry-run

    archive_tool.py --list
    archive_tool.py --audit
    archive_tool.py --skill Figma-MCP --show cdp-page.js

Rules it enforces, each for a reason:

- The destination is always `<root>/Documentation/Skill/<Skill>/Reference/`. A
  tool that could write anywhere would need a path policy of its own, and the
  archive is the only place these files belong.
- An existing file is never overwritten without `--force`. A reference file is
  cited by the skill that documents it, so replacing one silently changes what
  the documentation claims.
- The header states the tool's purpose, not where one person happened to save it.
- Home directories are scrubbed, and a file that still carries one is refused
  rather than written. A leak that survives the scrub is a bug in this tool, and
  failing loudly is the only way it gets fixed.
- A missing or unreadable source is a reported failure, not an empty file. The
  point of the archive is a file that runs.
"""

from __future__ import annotations

import argparse
import datetime
import os
import re
import sys
from pathlib import Path


# The repository root is the nearest ancestor of this file that holds a
# `Documentation` directory. Walking up rather than hardcoding a path keeps the
# tool working from a worktree, a clone at another path, or a symlinked tree.
def find_root() -> Path:
    here = Path(__file__).resolve()

    for candidate in [here, *here.parents]:
        if (candidate / "Documentation" / "Skill").is_dir():
            return candidate

    raise SystemExit(
        "no Documentation/Skill directory above %s; run this from inside the repository" % here
    )


ROOT = find_root()
SKILL_ROOT = ROOT / "Documentation" / "Skill"

# The comment syntax per extension. A reference file is read by a human first,
# so the header has to be a comment the file's own language accepts - a Python
# file with a `//` header is a syntax error the moment someone runs it.
COMMENT = {
    ".py": ("#", "#"),
    ".sh": ("#", "#"),
    ".rb": ("#", "#"),
    ".pl": ("#", "#"),
    ".js": ("//", "//"),
    ".mjs": ("//", "//"),
    ".cjs": ("//", "//"),
    ".ts": ("//", "//"),
    ".tsx": ("//", "//"),
    ".jsx": ("//", "//"),
    ".rs": ("//", "//"),
    ".go": ("//", "//"),
    ".css": ("/*", "*/"),
    ".scss": ("/*", "*/"),
    ".sql": ("--", "--"),
}

SHEBANG = re.compile(r"^#!")

# Anything that names one machine: the POSIX home prefix, the Windows one, and
# the current account's name wherever it appears inside a path.
LEAK = re.compile(r"(/Users/[^/\s\"']+|/home/[^/\s\"']+|[A-Za-z]:\\\\?Users\\\\?[^\\\s\"']+)")


def comment_style(path: Path) -> tuple[str, str]:
    return COMMENT.get(path.suffix.lower(), ("#", "#"))


def header(path: Path, summary: str) -> str:
    """The stamped preamble: what this is and when it was archived."""
    open_, _ = comment_style(path)
    stamp = datetime.date.today().isoformat()
    lines = [
        f"Archived tool: {path.name}",
        "",
        f"What it does: {summary}",
        "Kept here so a later session reuses it instead of rewriting it.",
        "Run it from the repository root; it reads the paths it names and nothing else.",
        f"Archived: {stamp} by Documentation/Skill/Tool-Archive/Reference/archive_tool.py",
    ]

    if open_ == "/*":
        body = "\n".join(f" * {line}".rstrip() for line in lines)
        return f"/*\n{body}\n */\n"

    body = "\n".join(f"{open_} {line}".rstrip() for line in lines)
    return f"{body}\n"


def scrub(text: str, source: Path) -> str:
    """Remove every trace of one machine from a file about to be tracked.

    Three passes, in order: the source's own absolute path becomes a placeholder,
    then the home directory, then any remaining absolute home path. The order
    matters - replacing the source first keeps a longer, more specific path from
    being half-matched by the shorter home rule.
    """
    home = str(Path.home())

    for absolute in {str(source), str(source.resolve()), str(source.parent)}:
        text = text.replace(absolute, "<source>")

    text = text.replace(home, "~")

    return LEAK.sub("<home>", text)


def splice(path: Path, text: str, stamp: str) -> str:
    """Insert the header after a shebang, never before it."""
    lines = text.splitlines(keepends=True)

    if lines and SHEBANG.match(lines[0]):
        return lines[0] + stamp + "".join(lines[1:])

    return stamp + text


def index_path(skill: Path) -> Path:
    return skill / "Reference" / "Index.md"


def record(skill: Path, name: str, summary: str, dry: bool) -> None:
    """Append the file to the skill's reference index.

    The index is a table rather than a bullet list because the columns are the
    questions a reader has: which file, what it does, and what it needs before it
    will run.
    """
    target = index_path(skill)
    row = f"| `{name}` | {summary} | see the file's header |\n"

    if dry:
        print(f"[dry] would record {name} in {target.relative_to(ROOT)}")
        return

    if not target.exists():
        target.write_text(
            f"# {skill.name} reference\n\n"
            "Every file here was written during real work and archived rather than\n"
            "re-derived. Each one opens with a header stating what it does; nothing\n"
            "here names a machine, an account or an absolute path.\n\n"
            "| File | What it does | Notes |\n| --- | --- | --- |\n",
            encoding="utf-8",
        )

    with target.open("a", encoding="utf-8") as handle:
        handle.write(row)

    print(f"recorded in {target.relative_to(ROOT)}")


def archive(args: argparse.Namespace) -> int:
    skill_dir = SKILL_ROOT / args.skill

    if not skill_dir.is_dir():
        print(f"error: no skill at {skill_dir.relative_to(ROOT)}", file=sys.stderr)
        print("       create the skill first; the archive never invents one.", file=sys.stderr)
        return 2

    source = Path(os.path.expanduser(args.file)).resolve()

    if not source.is_file():
        print(f"error: {source} is not a readable file", file=sys.stderr)
        return 2

    if source.stat().st_size == 0:
        print(f"error: {source} is empty; an archived stub is worse than none", file=sys.stderr)
        return 2

    name = args.as_ or source.name
    reference = skill_dir / "Reference"
    target = reference / name

    if target.exists() and not args.force:
        print(
            f"error: {target.relative_to(ROOT)} exists; pass --force to replace it",
            file=sys.stderr,
        )
        return 3

    try:
        text = source.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        print(f"error: {source} is not UTF-8 text; the archive holds text only", file=sys.stderr)
        return 2

    cleaned = scrub(text, source)
    stamped = splice(target, cleaned, header(target, args.summary))

    remaining = LEAK.search(stamped)

    if remaining is not None:
        print(
            f"error: {name} still carries a home path ({remaining.group(0)!r}); "
            "rewrite the source to read it from an environment variable",
            file=sys.stderr,
        )
        return 4

    if args.dry_run:
        print(f"[dry] would write {target.relative_to(ROOT)} ({len(stamped)} bytes)")
        record(skill_dir, name, args.summary, dry=True)
        return 0

    reference.mkdir(parents=True, exist_ok=True)
    target.write_text(stamped, encoding="utf-8")

    if target.suffix in {".sh", ".py"}:
        target.chmod(target.stat().st_mode | 0o111)

    print(f"archived {source.name} -> {target.relative_to(ROOT)} ({len(stamped)} bytes)")
    record(skill_dir, name, args.summary, dry=False)
    return 0


def listing() -> int:
    if not SKILL_ROOT.is_dir():
        print("no Documentation/Skill directory", file=sys.stderr)
        return 2

    for skill in sorted(SKILL_ROOT.iterdir()):
        reference = skill / "Reference"

        if not reference.is_dir():
            continue

        files = sorted(entry for entry in reference.iterdir() if entry.is_file())

        if not files:
            continue

        print(f"{skill.name}/")
        for entry in files:
            print(f"  {entry.name:<32} {entry.stat().st_size:>7} B")

    return 0


def show(skill: str, name: str) -> int:
    target = SKILL_ROOT / skill / "Reference" / name

    if not target.is_file():
        print(f"error: {target} does not exist", file=sys.stderr)
        return 2

    print(target.read_text(encoding="utf-8"))
    return 0


def audit() -> int:
    """Report every tracked reference file that still names a machine.

    This file is skipped: it holds the pattern that does the matching, so its own
    definition line is the one place a home path is legitimately written down.
    """
    hits = 0
    self_path = Path(__file__).resolve()

    for path in sorted(SKILL_ROOT.rglob("*")):
        if not path.is_file() or path.suffix not in COMMENT:
            continue

        if path.resolve() == self_path:
            continue

        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if LEAK.search(line):
                print(f"{path.relative_to(ROOT)}:{number}: {line.strip()[:100]}")
                hits += 1

    print(f"{hits} line(s) naming a home directory" if hits else "clean: no home paths")

    return 0 if hits == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Archive a working script into Documentation/Skill/<Skill>/Reference/.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--skill", help="the skill directory that owns the tool")
    parser.add_argument("--file", help="the script to archive")
    parser.add_argument("--as", dest="as_", help="the filename it takes in Reference/")
    parser.add_argument("--summary", help="one sentence: what the tool does")
    parser.add_argument("--force", action="store_true", help="replace an existing reference file")
    parser.add_argument("--dry-run", action="store_true", help="report without writing")
    parser.add_argument("--list", action="store_true", help="list every archived tool")
    parser.add_argument("--show", metavar="FILE", help="print one archived tool")
    parser.add_argument("--audit", action="store_true", help="fail when a reference names a machine")

    args = parser.parse_args()

    if args.list:
        return listing()

    if args.audit:
        return audit()

    if args.show:
        if not args.skill:
            print("error: --show needs --skill", file=sys.stderr)
            return 2

        return show(args.skill, args.show)

    if not args.skill or not args.file or not args.summary:
        parser.print_help()
        print("\nerror: --skill, --file and --summary are required", file=sys.stderr)

        return 2

    return archive(args)


if __name__ == "__main__":
    sys.exit(main())
