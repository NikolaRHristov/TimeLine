#!/usr/bin/env python3
# What it does: Prove that the RFC board publishes one commit's snapshot rather
# than the index or the working tree - a record staged and never committed is
# excluded from the corpus, and a record edited after its commit renders the bytes
# that commit holds - by building a throwaway repository and asserting both.
# Run it with the tool beside it:
#   python3 -m unittest discover -s <this directory> -p 'test_committed_snapshot.py' -v

"""The two cases the board's "committed only" promise is actually made of.

Both are built, not counted. A throwaway repository is committed and then made
dirty in the two ways a person makes a tree dirty, and the loader is asked what it
would publish. Counting `git ls-files` again would agree with the defect, because
the index is exactly what the defect reads.

The repository is created under the temporary directory and removed by the test's
own cleanup; nothing here touches the checkout the file lives in.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# The tool beside this file, not an installed package: `Reference/` is a directory
# of archived scripts and nothing here is on `sys.path` otherwise.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import rfc_board  # noqa: E402

PROPOSED = "Documentation/RFC/proposed"
COMMITTED = "COMMITTED-TEXT"
STAGED = "STAGED-MARKER"
DIRTY = "DIRTY-MARKER"

# A throwaway repository needs an identity, and it must not inherit the machine's
# own: a global `commit.gpgsign` or a `core.autocrlf` would either fail the commit
# or rewrite the bytes this test compares against.
GIT_IDENTITY = (
    "-c",
    "user.name=Snapshot Test",
    "-c",
    "user.email=snapshot@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.autocrlf=false",
)


def record(number: int, slug: str, decision: str) -> str:
    """A minimal record: the seven required keys and the two required sections."""
    return (
        "---\n"
        f"title: {slug}\n"
        f'rfc: "{number:04d}"\n'
        "category: architecture/data\n"
        "kind: rfc\n"
        "status: proposed\n"
        "horizon: now\n"
        "depends: []\n"
        "---\n"
        "\n"
        "## Decision\n"
        "\n"
        f"{decision}\n"
        "\n"
        "## Verification\n"
        "\n"
        "| Claim | Test |\n"
        "| ----- | ---- |\n"
        "| it holds | this file |\n"
    )


class Throwaway:
    """A git repository with one committed record, and a way to dirty it."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.proposed = root / PROPOSED
        self.proposed.mkdir(parents=True)

    def git(self, *args: str) -> str:
        proc = subprocess.run(
            ["git", "-C", str(self.root), *GIT_IDENTITY, *args],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise AssertionError(f"git {' '.join(args)}: {proc.stderr.strip()}")
        return proc.stdout

    def write(self, name: str, text: str) -> Path:
        path = self.proposed / name
        path.write_text(text, encoding="utf-8")
        return path

    def commit(self, message: str = "one record") -> str:
        self.git("add", "--", PROPOSED)
        self.git("commit", "-q", "-m", message)
        return self.git("rev-parse", "HEAD").strip()


class CommittedSnapshot(unittest.TestCase):
    """What the loader publishes when the tree and the commit disagree."""

    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="rfc-snapshot-"))
        self.addCleanup(shutil.rmtree, self.root, True)
        self.repo = Throwaway(self.root)
        self.repo.git("init", "-q", ".")
        self.repo.write("RFC-0001-committed.md", record(1, "committed", COMMITTED))
        self.commit = self.repo.commit()

    def test_a_staged_record_is_not_published(self) -> None:
        self.repo.write("RFC-0002-staged.md", record(2, "staged", STAGED))
        self.repo.git("add", "--", f"{PROPOSED}/RFC-0002-staged.md")

        # The index does carry the staged record. That is the state the defect
        # read, so this assertion is what makes the next one mean something.
        self.assertIn(f"{PROPOSED}/RFC-0002-staged.md", self.repo.git("ls-files", "--", PROPOSED))

        enumerated = rfc_board.committed_files(self.root, rfc_board.head_commit(self.root))
        records, _skipped, errors, _warnings = rfc_board.load(self.root)

        self.assertEqual(errors, [])
        self.assertEqual(enumerated, [f"{PROPOSED}/RFC-0001-committed.md"])
        self.assertEqual([entry["id"] for entry in records], ["RFC-0001"])
        self.assertNotIn(STAGED, "\n".join(entry["decision"] for entry in records))

    def test_an_edited_record_publishes_its_committed_bytes(self) -> None:
        # Tracked, committed, then edited in place: the state a person is in
        # between writing a change and committing it.
        self.repo.write("RFC-0001-committed.md", record(1, "committed", DIRTY))
        self.assertIn(
            f"{PROPOSED}/RFC-0001-committed.md",
            self.repo.git("diff", "--name-only", "--", PROPOSED),
        )

        records, _skipped, errors, _warnings = rfc_board.load(self.root)

        self.assertEqual(errors, [])
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["decision"], COMMITTED)
        self.assertNotIn(DIRTY, records[0]["decision"])


class DefensiveFailures(unittest.TestCase):
    """A broken snapshot is a message and a non-zero exit, never a traceback."""

    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="rfc-snapshot-broken-"))
        self.addCleanup(shutil.rmtree, self.root, True)
        self.repo = Throwaway(self.root)
        self.repo.git("init", "-q", ".")

    def test_a_repository_with_no_commit_reports_it(self) -> None:
        with self.assertRaises(SystemExit) as caught:
            rfc_board.head_commit(self.root)
        code = caught.exception.code
        self.assertIsInstance(code, str)
        self.assertIn("no commit to read", str(code))

    def test_a_commit_with_no_record_reports_it(self) -> None:
        (self.root / "README.md").write_text("nothing proposed yet\n", encoding="utf-8")
        self.repo.git("add", "--", "README.md")
        self.repo.git("commit", "-q", "-m", "no records")

        commit = rfc_board.head_commit(self.root)
        with self.assertRaises(SystemExit) as caught:
            rfc_board.committed_files(self.root, commit)
        code = caught.exception.code
        self.assertIsInstance(code, str)
        self.assertIn("no committed record", str(code))

    def test_a_blob_that_is_not_text_reports_it(self) -> None:
        (self.repo.proposed / "RFC-0001-binary.md").write_bytes(b"\xff\xfe\x00 not utf-8")
        commit = self.repo.commit("a record that is not text")

        with self.assertRaises(SystemExit) as caught:
            rfc_board.committed_text(self.root, commit, f"{PROPOSED}/RFC-0001-binary.md")
        code = caught.exception.code
        self.assertIsInstance(code, str)
        self.assertIn("is not UTF-8 text", str(code))


if __name__ == "__main__":
    unittest.main()
