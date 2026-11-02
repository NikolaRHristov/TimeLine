// Archived tool: workspace-store-audit.mjs
//
// What it does: Prove one workspace store is shared by two islands, and that a failed session read is one warning.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
// Archived: 2026-11-02 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
/**
 * Audit the workspace store in a real browser: one store, two islands.
 *
 * The workspace page mounts a rail island and a body island. The store is one
 * module, so a press on a rail band has to be visible in the body beside it - the
 * seam names the stage the rail landed on. A signal inside each component would
 * leave the seam naming the old stage, which is the defect this exists to catch.
 *
 * Three passes, each in its own tab against the same build:
 *
 * 1. anonymous - no session element. Both islands hydrate, a band press moves the
 *    seam's stage across the island boundary, and hydration logs nothing.
 * 2. malformed - a session element that is not JSON. The store keeps its
 *    anonymous slot and the session layer says so exactly once, as a warning.
 * 3. session - a valid session element. The drawer names the identity, the state
 *    line leaves `static`, and a publish crosses the seam and lands a tile.
 *
 * The pass is falsifiable by construction: pass 1 asserts that the seam names a
 * *different* stage after the press, so a store that is not shared fails it.
 *
 * Usage
 * -----
 *     node workspace-store-audit.mjs                    # serve ./Target
 *     node workspace-store-audit.mjs --root ../Target
 *     node workspace-store-audit.mjs --browser "/path/to/Chrome"
 *     node workspace-store-audit.mjs --json             # machine-readable
 *
 * The browser is `--browser`, then `$WORKSPACE_AUDIT_BROWSER`, then the first
 * installed candidate. Exit code 0 means every pass held; 1 means at least one
 * check failed or the audit could not run.
 */

import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

// ---------------------------------------------------------------------------
// The page under test
// ---------------------------------------------------------------------------

const ROUTE = "/Workspace/";

/** The element a page embeds its session in; the same id `Session/Embed.ts` reads. */
const SESSION_ELEMENT = "Workspace-Session";

/** The stage the page's rail opens on, and the one a single press lands on. */
const OPENS_ON = "Source";
const PRESSES_TO = "Ingestion";

/** A session payload the session layer accepts, and one it cannot parse. */
const SESSION = {
	Identity: { Id: "audit-identity", Name: "auditor", PublicKey: "audit-public-key" },
	Memberships: [],
};

const ContentTypes = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".xml": "application/xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".webmanifest": "application/manifest+json",
	".ico": "image/x-icon",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArguments(argv) {
	const options = {
		Root: resolve(process.cwd(), "Target"),
		Browser: null,
		Json: false,
		Keep: false,
		Timeout: 20_000,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		const value = () => {
			const next = argv[index + 1];
			if (next === undefined) throw new Error(`${flag} needs a value`);
			index += 1;
			return next;
		};

		switch (flag) {
			case "--root":
				options.Root = resolve(process.cwd(), value());
				break;
			case "--browser":
				options.Browser = value();
				break;
			case "--timeout":
				options.Timeout = Number(value());
				break;
			case "--json":
				options.Json = true;
				break;
			case "--keep":
				options.Keep = true;
				break;
			case "--help":
			case "-h":
				options.Help = true;
				break;
			default:
				throw new Error(`unknown flag ${flag}`);
		}
	}

	return options;
}

// ---------------------------------------------------------------------------
// Static server, with the session element injected for the two session passes
//
// A page that has a session embeds it; the build has none, so the audit serves
// the same HTML with one element spliced in. Injecting on the server rather than
// in the browser is what makes it deterministic: the element is in the document
// before any island script runs, so there is no race with hydration.
// ---------------------------------------------------------------------------

function serve(root) {
	const server = createServer((request, response) => {
		let url;
		try {
			url = new URL(request.url ?? "/", "http://audit");
		} catch {
			response.writeHead(400).end("bad request");
			return;
		}

		let path = decodeURIComponent(url.pathname);
		if (path.endsWith("/")) path += "index.html";

		const file = normalize(join(root, path));
		if (!file.startsWith(root)) {
			response.writeHead(403).end("outside the build");
			return;
		}

		response.setHeader("Cache-Control", "no-store");
		response.setHeader(
			"Content-Type",
			ContentTypes[extname(file)] ?? "application/octet-stream",
		);

		const payload = url.searchParams.get("session");

		if (payload === null || extname(file) !== ".html") {
			createReadStream(file)
				.on("error", () => {
					response.writeHead(404).end("not found");
				})
				.pipe(response);
			return;
		}

		readFile(file, "utf8")
			.then((html) => {
				const element = `<script type="application/json" id="${SESSION_ELEMENT}">${payload}</script>`;
				response.end(html.replace("</body>", `${element}</body>`));
			})
			.catch(() => {
				response.writeHead(404).end("not found");
			});
	});

	return new Promise((resolveServer, rejectServer) => {
		server.on("error", rejectServer);
		server.listen(0, "127.0.0.1", () => {
			resolveServer({ server, origin: `http://127.0.0.1:${server.address().port}` });
		});
	});
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

function findBrowser(explicit) {
	if (explicit !== null) {
		if (!existsSync(explicit)) throw new Error(`no browser at ${explicit}`);
		return explicit;
	}

	if (process.env["WORKSPACE_AUDIT_BROWSER"]) {
		const candidate = process.env["WORKSPACE_AUDIT_BROWSER"];
		if (!existsSync(candidate)) {
			throw new Error(`WORKSPACE_AUDIT_BROWSER names a missing binary: ${candidate}`);
		}
		return candidate;
	}

	const home = process.env["HOME"] ?? "";
	const candidates = [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
	];

	if (home !== "") {
		for (const cache of [
			join(home, "Library", "Caches", "ms-playwright"),
			join(home, ".cache", "ms-playwright"),
		]) {
			if (!existsSync(cache)) continue;
			for (const entry of readdirSyncSafe(cache).sort()) {
				if (!entry.startsWith("chromium-")) continue;
				candidates.push(
					join(
						cache,
						entry,
						"chrome-mac-arm64",
						"Google Chrome for Testing.app",
						"Contents",
						"MacOS",
						"Google Chrome for Testing",
					),
					join(
						cache,
						entry,
						"chrome-mac-x64",
						"Google Chrome for Testing.app",
						"Contents",
						"MacOS",
						"Google Chrome for Testing",
					),
					join(
						cache,
						entry,
						"chrome-mac",
						"Chromium.app",
						"Contents",
						"MacOS",
						"Chromium",
					),
					join(cache, entry, "chrome-linux", "chrome"),
				);
			}
		}
	}

	const found = candidates.find((candidate) => existsSync(candidate));
	if (found === undefined) {
		throw new Error("no Chromium found; pass --browser <path> or set WORKSPACE_AUDIT_BROWSER");
	}
	return found;
}

function readdirSyncSafe(path) {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
}

/**
 * Start a headless browser on its own profile.
 *
 * A fresh temporary profile means the audit never inherits a service worker, a
 * cookie or a cache from a previous run - and `--remote-debugging-port=0` makes
 * the port a runtime fact Chromium writes into `DevToolsActivePort`.
 */
async function launch(browser, timeout) {
	const profile = await mkdtemp(join(tmpdir(), "workspace-audit-"));
	const child = spawn(
		browser,
		[
			"--headless=new",
			"--disable-gpu",
			"--hide-scrollbars",
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-extensions",
			"--disable-sync",
			"--disable-background-networking",
			"--disable-component-update",
			"--disable-default-apps",
			"--disable-dev-shm-usage",
			"--window-size=1280,900",
			"--remote-debugging-port=0",
			`--user-data-dir=${profile}`,
			"about:blank",
		],
		{ stdio: "ignore" },
	);

	const portFile = join(profile, "DevToolsActivePort");
	const deadline = Date.now() + timeout;
	let port = null;

	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`the browser exited with code ${child.exitCode} before opening a port`);
		}
		try {
			const first = Number((await readFile(portFile, "utf8")).split("\n")[0]);
			if (Number.isInteger(first) && first > 0) {
				port = first;
				break;
			}
		} catch {
			// Not written yet.
		}
		await sleep(100);
	}

	if (port === null) {
		child.kill("SIGTERM");
		throw new Error("the browser never wrote DevToolsActivePort");
	}

	return { child, profile, port };
}

// ---------------------------------------------------------------------------
// CDP
// ---------------------------------------------------------------------------

class Connection {
	constructor(url, timeout) {
		this.timeout = timeout;
		this.sequence = 0;
		this.pending = new Map();
		this.listeners = new Map();
		this.closed = false;

		this.socket = new WebSocket(url);
		this.opened = new Promise((resolveOpen, rejectOpen) => {
			const timer = setTimeout(
				() => rejectOpen(new Error("the browser websocket timed out")),
				timeout,
			);
			this.socket.addEventListener("open", () => {
				clearTimeout(timer);
				resolveOpen();
			});
			this.socket.addEventListener("error", () => {
				clearTimeout(timer);
				rejectOpen(new Error("the browser websocket refused the connection"));
			});
		});

		this.socket.addEventListener("message", (event) => {
			let message;
			try {
				message = JSON.parse(String(event.data));
			} catch {
				return;
			}

			if (typeof message.id === "number") {
				const entry = this.pending.get(message.id);
				if (entry === undefined) return;
				this.pending.delete(message.id);
				clearTimeout(entry.timer);
				if (message.error !== undefined) {
					entry.reject(new Error(`${entry.method}: ${message.error.message}`));
					return;
				}
				entry.resolve(message.result);
				return;
			}

			if (typeof message.method === "string") {
				for (const handler of this.listeners.get(message.method) ?? []) handler(message);
			}
		});

		const fail = () => {
			this.closed = true;
			for (const [, entry] of this.pending) {
				clearTimeout(entry.timer);
				entry.reject(new Error("the browser connection closed"));
			}
			this.pending.clear();
		};
		this.socket.addEventListener("close", fail);
		this.socket.addEventListener("error", fail);
	}

	async send(method, params = {}, sessionId) {
		await this.opened;
		if (this.closed) throw new Error(`${method}: the browser connection is closed`);

		const id = (this.sequence += 1);
		return new Promise((resolveSend, rejectSend) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				rejectSend(new Error(`${method} timed out`));
			}, this.timeout);

			this.pending.set(id, { method, resolve: resolveSend, reject: rejectSend, timer });
			this.socket.send(
				JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
			);
		});
	}

	on(method, handler) {
		const set = this.listeners.get(method) ?? new Set();
		set.add(handler);
		this.listeners.set(method, set);
	}

	off(method, handler) {
		this.listeners.get(method)?.delete(handler);
	}

	close() {
		this.closed = true;
		try {
			this.socket.close();
		} catch {
			// Already gone.
		}
	}
}

// ---------------------------------------------------------------------------
// One pass
// ---------------------------------------------------------------------------

/** Everything a check reads, in one round trip. */
const PROBE = `(() => {
	const Text = (selector) => {
		const element = document.querySelector(selector);
		return element === null ? "" : (element.textContent || "").replace(/\\s+/g, " ").trim();
	};
	const Count = (selector) => document.querySelectorAll(selector).length;
	const Islands = Array.from(document.querySelectorAll("astro-island"));
	return {
		islands: Islands.length,
		hydrated: Islands.filter((island) => !island.hasAttribute("ssr")).length,
		bands: Count(".provenance__band"),
		seam: Text(".publish__note"),
		seamState: document.querySelector(".publish__control")?.getAttribute("data-control-state") ?? "",
		state: Text(".context__state-word"),
		hint: Text(".drawer__hint-text"),
		rows: Count(".drawer-column .drawer-item:not(.drawer-item--ghost)"),
		filled: Count(".bento__tile--filled"),
		pressed: Array.from(document.querySelectorAll('.provenance__band[aria-pressed="true"]')).map(
			(band) => (band.textContent || "").replace(/\\s+/g, " ").trim(),
		),
	};
})()`;

/** Click the first element matching a selector, and say whether one was found. */
function click(selector) {
	return `(() => {
		const element = document.querySelector(${JSON.stringify(selector)});
		if (element === null) return false;
		element.click();
		return true;
	})()`;
}

/**
 * Open a drawer row the canvas does not already hold, then publish it.
 *
 * A publish places the open record, or the column's first row when nothing is
 * open, and a record already on the canvas is opened rather than placed twice.
 * Choosing a row that is not on the canvas is what makes the step measure a
 * placement instead of the "already published" branch.
 */
const PUBLISH = `(() => {
	const Text = (element) => (element === null ? "" : (element.textContent || "").trim());
	// The canvas truncates a title at 64 characters and the drawer at 34, so the
	// two strings differ for the same record: compare the opening of each.
	const Key = (text) => text.slice(0, 12);
	const placed = new Set(
		Array.from(document.querySelectorAll(".bento__tile--filled .bento__title"))
			.map(Text)
			.map(Key),
	);

	for (const column of Array.from(document.querySelectorAll(".drawer-column"))) {
		const ghost = column.querySelector(".drawer-item--ghost");
		if (ghost === null) continue;

		const row = Array.from(column.querySelectorAll(".drawer-item")).find(
			(candidate) =>
				!candidate.classList.contains("drawer-item--ghost") &&
				!placed.has(Key(Text(candidate.querySelector(".drawer-item__title")))),
		);

		if (row === undefined) continue;

		row.click();
		ghost.click();
		return true;
	}

	return false;
})()`;

/** Click the rail band whose printed label starts with a stage name. */
function clickBand(name) {
	return `(() => {
		const band = Array.from(document.querySelectorAll(".provenance__band")).find((candidate) =>
			(candidate.textContent || "").trim().startsWith(${JSON.stringify(name)}),
		);
		if (band === undefined) return false;
		band.click();
		return true;
	})()`;
}

async function pass(connection, options, { name, query, steps }) {
	const created = await connection.send("Target.createTarget", { url: "about:blank" });
	const targetId = created.targetId;
	let sessionId = null;
	const console_ = [];

	try {
		const attached = await connection.send("Target.attachToTarget", {
			targetId,
			flatten: true,
		});
		sessionId = attached.sessionId;
		const page = (method, params) => connection.send(method, params, sessionId);

		// Console and exception capture is installed before the navigation so a
		// message emitted during hydration cannot be missed.
		const onConsole = (message) => {
			if (message.sessionId !== sessionId) return;
			const params = message.params;
			const kind = params.type;
			if (kind !== "warning" && kind !== "error" && kind !== "assert") return;
			console_.push({
				kind,
				text: (params.args ?? [])
					.map((argument) => argument.value ?? argument.description ?? "")
					.join(" ")
					.trim(),
			});
		};
		const onException = (message) => {
			if (message.sessionId !== sessionId) return;
			console_.push({
				kind: "exception",
				text: message.params.exceptionDetails?.text ?? "exception",
			});
		};
		const onLog = (message) => {
			if (message.sessionId !== sessionId) return;
			const entry = message.params.entry;
			if (entry.level !== "error" && entry.level !== "warning") return;
			console_.push({ kind: entry.level, text: entry.text ?? "" });
		};

		connection.on("Runtime.consoleAPICalled", onConsole);
		connection.on("Runtime.exceptionThrown", onException);
		connection.on("Log.entryAdded", onLog);

		await page("Page.enable");
		await page("Runtime.enable");
		await page("Log.enable");
		await page("Network.enable");
		await page("Network.setBypassServiceWorker", { bypass: true });
		await page("Emulation.setDeviceMetricsOverride", {
			width: 1280,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await page("Page.bringToFront");
		await page("Emulation.setFocusEmulationEnabled", { enabled: true });

		const loaded = new Promise((resolveLoad) => {
			const handler = (message) => {
				if (message.method === "Page.loadEventFired" && message.sessionId === sessionId) {
					connection.off("Page.loadEventFired", handler);
					resolveLoad();
				}
			};
			connection.on("Page.loadEventFired", handler);
		});

		await page("Page.navigate", { url: `${options.origin}${ROUTE}?audit=${name}${query}` });
		await Promise.race([loaded, sleep(options.Timeout)]);

		// `client:visible` hydrates through an IntersectionObserver, and a target
		// that lost the foreground during navigation never observes anything. The
		// tab is brought forward again after the load, then every island is waited
		// for; a pass that still never hydrates reports that instead of measuring a
		// static render.
		await page("Page.bringToFront");
		await page("Emulation.setFocusEmulationEnabled", { enabled: true });

		const deadline = Date.now() + Math.min(options.Timeout, 12_000);
		while (Date.now() < deadline) {
			const pending = await page("Runtime.evaluate", {
				expression: 'document.querySelectorAll("astro-island[ssr]").length',
				returnByValue: true,
			});
			if ((pending.result.value ?? 0) === 0) break;
			await sleep(100);
		}
		await sleep(250);

		const before = await evaluate(page, PROBE);
		const observed = [];

		for (const step of steps) {
			const found = await evaluate(page, step.Click);
			await sleep(200);
			observed.push({ Name: step.Name, Found: found, After: await evaluate(page, PROBE) });
		}

		connection.off("Runtime.consoleAPICalled", onConsole);
		connection.off("Runtime.exceptionThrown", onException);
		connection.off("Log.entryAdded", onLog);

		return { Pass: name, Before: before, Steps: observed, Console: console_ };
	} finally {
		if (sessionId !== null) {
			await connection.send("Target.detachFromTarget", { sessionId }).catch(() => {});
		}
		await connection.send("Target.closeTarget", { targetId }).catch(() => {});
	}
}

async function evaluate(page, expression) {
	const evaluated = await page("Runtime.evaluate", { expression, returnByValue: true });
	if (evaluated.exceptionDetails !== undefined) {
		throw new Error(`the probe threw: ${evaluated.exceptionDetails.text ?? "unknown"}`);
	}
	return evaluated.result.value;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

function judge(result) {
	const failures = [];
	const warnings = [];
	const { Pass: name, Before: before, Steps: steps, Console: console_ } = result;

	const errors = console_.filter((entry) => entry.kind !== "warning");
	const says = console_.filter((entry) => entry.kind === "warning");

	if (before.islands < 2) {
		failures.push(`${before.islands} island(s) on the page; the proof needs two`);
	}
	if (before.hydrated !== before.islands) {
		failures.push(
			`${before.islands - before.hydrated} island(s) never hydrated, so nothing was measured`,
		);
	}
	if (before.bands < 1) {
		failures.push("the rail drew no bands, so there is nothing to press");
	}

	if (errors.length > 0) {
		failures.push(
			`hydration logged ${errors.length} error(s): ${errors.map((entry) => entry.text).join(" | ")}`,
		);
	}

	if (name === "anonymous") {
		if (says.length > 0) {
			warnings.push(
				`an anonymous page logged ${says.length} warning(s): ${says.map((entry) => entry.text).join(" | ")}`,
			);
		}
		if (before.state !== "static") {
			failures.push(
				`the state line reads "${before.state}" with no session; expected static`,
			);
		}
		if (before.seamState !== "locked") {
			failures.push(
				`the seam is "${before.seamState}" with no identity; a drop that cannot cross is locked`,
			);
		}
		if (before.seam.includes(OPENS_ON)) {
			failures.push(`a locked seam still offers the verb: "${before.seam}"`);
		}

		const publish = steps[0];
		if (
			publish !== undefined &&
			publish.Found === true &&
			publish.After.filled !== before.filled
		) {
			failures.push(
				"an anonymous publish changed the canvas; the seam is supposed to refuse it",
			);
		}
	}

	if (name === "malformed") {
		if (says.length !== 1) {
			failures.push(
				`a failed session read logged ${says.length} warning(s); expected exactly one: ${says.map((entry) => entry.text).join(" | ")}`,
			);
		}
		if (before.state !== "static") {
			failures.push(
				`a failed session read left the state at "${before.state}"; expected static`,
			);
		}
		if (before.hint.includes("@")) {
			failures.push(`a failed session read still named an identity: "${before.hint}"`);
		}
	}

	if (name === "session") {
		if (says.length > 0) {
			warnings.push(
				`a readable session logged ${says.length} warning(s): ${says.map((entry) => entry.text).join(" | ")}`,
			);
		}
		if (!before.hint.includes("@auditor")) {
			failures.push(`the drawer does not name the identity it read: "${before.hint}"`);
		}
		if (before.state !== "snapshot") {
			failures.push(`a read session left the state at "${before.state}"; expected snapshot`);
		}
		if (before.seamState === "locked") {
			failures.push("a session that names an identity left the seam locked");
		}
		if (!before.seam.includes(OPENS_ON)) {
			failures.push(`the seam does not name ${OPENS_ON} before a press: "${before.seam}"`);
		}

		// The rail island dispatches; the body island renders. A store that is not
		// shared leaves the seam naming the stage it opened on.
		const press = steps[0];
		if (press === undefined || press.Found !== true) {
			failures.push(`no rail band prints ${PRESSES_TO}, so the cross-island press never ran`);
		} else {
			if (!press.After.seam.includes(PRESSES_TO)) {
				failures.push(
					`the seam still reads "${press.After.seam}" after the rail selected ${PRESSES_TO} - the two islands do not share the store`,
				);
			}
			if (press.After.seam === before.seam) {
				failures.push("the seam did not change at all across the island boundary");
			}
			if (!press.After.pressed.some((band) => band.startsWith(PRESSES_TO))) {
				failures.push(`the rail itself did not mark ${PRESSES_TO} as pressed`);
			}
		}

		const publish = steps[1];
		if (publish === undefined || publish.Found !== true) {
			if (before.rows === 0) {
				warnings.push(
					"the archive holds no drawer rows, so the publish was not measured; a fresh clone is a normal state",
				);
			} else {
				failures.push("no drop ghost on the drawer, so the publish never ran");
			}
		} else if (publish.After.filled !== before.filled + 1) {
			failures.push(
				`a published record left ${publish.After.filled} filled tiles, from ${before.filled}; expected one more`,
			);
		}
	}

	return {
		Pass: name,
		Status: failures.length === 0 ? "pass" : "fail",
		Failures: failures,
		Warnings: warnings,
		Console: console_,
		Before: before,
		Steps: steps,
	};
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function audit(options) {
	if (!existsSync(options.Root)) {
		throw new Error(
			`no build directory at ${options.Root}; run the build first or pass --root`,
		);
	}

	const { server, origin } = await serve(options.Root);
	const browser = findBrowser(options.Browser);
	const launched = await launch(browser, options.Timeout);
	let connection = null;

	try {
		const version = await (async () => {
			const deadline = Date.now() + options.Timeout;
			while (Date.now() < deadline) {
				try {
					const response = await fetch(`http://127.0.0.1:${launched.port}/json/version`);
					if (response.ok) return await response.json();
				} catch {
					// Still starting.
				}
				await sleep(100);
			}
			throw new Error("the browser never answered /json/version");
		})();

		connection = new Connection(version.webSocketDebuggerUrl, options.Timeout);
		await connection.opened;

		const shared = { origin, timeout: options.Timeout };
		const results = [];

		// A tab can lose the foreground to the tab the previous pass closed, and an
		// island that was never observed never hydrates. That is a property of the
		// harness, not of the page, so a pass whose islands did not hydrate is run
		// once more before its verdict stands.
		const run = async (spec) => {
			let result = await pass(connection, shared, spec);

			if (result.Before.hydrated !== result.Before.islands) {
				await sleep(300);
				result = await pass(connection, shared, spec);
			}

			return result;
		};

		results.push(
			await run({
				name: "anonymous",
				query: "",
				steps: [{ Name: "publish a drawer row", Click: PUBLISH }],
			}),
		);

		results.push(
			await run({
				name: "malformed",
				query: `&session=${encodeURIComponent("{ not json")}`,
				steps: [],
			}),
		);

		results.push(
			await run({
				name: "session",
				query: `&session=${encodeURIComponent(JSON.stringify(SESSION))}`,
				steps: [
					{ Name: `press ${PRESSES_TO} in the rail`, Click: clickBand(PRESSES_TO) },
					{ Name: "publish a drawer row", Click: PUBLISH },
				],
			}),
		);

		return {
			results: results.map(judge),
			meta: { Origin: origin, Browser: browser, Root: options.Root },
		};
	} finally {
		connection?.close();
		launched.child.kill("SIGTERM");
		server.close();
		if (!options.Keep) {
			await sleep(300);
			await rm(launched.profile, { recursive: true, force: true }).catch(() => {});
		}
	}
}

function report(results, meta) {
	const lines = [`workspace store audit  origin=${meta.Origin}  browser=${meta.Browser}`];

	for (const result of results) {
		lines.push(
			`  ${result.Status === "pass" ? "PASS" : "FAIL"}  ${result.Pass.padEnd(10)} ` +
				`islands=${result.Before.islands} hydrated=${result.Before.hydrated} ` +
				`state=${result.Before.state} tiles=${result.Before.filled}`,
		);
		for (const failure of result.Failures) lines.push(`        - ${failure}`);
		for (const warning of result.Warnings) lines.push(`        ~ ${warning}`);
		for (const step of result.Steps) {
			lines.push(
				`        · ${step.Name}: ${step.Found === true ? "ran" : "not found"} ` +
					`tiles=${step.After.filled} seam="${step.After.seam}"`,
			);
		}
	}

	const passed = results.filter((result) => result.Status === "pass").length;
	lines.push("", `${results.length} passes: ${passed} pass, ${results.length - passed} fail`);

	return lines.join("\n");
}

function sleep(ms) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

const options = parseArguments(process.argv.slice(2));

if (options.Help) {
	console.log(
		"node workspace-store-audit.mjs [--root <dir>] [--browser <path>] [--json] [--keep] [--timeout <ms>]",
	);
	process.exit(0);
}

audit(options)
	.then(({ results, meta }) => {
		if (options.Json) {
			console.log(
				JSON.stringify(
					{ meta, results, failed: results.some((r) => r.Status === "fail") },
					null,
					2,
				),
			);
		} else {
			console.log(report(results, meta));
		}
		process.exit(results.some((result) => result.Status === "fail") ? 1 : 0);
	})
	.catch((error) => {
		console.error(
			`workspace store audit could not run: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	});
