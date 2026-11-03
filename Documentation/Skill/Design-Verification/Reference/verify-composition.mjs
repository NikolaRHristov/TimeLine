#!/usr/bin/env node
/**
 * Verify the built workspace against `Documentation/Reference/Design-Composition.md`.
 *
 * This is ad-hoc verification, not a test suite: it serves the build, drives it in a
 * real browser, and asserts the measured geometry against the numbers read from the
 * Figma file. It exists because a green `astro build` proves the page compiled, not
 * that the composition is the composition - and because reading a screenshot cannot
 * tell a 360px rail from a 386px one.
 *
 * Preconditions are reported as blockers with exit 2, never as failures: a missing
 * build, a missing browser or a route that served no document is not the page's
 * fault. A page defect is not a precondition either: an element an invariant names
 * that is absent from the page is a failed invariant (exit 1), printed as `ABSENT`
 * with the selector that stopped matching. A probe that threw on a deleted node
 * would report the deletion as a check that could not run (RFC-0072).
 *
 * The build is snapshotted before it is served. `astro build` empties `Target/`
 * before it writes, so serving the live directory while another build runs reports
 * every route as serving no document - a failure of the observer, not the page.
 * The snapshot is a quiet-time heuristic: it refuses a copy taken while the tree
 * moved, and refuses to copy at all after its deadline.
 *
 *   node verify-composition.mjs              # serve ./Target and probe it
 *   node verify-composition.mjs --url <u>    # probe a server already running
 *   CDP_URL=http://127.0.0.1:9223 node ...   # a browser on another port
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CDP = process.env["CDP_URL"] ?? "http://127.0.0.1:9222";
const PORT = Number(process.env["PORT"] ?? 4411);
const sleep = (Ms) => new Promise((Done) => setTimeout(Done, Ms));

/** The repository root: the nearest ancestor holding a built site. */
function root() {
	let Here = dirname(fileURLToPath(import.meta.url));

	for (let Up = 0; Up < 8; Up++) {
		if (existsSync(resolve(Here, "Target"))) return Here;
		Here = dirname(Here);
	}

	return null;
}

/** What the frame must measure, in the page's own coordinates. */
const Frame = [
	["rail is 224 wide", (Box) => Box.provenance.w, 224],
	["rail is 360 tall", (Box) => Box.provenance.h, 360],
	["rail sits level with the drawer", (Box) => Box.provenance.y, (Box) => Box.drawer.y],
	["drawer starts at 240 (rail + 16 gap)", (Box) => Box.drawer.x, 240],
	["drawer is 360 tall", (Box) => Box.drawer.h, 360],
	["seam is 40 tall", (Box) => Box.publish.h, 40],
	["seam sits under the drawer", (Box) => Box.publish.y, (Box) => Box.drawer.y + Box.drawer.h],
	["canvas is 900 tall", (Box) => Box.bento.h, 900],
	["canvas sits under the seam", (Box) => Box.bento.y, (Box) => Box.publish.y + Box.publish.h],
	["the drum draws 13 bands", (Box) => Box.bandCount, 13],
	[
		"the ladder ramps away from the selection",
		(Box) => Box.bandHeights.join(","),
		"8,10,12,16,22,28,44,28,22,16,12,10,8",
	],
	["the seam is light, not panel dark", (Box) => Box.seamBackground, "rgb(236, 236, 236)"],
	// The seam states what a drop would do, or why it cannot - never a record's
	// title, which would change on every selection. `/Workspace` is public
	// (RFC-0054), so the build's own state is the anonymous one: the seam is
	// `locked` and its line is the reason (RFC-0049, RFC-0013).
	[
		"the seam states why it is locked",
		(Box) => Box.seamNote,
		"Publishing needs an identity - a published record carries an author",
	],
	[
		"the publish control is locked, not absent",
		(Box) => `${Box.seamState}/${Box.seamDisabled}`,
		"locked/true",
	],

	// The composition grows downward from the canvas (RFC-0046 §4, RFC-0047 §5,
	// RFC-0048). The three bands follow the canvas on its own 20px rhythm, in the
	// order a reader meets them: what was published, who trusts whom, what the
	// network runs, and the machine's own state.
	[
		"the bands are drawn in reading order",
		(Box) => Box.bandOrder.every((Top, Index, All) => Index === 0 || Top > All[Index - 1]),
		true,
	],
	["the swimlanes sit 20 under the canvas", (Box) => Box.gaps[0], 20],
	["the spectrometer sits under the swimlanes", (Box) => Box.gaps[1], 20],
	["the status footer closes the composition", (Box) => Box.gaps[2], 20],
	[
		"the lane air exceeds the canvas gap",
		(Box) => Box.laneAir,
		(Box) => Box.canvasGap,
		(Got, Want) => Got > Want,
	],
	[
		"the cluster sits on the rail's bottom",
		(Box) => Box.security.y + Box.security.h,
		(Box) => Box.rail.y + Box.rail.h,
	],
	[
		"the cluster shares the footer's baseline",
		(Box) => Box.marks.y + Box.marks.h,
		(Box) => Box.statusList.y + Box.statusList.h,
	],
	[
		"the footer states its four values as words",
		(Box) => Box.statusWords.join(","),
		"static,static,0,0",
	],
];

const Probe = `(() => {
	const Box = (Selector) => {
		const Element = document.querySelector(Selector);
		if (Element === null) return null;
		const Rect = Element.getBoundingClientRect();
		return { x: Math.round(Rect.x), y: Math.round(Rect.y), w: Math.round(Rect.width), h: Math.round(Rect.height) };
	};
	const Bands = [...document.querySelectorAll(".provenance__band")];
	const Lanes = [...document.querySelectorAll(".swimlane")].map((Lane) => Lane.getBoundingClientRect());
	const Canvas = document.querySelector(".bento");
	const Seam = document.querySelector(".publish");

	// Every selector an invariant names. A selector that stopped matching is the
	// page's defect, so the probe reports it rather than failing to answer: a throw
	// inside Runtime.evaluate comes back as no value at all, which the caller cannot
	// tell apart from a dead browser.
	const Required = [
		".provenance", ".drawer", ".publish", ".bento", ".rail", ".swimlanes",
		".spectrometer", ".status", ".status__list", ".security", ".security__marks",
		".publish__note", ".publish__control", ".swimlane", ".status__value",
		".provenance__band",
	];

	// Measured from the unrounded rects: a band's height lands on a fraction of a
	// pixel often enough that rounding both edges first turns a 20px gap into 21.
	const Gap = (Above, Below) => {
		const Top = document.querySelector(Above);
		const Bottom = document.querySelector(Below);
		if (Top === null || Bottom === null) return -1;
		return Math.round(Bottom.getBoundingClientRect().y - Top.getBoundingClientRect().bottom);
	};

	return JSON.stringify({
		// The main element is the shell's own landmark: a route that served no
		// document has none, which is the observer's failure rather than the page's.
		loaded: document.querySelector("main") !== null,
		missing: Required.filter((Selector) => document.querySelector(Selector) === null),
		provenance: Box(".provenance"),
		drawer: Box(".drawer"),
		publish: Box(".publish"),
		bento: Box(".bento"),
		rail: Box(".rail"),
		swimlanes: Box(".swimlanes"),
		spectrometer: Box(".spectrometer"),
		status: Box(".status"),
		statusList: Box(".status__list"),
		security: Box(".security"),
		marks: Box(".security__marks"),
		bandCount: Bands.length,
		bandHeights: Bands.map((Band) => Math.round(Band.getBoundingClientRect().height)),
		bandOrder: [".swimlanes", ".spectrometer", ".status"].map((Selector) => {
			const Element = document.querySelector(Selector);
			return Element === null ? -1 : Math.round(Element.getBoundingClientRect().y);
		}),
		gaps: [Gap(".bento", ".swimlanes"), Gap(".swimlanes", ".spectrometer"), Gap(".spectrometer", ".status")],
		laneAir: Lanes.length < 2 ? -1 : Math.round(Lanes[1].y - Lanes[0].bottom),
		canvasGap: Canvas === null ? null : Math.round(parseFloat(getComputedStyle(Canvas).rowGap)),
		statusWords: [...document.querySelectorAll(".status__value")].map((Value) => Value.textContent.trim()),
		seamBackground: Seam === null ? null : getComputedStyle(Seam).backgroundColor,
		seamNote: document.querySelector(".publish__note")?.textContent?.trim(),
		seamState: document.querySelector(".publish__control")?.dataset.controlState,
		seamDisabled: document.querySelector(".publish__control")?.getAttribute("aria-disabled"),
	});
})()`;

/** Serve the build on a private port until the process ends. */
async function serve(Directory) {
	const Server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
		cwd: Directory,
		stdio: "ignore",
	});
	process.on("exit", () => Server.kill());
	await sleep(1200);

	return Server;
}

/** The newest write under a directory, in milliseconds. */
function newest(Directory) {
	let Latest = 0;

	for (const Entry of readdirSync(Directory, { withFileTypes: true })) {
		const Path = resolve(Directory, Entry.name);

		try {
			Latest = Math.max(Latest, Entry.isDirectory() ? newest(Path) : statSync(Path).mtimeMs);
		} catch {
			// A build that is writing deletes entries between the read and the stat.
			// That is the unsettled tree the caller is watching for, so the scan
			// reports "moving" instead of dying on a vanished file.
			return Date.now();
		}
	}

	return Latest;
}

/**
 * Wait for the build to stop writing, then copy the tree aside.
 *
 * `astro build` empties the output directory before it writes, so a probe that
 * serves the live `Target/` while another build runs reports every route as
 * serving no document - a total failure that lives in the observer, not the
 * page.
 *
 * A quiet mtime says the tree is not being written now, not that it stays quiet,
 * so the copy is kept only when the newest write under the directory did not move
 * across it. A tree that never settles is a blocker: copying it anyway would hand
 * the assertions a half-built page and report the build's own progress as a page
 * defect.
 */
async function snapshot(Directory) {
	const Deadline = Date.now() + 180_000;

	if (!existsSync(Directory)) {
		throw new Error(`no built site at ${Directory}; run \`pnpm run build\` first`);
	}

	for (;;) {
		while (Date.now() < Deadline && Date.now() - newest(Directory) < 1500) await sleep(500);

		if (Date.now() >= Deadline) {
			throw new Error(
				`the build under ${Directory} never settled: it was still being written after 180s - ` +
					"wait for `pnpm run build` to finish, then probe again",
			);
		}

		const Before = newest(Directory);
		const Copy = mkdtempSync(resolve(tmpdir(), "verify-composition-"));
		cpSync(Directory, Copy, { recursive: true });

		if (newest(Directory) === Before) return Copy;

		rmSync(Copy, { recursive: true, force: true });
		await sleep(500);
	}
}

/** One CDP round trip: open a background tab, read the frame, close it. */
async function measure(Url) {
	const Tabs = await (await fetch(`${CDP}/json/list`)).json();
	const Before = new Set(Tabs.map((Tab) => Tab.id));
	const Version = await (await fetch(`${CDP}/json/version`)).json();

	const Browser = new WebSocket(Version.webSocketDebuggerUrl);
	const Pending = new Map();
	let Id = 0;
	const Send = (Socket, Method, Params = {}) =>
		new Promise((Done) => {
			const Key = ++Id;
			Pending.set(Key, Done);
			Socket.send(JSON.stringify({ id: Key, method: Method, params: Params }));
		});

	await new Promise((Done, Fail) => {
		Browser.onopen = Done;
		Browser.onerror = Fail;
	});
	Browser.onmessage = (Event) => {
		const Message = JSON.parse(Event.data);
		Pending.get(Message.id)?.(Message);
		Pending.delete(Message.id);
	};

	await Send(Browser, "Target.createTarget", { url: "about:blank", background: true });
	await sleep(600);

	const Page = (await (await fetch(`${CDP}/json/list`)).json()).find(
		(Tab) => !Before.has(Tab.id) && Tab.type === "page",
	);
	if (Page === undefined) throw new Error("the browser opened no tab");

	const Tab = new WebSocket(Page.webSocketDebuggerUrl);
	const TabPending = new Map();
	const TabSend = (Method, Params = {}) =>
		new Promise((Done) => {
			const Key = ++Id;
			TabPending.set(Key, Done);
			Tab.send(JSON.stringify({ id: Key, method: Method, params: Params }));
		});

	await new Promise((Done, Fail) => {
		Tab.onopen = Done;
		Tab.onerror = Fail;
	});
	Tab.onmessage = (Event) => {
		const Message = JSON.parse(Event.data);
		TabPending.get(Message.id)?.(Message);
		TabPending.delete(Message.id);
	};

	await TabSend("Page.enable");
	await TabSend("Emulation.setDeviceMetricsOverride", {
		width: 1440,
		height: 1300,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await TabSend("Page.navigate", { url: Url });
	await sleep(4000);

	const Read = await TabSend("Runtime.evaluate", { expression: Probe, returnByValue: true });

	await Send(Browser, "Target.closeTarget", { targetId: Page.id });
	Tab.close();
	Browser.close();

	// A probe that threw inside the page comes back with no value, and the exception
	// text sits beside it. Reading the reply instead of trusting it is what keeps a
	// browser fault in the blocker class and a page defect out of it.
	const Value = Read?.result?.result?.value;

	if (typeof Value !== "string") {
		const Exception =
			Read?.result?.exceptionDetails?.exception?.description ??
			Read?.result?.result?.description ??
			JSON.stringify(Read);

		throw new Error(`the probe returned no JSON from ${Url}: ${Exception}`);
	}

	let Measured;

	try {
		Measured = JSON.parse(Value);
	} catch {
		throw new Error(
			`the probe returned something that is not JSON from ${Url}: ${Value.slice(0, 200)}`,
		);
	}

	// A route that served no document is the observer's failure - a build mid-write,
	// or a URL that names no page - never a page that lost a part.
	if (Measured.loaded === false) {
		throw new Error(
			`the route served no document (${Url}): the build may still be writing - ` +
				"wait for `pnpm run build`, then probe again",
		);
	}

	return Measured;
}

const Args = process.argv.slice(2);
const Given = Args.includes("--url") ? Args[Args.indexOf("--url") + 1] : null;
const Root = root();
let Server = null;

try {
	let Url = Given;

	if (Url === null) {
		if (Root === null) {
			console.error("blocker: no built site above this script; run `pnpm run build` first");
			process.exit(2);
		}

		Server = await serve(await snapshot(resolve(Root, "Target")));
		// A cache-busted URL, because Chromium keeps the previous document across a
		// rebuild: an unparameterised probe reports the page that used to exist.
		Url = `http://127.0.0.1:${PORT}/Workspace/?v=${Date.now()}`;
	}

	try {
		await fetch(`${CDP}/json/version`);
	} catch {
		console.error(
			`blocker: no browser on ${CDP}. Start one with:\n` +
				`  ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell \\\n` +
				`    --headless --remote-debugging-port=9222 --no-first-run --disable-gpu --user-data-dir=/tmp/cdp-verify about:blank`,
		);
		process.exit(2);
	}

	const Box = await measure(Url);
	let Failed = 0;

	// An absent part is the page's defect, not a precondition, so it is named before
	// the rows that read through it: a reader sees which component disappeared, not
	// only that a number came back wrong.
	for (const Selector of Box.missing ?? []) console.log(`ABSENT  ${Selector} is not in the page`);

	for (const [Label, Read, Want, Test] of Frame) {
		let Got;
		let Expected;
		let Absent = null;

		try {
			Got = Read(Box);
			Expected = typeof Want === "function" ? Want(Box) : Want;

			if (Got === undefined || Got === null || Expected === undefined || Expected === null) {
				Absent = "the element it reads is not in the page";
			}
		} catch (Error) {
			// A reader that dereferences a missing box throws here. That is a failed
			// invariant, not a blocked run: the run happened, and the page was wrong.
			Absent = Error.message;
		}

		if (Absent !== null) {
			Failed++;
			console.log(`ABSENT  ${Label.padEnd(42)} absent - ${Absent}`);
			continue;
		}

		const Held = Test === undefined ? Got === Expected : Test(Got, Expected);

		if (!Held) Failed++;
		console.log(
			`${Held ? "PASS" : "FAIL"}  ${Label.padEnd(42)} ${Got}${Held ? "" : ` (want ${Expected})`}`,
		);
	}

	// A selector an invariant names that the probe could not find fails the run even
	// if every row that reads through it somehow held.
	if (Failed === 0 && (Box.missing ?? []).length > 0) Failed = 1;

	console.log(
		`\n${Failed === 0 ? "RESULT: the composition matches the spec" : `RESULT: ${Failed} invariant(s) broke`}`,
	);
	process.exit(Failed === 0 ? 0 : 1);
} catch (Error) {
	console.error(`blocker: ${Error.message}`);
	process.exit(2);
} finally {
	Server?.kill();
}
