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
 * build or a missing browser is not the page's fault.
 *
 *   node verify-composition.mjs              # serve ./Target and probe it
 *   node verify-composition.mjs --url <u>    # probe a server already running
 *   CDP_URL=http://127.0.0.1:9223 node ...   # a browser on another port
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

	// Measured from the unrounded rects: a band's height lands on a fraction of a
	// pixel often enough that rounding both edges first turns a 20px gap into 21.
	const Gap = (Above, Below) => {
		const Top = document.querySelector(Above);
		const Bottom = document.querySelector(Below);
		if (Top === null || Bottom === null) return -1;
		return Math.round(Bottom.getBoundingClientRect().y - Top.getBoundingClientRect().bottom);
	};

	return JSON.stringify({
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
		canvasGap: Math.round(parseFloat(getComputedStyle(Canvas).rowGap)),
		statusWords: [...document.querySelectorAll(".status__value")].map((Value) => Value.textContent.trim()),
		seamBackground: getComputedStyle(document.querySelector(".publish")).backgroundColor,
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

	return JSON.parse(Read.result.result.value);
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

		Server = await serve(resolve(Root, "Target"));
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

	for (const [Label, Read, Want, Test] of Frame) {
		const Got = Read(Box);
		const Expected = typeof Want === "function" ? Want(Box) : Want;
		const Held = Test === undefined ? Got === Expected : Test(Got, Expected);

		if (!Held) Failed++;
		console.log(
			`${Held ? "PASS" : "FAIL"}  ${Label.padEnd(42)} ${Got}${Held ? "" : ` (want ${Expected})`}`,
		);
	}

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
