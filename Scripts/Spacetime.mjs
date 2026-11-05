#!/usr/bin/env node
/**
 * The module suite.
 *
 *   node Scripts/Spacetime.mjs
 *
 * `Maintain/Spacetime/spacetimedb/` is a standalone package: its own
 * `package.json`, its own lockfile, its own `spacetimedb` pin and its own
 * `node_modules/`. It is deliberately not a member of `pnpm-workspace.yaml`,
 * because making it one would let the root install resolve a second version of
 * the SDK. The price is that nothing at the root reaches it - no `pnpm
 * --filter`, no root `pnpm install` - so its suite is invisible unless a stage
 * drives it as a subprocess with the module as the working directory. That is
 * what this file is.
 *
 * Two things it refuses to let read as something else:
 *
 *   1. A module that is not installed. Without the preflight the suite fails
 *      with `Cannot find module 'spacetimedb/server'` from inside the loader,
 *      which reads as a broken test rather than as a missing dependency.
 *   2. A module with no test file. `node --test` on an empty match exits 0, so
 *      a deleted or renamed suite would turn the stage green and silent.
 *
 * The suite is not plain `node --test`: the module bundler resolves `./Schema`
 * without an extension and `spacetime:sys@2.x` are host-provided virtual
 * modules. `Test/Support/Register.mjs` registers the resolve hook that
 * translates both, and is passed with `--import` exactly as the module's own
 * `test` script passes it.
 *
 * Exit 0 every test passed, 1 a test failed, the module is not installed, the
 * module carries no test file, or the suite never finishes.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const Here = dirname(fileURLToPath(import.meta.url));
const Root = resolve(Here, "..");
const Module = join(Root, "Maintain", "Spacetime", "spacetimedb");

/** The suite is local and fast; the timeout only bounds a wedged loader. */
const SuiteTimeout = 300_000;

function Section(Name) {
	process.stdout.write(`== ${Name}\n`);
}

function Line(Level, Text) {
	process.stdout.write(`${Level} ${Text}\n`);
}

/** Indented prose under a failure, in the shape the other guards use. */
function Detail(Lines) {
	process.stdout.write(`${Lines.map((Text) => `     ${Text}`).join("\n")}\n`);
}

function Shown(Path) {
	return relative(Root, Path).split("\\").join("/");
}

/**
 * What the suite needs before it can say anything about the module.
 *
 * `node_modules/spacetimedb` rather than `node_modules`: an empty directory is
 * not an install, and the SDK is the one package the loader cannot do without.
 */
function Preflight() {
	const Manifest = join(Module, "package.json");

	if (!existsSync(Manifest)) {
		return {
			Failure: `${Shown(Manifest)} is missing, so there is no module to test.`,
			Detail: [
				"The module is part of the tree, not a generated artifact: restore it from the",
				"repository (`git status Maintain/Spacetime`) before running the gate.",
			],
		};
	}

	const SDK = join(Module, "node_modules", "spacetimedb", "package.json");

	if (!existsSync(SDK)) {
		return {
			Failure: `${Shown(join(Module, "node_modules", "spacetimedb"))} is missing: the module's own dependencies are not installed.`,
			Detail: [
				"The module is a standalone package - its own package.json, its own lockfile, its",
				"own spacetimedb pin - and it is not a member of pnpm-workspace.yaml, so neither",
				"the root `pnpm install` nor `pnpm --filter` installs it. Install it in place:",
				"",
				"  cd Maintain/Spacetime/spacetimedb && pnpm install --ignore-workspace",
				"",
				"`--ignore-workspace` is the whole instruction. The directory sits under the root",
				"workspace without being a member, and a plain `pnpm install` there resolves the",
				"root instead: it exits 0 having installed nothing here, which is the failure this",
				"preflight exists to name.",
			],
		};
	}

	const Hook = join(Module, "Test", "Support", "Register.mjs");

	if (!existsSync(Hook)) {
		return {
			Failure: `${Shown(Hook)} is missing: the resolve hook the suite loads with --import is gone.`,
			Detail: [
				"Without it `./Schema` (extensionless) and `spacetime:sys@2.x` (host-provided",
				"virtual modules) do not resolve under plain node.",
			],
		};
	}

	return { Failure: undefined };
}

/** Every `*.test.ts` beside the module, sorted so the run order is stable. */
function TestFiles() {
	const Directory = join(Module, "Test");

	if (!existsSync(Directory)) {
		return [];
	}

	return readdirSync(Directory)
		.filter((Name) => Name.endsWith(".test.ts"))
		.sort()
		.map((Name) => join("Test", Name));
}

Section("module");

const { Failure, Detail: Why } = Preflight();

if (Failure !== undefined) {
	Line("FAIL", Failure);
	Detail(Why);
	process.stdout.write("---\n");
	process.stdout.write("RESULT module untested\n");
	process.exit(1);
}

const Files = TestFiles();

if (Files.length === 0) {
	Line("FAIL", `${Shown(join(Module, "Test"))} holds no *.test.ts: the suite would run nothing.`);
	Detail([
		"`node --test` on an empty match exits 0, so an absent suite must be refused here rather",
		"than reported as a pass.",
	]);
	process.stdout.write("---\n");
	process.stdout.write("RESULT module untested\n");
	process.exit(1);
}

Line("PASS", `${Files.length} test file(s) under ${Shown(join(Module, "Test"))}`);
process.stdout.write("\n");

const Run = spawnSync(
	process.execPath,
	["--import", "./Test/Support/Register.mjs", "--test", ...Files],
	{
		cwd: Module,
		stdio: "inherit",
		timeout: SuiteTimeout,
	},
);

/**
 * A wedged suite must read as a wedged suite. `spawnSync` reports its own
 * timeout as an error (`ETIMEDOUT`) rather than as a signal, so the two are
 * told apart here instead of one being reported as a failure to start.
 */
if (Run.error !== undefined) {
	const Wedged = Run.error.code === "ETIMEDOUT";

	Line(
		"FAIL",
		Wedged
			? `the suite did not finish within ${SuiteTimeout}ms`
			: `the suite could not be started: ${Run.error.message}`,
	);

	if (Wedged) {
		Detail([
			"A synchronous loop or a live handle in one of the files above keeps the run from",
			"ending; the whole file is then killed, so its assertions are never reported.",
			"Run it alone to see it: `cd Maintain/Spacetime/spacetimedb &&",
			"node --import ./Test/Support/Register.mjs Test/<Name>.test.ts`.",
		]);
	}

	process.stdout.write("---\n");
	process.stdout.write("RESULT module wedged\n");
	process.exit(1);
}

if (Run.signal !== null) {
	Line("FAIL", `the suite was killed by ${Run.signal} after ${SuiteTimeout}ms`);
	process.stdout.write("---\n");
	process.stdout.write("RESULT module wedged\n");
	process.exit(1);
}

if (Run.status !== 0) {
	Line("FAIL", `the module suite exited ${Run.status}`);
	Detail([
		"Each failing assertion is named in the TAP output above. The module's own",
		"`cd Maintain/Spacetime/spacetimedb && pnpm test` runs the same files.",
	]);
	process.stdout.write("---\n");
	process.stdout.write("RESULT module red\n");
	process.exit(Run.status === null ? 1 : Run.status);
}

process.stdout.write("---\n");
process.stdout.write("RESULT module green\n");
process.exit(0);
