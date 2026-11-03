#!/usr/bin/env python3
# What it does: Prove that the tool reads by default and writes only through `sync`
# - a mutating `gh` verb or a GraphQL mutation is refused before any process starts,
# the plan exits 0 on a board that agrees and 1 on one that does not, and `sync`
# refuses a populated board without a reason. No network, no board, no `gh`.
# Run it with the tool beside it:
#   python3 -m unittest discover -s <this directory> -p 'test_read_only.py' -v

"""The three promises that keep a shared board from being rewritten by accident.

Every test here is built rather than observed: the seam is asked to refuse with
`subprocess.run` replaced by a recorder, and the plan and the gate are driven with
a synthetic board. Nothing in this file talks to GitHub, so it proves the refusal
without a chance of the write it is refusing.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# The tool beside this file, not an installed package.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import rfc_board  # noqa: E402

SEP = rfc_board.SEP


def args(**overrides) -> argparse.Namespace:
    """The flags every command reads, with sync's reason empty unless asked for."""
    base = {
        "owner": "owner",
        "repo": "repo",
        "project": 1,
        "branch": "Current",
        "work": None,
        "limit": 500,
        "reason": "",
    }
    base.update(overrides)
    return argparse.Namespace(**base)


def record(
    number: int,
    status: str = "Proposed",
    cards: str = "",
    horizon: str = "now",
) -> dict:
    """One record, in the shape `parse_record` returns."""
    return {
        "number": number,
        "id": f"RFC-{number:04d}",
        "title": f"record {number}",
        "path": f"Documentation/RFC/proposed/RFC-{number:04d}-record-{number}.md",
        "status": status,
        "date": "",
        "kind": "architecture",
        "subject": "data",
        "horizon": horizon,
        "task_dependencies": cards,
        "applies_to": "",
        "supersedes": "",
        "superseded_by": "",
        "decision": f"the decision of {number}",
        "verification": "| Claim | Test |\n| ----- | ---- |\n| it holds | this file |",
        "open_questions": "",
    }


def field(name: str, options: tuple[str, ...] = ()) -> dict:
    """A project field: a plain text field, or a single select with its options."""
    entry: dict = {
        "name": name,
        "id": f"FIELD_{name}",
        "dataType": "SINGLE_SELECT" if options else "TEXT",
    }
    if options:
        entry["options"] = [{"id": f"OPTION_{name}_{o}", "name": o} for o in options]
    return entry


def fields_fixture() -> dict[str, dict]:
    """The six fields the project is expected to carry."""
    return {
        "RFC": field("RFC"),
        "Cards": field("Cards"),
        "Status": field("Status", rfc_board.STATUS_OPTIONS),
        **{axis: field(axis, options) for axis, options in rfc_board.AXES},
    }


def board_of(records: list[dict], bodies: dict[str, str], body_state: str = "agrees") -> rfc_board.Board:
    """A synthetic project that agrees with the records, or drifts in its bodies."""
    fields = fields_fixture()
    options, _ids, _rfc_text = rfc_board.resolve_options(fields)
    issues: dict[str, dict] = {}
    items: dict[str, dict] = {}
    for entry in records:
        title = f"{entry['id']} {SEP} {entry['title']}"
        body = bodies[entry["id"]]
        issues[title] = {
            "number": entry["number"],
            "title": title,
            "body": body if body_state == "agrees" else "a body nobody assembled",
        }
        item = {
            "id": f"ITEM_{entry['number']}",
            "rfc": None,
            "kind": None,
            "status": None,
            "subject": None,
            "horizon": None,
            "cards": None,
        }
        for name, value in rfc_board.desired_values(entry, fields, options).items():
            item[name.lower()] = value
        items[title] = item
    return rfc_board.Board("PROJECT_node", fields, issues, items)


class TheSeam(unittest.TestCase):
    """A write is refused at the one place every write passes through."""

    def setUp(self) -> None:
        rfc_board.WRITES["reason"] = ""
        self.addCleanup(rfc_board.WRITES.update, {"reason": ""})

    def test_a_mutating_cli_verb_is_refused_before_a_process_starts(self) -> None:
        with mock.patch.object(rfc_board.subprocess, "run") as run:
            for verb in (
                ("issue", "create", "--repo", "o/r"),
                ("issue", "edit", "1", "--repo", "o/r"),
                ("issue", "close", "1"),
                ("project", "item-add", "1", "--owner", "o"),
                ("project", "item-edit", "--id", "x"),
            ):
                with self.assertRaises(SystemExit) as caught:
                    rfc_board.gh(*verb)
                self.assertIn("the only writer is `sync`", str(caught.exception.code))
            run.assert_not_called()

    def test_a_graphql_mutation_is_refused_before_a_process_starts(self) -> None:
        with mock.patch.object(rfc_board.subprocess, "run") as run:
            with self.assertRaises(SystemExit) as caught:
                rfc_board.graphql("mutation{publishProjectV2ItemFieldValue(input:{}){x}}")
            self.assertIn("refusing to send a GraphQL mutation", str(caught.exception.code))
            run.assert_not_called()

    def test_a_read_runs_without_being_declared(self) -> None:
        done = subprocess.CompletedProcess(
            args=[], returncode=0, stdout='{"data": {}}', stderr=""
        )
        with mock.patch.object(rfc_board.subprocess, "run", return_value=done) as run:
            rfc_board.gh("project", "item-list", "1", "--owner", "o", "--format", "json")
            rfc_board.graphql("query($p:ID!){node(id:$p){id}}", {"p": "x"})
        self.assertEqual(run.call_count, 2)

    def test_the_sync_may_write_once_it_has_declared_itself(self) -> None:
        done = subprocess.CompletedProcess(
            args=[], returncode=0, stdout='{"data": {}}', stderr=""
        )
        rfc_board.allow_writes("a test said so")
        with mock.patch.object(rfc_board.subprocess, "run", return_value=done) as run:
            rfc_board.gh("issue", "create", "--repo", "o/r", "--title", "t")
            rfc_board.graphql("mutation{x}")
        self.assertEqual(run.call_count, 2)

    def test_a_missing_gh_is_one_line_and_a_non_zero_exit(self) -> None:
        with mock.patch.object(rfc_board.subprocess, "run", side_effect=FileNotFoundError):
            with self.assertRaises(SystemExit) as caught:
                rfc_board.gh("project", "item-list", "1", "--owner", "o")
        self.assertIn("gh is not installed", str(caught.exception.code))

    def test_an_answer_that_is_not_json_is_named_not_tracebacked(self) -> None:
        with self.assertRaises(SystemExit) as caught:
            rfc_board.parse_json("<html>a login page</html>", "gh api graphql")
        self.assertIn("not JSON", str(caught.exception.code))


class ThePlan(unittest.TestCase):
    """The plan is a pure computation over the board it is given."""

    def setUp(self) -> None:
        self.records = [record(1), record(2, cards="t_aaaaaaaa t_bbbbbbbb"), record(3)]
        self.bodies = {entry["id"]: f"## Decision\n\n{entry['decision']}\n" for entry in self.records}

    def test_an_agreeing_board_needs_no_change(self) -> None:
        board = board_of(self.records, self.bodies)
        changes, agree, warnings = rfc_board.plan_board(board, self.records, self.bodies, "unchanged")
        self.assertEqual(changes, [])
        self.assertEqual(warnings, [])
        self.assertEqual(agree["body"], 3)
        self.assertEqual(agree["item"], 3)
        self.assertEqual(agree["readme"], 1)

    def test_a_drifted_body_is_one_body_change(self) -> None:
        board = board_of(self.records, self.bodies, body_state="differs")
        changes, _agree, _warnings = rfc_board.plan_board(board, self.records, self.bodies, "unchanged")
        self.assertEqual([change.phase for change in changes], ["body"] * 3)

    def test_a_record_new_to_the_board_is_an_issue_an_item_and_its_fields(self) -> None:
        board = board_of(self.records, self.bodies)
        for key in list(board.issues):
            if key.startswith("RFC-0003"):
                del board.issues[key]
        changes, _agree, _warnings = rfc_board.plan_board(board, self.records, self.bodies, "unchanged")
        phases = [change.phase for change in changes]
        self.assertEqual(phases[0], "issue")
        self.assertEqual(phases[1], "item")
        self.assertEqual(set(phases[2:]), {"field"})
        # RFC, Status, Kind, Subject and Horizon, and no Cards: the record names none.
        self.assertEqual(len(phases[2:]), 5)

    def test_an_option_the_project_lacks_is_a_warning_and_not_a_write(self) -> None:
        records = [record(1, status="Superseded")]
        bodies = {records[0]["id"]: "## Decision\n\nthe decision\n"}
        board = board_of(records, bodies)
        # A project with no `Superseded` option cannot hold the value, so the item's
        # field is empty and the record's value has nowhere to go.
        board.items[f"{records[0]['id']} {SEP} {records[0]['title']}"]["status"] = None
        changes, _agree, warnings = rfc_board.plan_board(board, records, bodies, "unchanged")
        self.assertEqual(changes, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn("has no option on the project", warnings[0])

    def _drive(self, board: rfc_board.Board, records, bodies) -> int:
        work = Path(tempfile.mkdtemp(prefix="rfc-plan-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(work, True))
        patches = (
            mock.patch.object(rfc_board, "prepare", return_value=(Path("."), work, records, "owner/repo")),
            mock.patch.object(rfc_board, "bodies_for", return_value=(bodies, [], [])),
            mock.patch.object(rfc_board, "read_board", return_value=board),
            mock.patch.object(rfc_board, "readme_state", return_value=("unchanged", "")),
        )
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)
        with contextlib.redirect_stdout(io.StringIO()):
            return rfc_board.cmd_plan(args())

    def test_the_default_path_exits_zero_when_nothing_would_change(self) -> None:
        board = board_of(self.records, self.bodies)
        self.assertEqual(self._drive(board, self.records, self.bodies), 0)

    def test_the_default_path_exits_one_when_the_board_disagrees(self) -> None:
        board = board_of(self.records, self.bodies, body_state="differs")
        self.assertEqual(self._drive(board, self.records, self.bodies), 1)


class TheSyncGate(unittest.TestCase):
    """The writer refuses what it has not been told to do, and needs no telling on
    an empty board."""

    def setUp(self) -> None:
        rfc_board.WRITES["reason"] = ""
        self.addCleanup(rfc_board.WRITES.update, {"reason": ""})
        self.records = [record(1)]
        self.bodies = {self.records[0]["id"]: "## Decision\n\nthe decision\n"}

    def _drive(self, board, **flags):
        """cmd_sync with every seam replaced; returns (exit code, execute calls)."""
        work = Path(tempfile.mkdtemp(prefix="rfc-sync-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(work, True))
        executed: list[tuple] = []

        def fake_execute(*params):
            executed.append(params)
            return 0

        patches = (
            mock.patch.object(rfc_board, "prepare", return_value=(Path("."), work, self.records, "owner/repo")),
            mock.patch.object(rfc_board, "bodies_for", return_value=(self.bodies, [], [])),
            mock.patch.object(rfc_board, "read_board", return_value=board),
            mock.patch.object(rfc_board, "readme_state", return_value=("unchanged", "")),
            mock.patch.object(rfc_board, "write_bodies", return_value=work / "bodies"),
            mock.patch.object(rfc_board, "execute", side_effect=fake_execute),
        )
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return rfc_board.cmd_sync(args(**flags)), executed

    def test_a_populated_board_without_a_reason_is_refused_before_any_write(self) -> None:
        board = board_of(self.records, self.bodies, body_state="differs")
        with self.assertRaises(SystemExit) as caught:
            self._drive(board)
        self.assertEqual(caught.exception.code, 2)
        self.assertEqual(rfc_board.WRITES["reason"], "")

    def test_a_populated_board_with_a_reason_is_performed(self) -> None:
        board = board_of(self.records, self.bodies, body_state="differs")
        code, executed = self._drive(board, reason="the footer changed")
        self.assertEqual(code, 0)
        self.assertEqual(len(executed), 1)
        self.assertEqual(rfc_board.WRITES["reason"], "the footer changed")

    def test_an_empty_board_is_the_initial_sync_and_needs_no_reason(self) -> None:
        board = board_of([], {})
        code, executed = self._drive(board)
        self.assertEqual(code, 0)
        self.assertEqual(len(executed), 1)
        self.assertIn("the board is empty", rfc_board.WRITES["reason"])

    def test_a_board_that_already_agrees_writes_nothing_and_asks_nothing(self) -> None:
        board = board_of(self.records, self.bodies)
        code, executed = self._drive(board)
        self.assertEqual(code, 0)
        self.assertEqual(executed, [])
        self.assertEqual(rfc_board.WRITES["reason"], "")


class TheExecutor(unittest.TestCase):
    """The sync's executor performs the plan in the order the phases need.

    `gh` and `graphql` are replaced by recorders, so the write path is exercised
    without a request leaving the machine: what is asserted is the sequence of
    calls a future sync would make, not a board it changed.
    """

    def setUp(self) -> None:
        rfc_board.WRITES["reason"] = ""
        self.addCleanup(rfc_board.WRITES.update, {"reason": ""})
        self.records = [record(1), record(2)]
        self.bodies = {entry["id"]: f"## Decision\n\n{entry['decision']}\n" for entry in self.records}
        self.work = Path(tempfile.mkdtemp(prefix="rfc-execute-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(self.work, True))

    def _execute(self, board: rfc_board.Board, readme: str = "unchanged"):
        """Run `execute` over the plan, with both seams recorded."""
        calls: list[tuple] = []

        def fake_gh(*params, **kwargs):
            calls.append(("gh", params))
            if params[:2] == ("issue", "create"):
                return subprocess.CompletedProcess(
                    args=[], returncode=0, stdout="https://github.com/o/r/issues/42\n", stderr=""
                )
            if params[:2] == ("project", "item-add"):
                return subprocess.CompletedProcess(
                    args=[], returncode=0, stdout='{"id": "ITEM_new"}', stderr=""
                )
            return subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")

        def fake_graphql(query, variables=None):
            calls.append(("graphql", query, variables or {}))
            if "updateProjectV2(input" in query:
                return {"updateProjectV2": {"projectV2": {"readme": (variables or {}).get("r", "")}}}
            return {}

        rfc_board.allow_writes("a test said so")
        changes, _agree, _warnings = rfc_board.plan_board(board, self.records, self.bodies, readme)
        with mock.patch.object(rfc_board, "gh", side_effect=fake_gh), mock.patch.object(
            rfc_board, "graphql", side_effect=fake_graphql
        ), contextlib.redirect_stdout(io.StringIO()) as output:
            code = rfc_board.execute(
                board,
                changes,
                self.records,
                self.bodies,
                self.work / "bodies",
                "rendered readme",
                "o/r",
                args(),
            )
        return code, calls, output.getvalue()

    def test_a_new_record_creates_the_issue_then_the_item_then_its_fields(self) -> None:
        board = board_of(self.records, self.bodies)
        for key in list(board.issues):
            if key.startswith("RFC-0002"):
                del board.issues[key]
        code, calls, output = self._execute(board)
        self.assertEqual(code, 0)

        verbs = [call[1][:2] for call in calls if call[0] == "gh"]
        self.assertEqual(verbs, [("issue", "create"), ("project", "item-add")])
        self.assertIn("https://github.com/o/r/issues/42", calls[1][1])
        # One mutation document carries the five field values of the new item.
        mutations = [call for call in calls if call[0] == "graphql"]
        self.assertEqual(len(mutations), 1)
        document = mutations[0][1]
        self.assertIn("updateProjectV2ItemFieldValue", document)
        self.assertEqual(document.count("updateProjectV2ItemFieldValue"), 5)
        self.assertIn("ITEM_new", document)
        # The `RFC` field is text on this project, so the literal is the padded
        # string and not a number; the record names no card, so `Cards` is absent.
        self.assertIn('text: "0002"', document)
        self.assertNotIn("FIELD_Cards", document)
        # One printed line per mutation: a create, an item and five field values.
        self.assertEqual(len([line for line in output.splitlines() if line.startswith("  ")]), 7)

    def test_a_drifted_body_edits_the_issue_and_nothing_else(self) -> None:
        board = board_of(self.records, self.bodies, body_state="differs")
        code, calls, output = self._execute(board)
        self.assertEqual(code, 0)
        verbs = [call[1][:2] for call in calls if call[0] == "gh"]
        self.assertEqual(verbs, [("issue", "edit"), ("issue", "edit")])
        self.assertEqual([call for call in calls if call[0] == "graphql"], [])
        self.assertEqual(len([line for line in output.splitlines() if line.startswith("  ")]), 2)

    def test_a_failed_create_is_reported_and_counted_not_raised(self) -> None:
        board = board_of(self.records, self.bodies)
        for key in list(board.issues):
            if key.startswith("RFC-0002"):
                del board.issues[key]

        def failing_gh(*params, **kwargs):
            return subprocess.CompletedProcess(
                args=[], returncode=1, stdout="", stderr="HTTP 422: validation failed"
            )

        rfc_board.allow_writes("a test said so")
        changes, _agree, _warnings = rfc_board.plan_board(board, self.records, self.bodies, "unchanged")
        with mock.patch.object(rfc_board, "gh", side_effect=failing_gh), mock.patch.object(
            rfc_board, "graphql", return_value={}
        ), contextlib.redirect_stdout(io.StringIO()) as output:
            code = rfc_board.execute(
                board,
                changes,
                self.records,
                self.bodies,
                self.work / "bodies",
                "rendered readme",
                "o/r",
                args(),
            )
        self.assertEqual(code, 1)
        self.assertIn("FAIL create", output.getvalue())
        self.assertIn("FAIL add", output.getvalue())


def subcommands(parser: argparse.ArgumentParser) -> dict:
    """The subcommand names a parser accepts, and their parsers."""
    for action in parser._actions:
        if isinstance(action, argparse._SubParsersAction):
            return action.choices
    raise AssertionError("the parser has no subcommands")


class TheCommandSurface(unittest.TestCase):
    """The read commands and the one writer are listed apart, and `publish` is gone."""

    def test_help_lists_the_readers_and_the_writer_separately(self) -> None:
        parser = rfc_board.build_parser()
        text = parser.format_help()
        self.assertIn("read commands", text)
        self.assertIn("the one writer", text)
        self.assertEqual(
            sorted(subcommands(parser)),
            ["plan", "readme", "render", "sync", "verify"],
        )

    def test_sync_help_states_the_empty_board_precondition(self) -> None:
        text = subcommands(rfc_board.build_parser())["sync"].format_help()
        self.assertIn("holds items unless --reason", text)

    def test_publish_is_refused_with_a_sentence(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            with self.assertRaises(SystemExit) as caught:
                rfc_board.main(["publish"])
        self.assertEqual(caught.exception.code, 2)
        self.assertIn("nothing was written", stderr.getvalue())

    def test_a_bare_run_is_the_plan(self) -> None:
        with mock.patch.object(rfc_board, "cmd_plan", return_value=0) as plan:
            self.assertEqual(rfc_board.main([]), 0)
        plan.assert_called_once()


if __name__ == "__main__":
    unittest.main()
