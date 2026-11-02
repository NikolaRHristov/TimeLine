// Archived tool: no-js-audit.mjs
//
// What it does: Load every built route twice over CDP, scripts off and on, and fail when content waits for hydration.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
// Archived: 2026-11-02 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
/**
 * Audit the built site with JavaScript switched off.
 *
 * The site is a static archive behind a service worker, so a reader whose
 * browser never runs a script must still see the tiles, the rows and the
 * headings. This script loads every built route twice over CDP - once with
 * `Emulation.setScriptExecutionDisabled` and once normally - and compares what
 * each pass renders. Content that exists only in the second pass is a defect,
 * not a nicety: it means the first paint waited for a bundle.
 *
 * Why a real browser and not an HTML parse: "visible" is a layout fact. A
 * selector that matches a node inside `display: none`, a closed `<template>` or
 * a zero-height wrapper is present in the markup and absent from the page, and
 * only a renderer can tell the two apart.
 *
 * Usage
 * -----
 *     node no-js-audit.mjs                     # serve ./Target and audit every route
 *     node no-js-audit.mjs --root ../Target    # another build directory
 *     node no-js-audit.mjs --origin http://127.0.0.1:9999   # an already-served site
 *     node no-js-audit.mjs --route /Workspace/ # one route
 *     node no-js-audit.mjs --json              # machine-readable report
 *     node no-js-audit.mjs --browser "/path/to/Chrome"
 *
 * Configuration comes from the environment, never from this file: the browser
 * binary is `--browser`, then `$NO_JS_AUDIT_BROWSER`, then the first installed
 * candidate. A checkout on another machine therefore needs no edit.
 *
 * Exit code 0 means every discovered route passed. Exit code 1 means at least
 * one route failed or the audit could not run at all - a route that cannot be
 * measured is reported, never skipped.
 */

import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, relative, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Routes and what each one must show before a script runs.
//
// `Path` uses `:name` for a segment a build generates (`/Bookmark/:Id/`). Every
// built route is audited; a route with no profile still gets the generic checks
// and is reported as generic, so a new page cannot slip through unnoticed.
//
// `Require` is a minimum visible count per selector. `Some` is a set of
// alternatives, at least one of which must hold - that is how an empty archive
// passes: the page shows rows when there is content and a note when there is
// none, and both are complete first paints.
// ---------------------------------------------------------------------------

const Profiles = [
	{
		Path: "/",
		Title: "h1.showcase__title",
		Require: [
			{ Selector: ".provenance__band", Min: 1 },
			{ Selector: ".publish__label", Min: 1 },
			{ Selector: "article.bento__tile", Min: 1 },
		],
		Some: [
			[
				{ Selector: ".bento__tile--filled", Min: 1 },
				{ Selector: ".note", Min: 1 },
			],
		],
	},
	{
		Path: "/Workspace/",
		Title: ".drawer__name",
		Require: [
			{ Selector: ".drawer__eyebrow", Min: 1 },
			{ Selector: ".drawer__tabs", Min: 1 },
			{ Selector: "section.drawer-column", Min: 4 },
			{ Selector: "article.bento__tile", Min: 1 },
			{ Selector: ".publish__label", Min: 1 },
			{ Selector: ".provenance__band", Min: 1 },
		],
	},
	{
		Path: "/Bookmark/",
		Title: "h1.sheet__title",
		Require: [
			{ Selector: "article.sheet", Min: 1 },
			{ Selector: ".sheet__lede", Min: 1 },
		],
		Some: [
			[
				{ Selector: ".roster__row", Min: 1 },
				{ Selector: ".note", Min: 1 },
			],
		],
	},
	{
		Path: "/Bookmark/:Id/",
		Title: "h1",
		Require: [
			{ Selector: "article article", Min: 1 },
			{ Selector: "dl dt", Min: 4 },
			{ Selector: "a[href]", Min: 3 },
		],
	},
	{
		Path: "/List/",
		Title: "h1.sheet__title",
		Require: [{ Selector: "article.sheet", Min: 1 }],
		Some: [
			[
				{ Selector: ".roster__row", Min: 1 },
				{ Selector: ".note", Min: 1 },
			],
		],
	},
	{
		Path: "/List/:Slug/",
		Title: "h1.sheet__title",
		Require: [{ Selector: "article.sheet", Min: 1 }],
		Some: [
			[
				{ Selector: ".roster__row", Min: 1 },
				{ Selector: ".note", Min: 1 },
			],
		],
	},
	{
		Path: "/Voted/",
		Title: "h1.sheet__title",
		Require: [{ Selector: "article.sheet", Min: 1 }],
		Some: [
			[
				{ Selector: ".roster__row", Min: 1 },
				{ Selector: ".note", Min: 1 },
			],
		],
	},
	{
		Path: "/Activity/",
		Title: "h1.sheet__title",
		Require: [{ Selector: "article.sheet", Min: 1 }],
		Some: [
			[
				{ Selector: ".roster__row", Min: 1 },
				{ Selector: ".note", Min: 1 },
			],
		],
	},
];

/** The floor every route must clear, profile or not: real prose under `<main>`. */
const MinText = 40;

/** What each extension is served as; a build directory has no server of its own. */
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
		Origin: null,
		Browser: null,
		Routes: [],
		Json: false,
		Keep: false,
		SelfTest: false,
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
			case "--origin":
				options.Origin = value().replace(/\/+$/, "");
				break;
			case "--browser":
				options.Browser = value();
				break;
			case "--route":
				options.Routes.push(normalizeRoute(value()));
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
			case "--self-test":
				options.SelfTest = true;
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

/** `/Workspace` and `Workspace/` both mean `/Workspace/`. */
function normalizeRoute(value) {
	const path = value.startsWith("/") ? value : `/${value}`;
	return path.endsWith("/") || /\.[a-z0-9]+$/i.test(path) ? path : `${path}/`;
}

// ---------------------------------------------------------------------------
// Static server
//
// A build directory is served over loopback so the browser sees the same
// origin-relative URLs a host would. `--origin` skips this entirely.
// ---------------------------------------------------------------------------

function serve(root) {
	const server = createServer((request, response) => {
		let path;
		try {
			path = decodeURIComponent(new URL(request.url ?? "/", "http://audit").pathname);
		} catch {
			response.writeHead(400).end("bad request");
			return;
		}

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
		createReadStream(file)
			.on("error", () => {
				response.writeHead(404).end("not found");
			})
			.pipe(response);
	});

	return new Promise((resolveServer, rejectServer) => {
		server.on("error", rejectServer);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			resolveServer({ server, origin: `http://127.0.0.1:${address.port}` });
		});
	});
}

// ---------------------------------------------------------------------------
// Route discovery
//
// Every `index.html` in the build is a route. Discovery is the guard against a
// silent skip: a page that exists is audited, whether or not a profile names it.
// ---------------------------------------------------------------------------

async function discover(root) {
	const routes = [];

	async function walk(directory) {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(directory, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			if (entry.name !== "index.html") continue;
			const folder = relative(root, directory);
			routes.push(folder === "" ? "/" : `/${folder.split(/[\\/]/).join("/")}/`);
		}
	}

	await walk(root);
	return routes.sort((left, right) => left.localeCompare(right));
}

/** The profile whose `Path` matches a built route, segment by segment. */
function profileFor(route) {
	const segments = route.split("/").filter(Boolean);

	for (const profile of Profiles) {
		const wanted = profile.Path.split("/").filter(Boolean);
		if (wanted.length !== segments.length) continue;

		const matches = wanted.every(
			(part, index) =>
				part.startsWith(":") || part.toLowerCase() === segments[index].toLowerCase(),
		);
		if (matches) return profile;
	}

	return null;
}

/** Every selector a profile names, deduplicated, in declaration order. */
function selectorsOf(profile) {
	if (profile === null) return ["h1"];

	const all = [profile.Title];
	for (const entry of profile.Require ?? []) all.push(entry.Selector);
	for (const group of profile.Some ?? []) for (const entry of group) all.push(entry.Selector);

	return [...new Set(all)];
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

/** The first browser binary that exists, so no path to one machine is baked in. */
function findBrowser(explicit) {
	if (explicit !== null) {
		if (!existsSync(explicit)) throw new Error(`no browser at ${explicit}`);
		return explicit;
	}

	if (process.env.NO_JS_AUDIT_BROWSER) {
		const candidate = process.env.NO_JS_AUDIT_BROWSER;
		if (!existsSync(candidate)) {
			throw new Error(`NO_JS_AUDIT_BROWSER names a missing binary: ${candidate}`);
		}
		return candidate;
	}

	const home = process.env.HOME ?? "";
	const candidates = [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
	];

	if (home !== "") {
		const caches = [
			join(home, "Library", "Caches", "ms-playwright"),
			join(home, ".cache", "ms-playwright"),
		];
		for (const cache of caches) {
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
		throw new Error("no Chromium found; pass --browser <path> or set NO_JS_AUDIT_BROWSER");
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
 * The profile is a fresh temporary directory, so an audit never touches the
 * person's own session and never inherits a service worker or a cookie from a
 * previous run. `--remote-debugging-port=0` makes the port a runtime fact that
 * Chromium writes into `DevToolsActivePort`, which is the only way to read it
 * without guessing a free one.
 */
async function launch(browser, timeout) {
	const profile = await mkdtemp(join(tmpdir(), "no-js-audit-"));
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
			const text = await readFile(portFile, "utf8");
			const first = Number(text.split("\n")[0]);
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
//
// Node ships `WebSocket`, so the protocol client is a map of pending ids and a
// listener table. A session is a target attached in flat mode: one socket to
// the browser, one `sessionId` per tab.
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
				for (const handler of this.listeners.get(message.method) ?? [])
					handler(message.params);
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

	once(method) {
		return new Promise((resolveEvent) => {
			const handler = (params) => {
				const set = this.listeners.get(method);
				set?.delete(handler);
				resolveEvent(params);
			};
			const set = this.listeners.get(method) ?? new Set();
			set.add(handler);
			this.listeners.set(method, set);
		});
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
// One render pass
// ---------------------------------------------------------------------------

/**
 * Load one route with scripts on or off and report what the page shows.
 *
 * `Runtime.evaluate` still answers while page script execution is disabled -
 * the switch stops the document's own scripts, not the debugger's - which is
 * what makes this a measurement of the first paint rather than of the markup.
 */
async function measure(connection, { origin, route, scripts, selectors, timeout }) {
	const created = await connection.send("Target.createTarget", {
		url: "about:blank",
		background: true,
	});
	const targetId = created.targetId;
	if (typeof targetId !== "string") throw new Error("the browser created no target");

	let sessionId = null;
	try {
		const attached = await connection.send("Target.attachToTarget", {
			targetId,
			flatten: true,
		});
		sessionId = attached.sessionId;
		const page = (method, params) => connection.send(method, params, sessionId);

		await page("Page.enable");
		await page("Runtime.enable");
		await page("Network.enable");
		await page("Network.setBypassServiceWorker", { bypass: true });
		await page("Emulation.setDeviceMetricsOverride", {
			width: 1280,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await page("Emulation.setScriptExecutionDisabled", { value: scripts === false });
		// A background target gets no rendering updates, so IntersectionObserver
		// never fires and `client:visible` never hydrates. The hydrated pass would
		// then measure the same static HTML as the script-free one and the parity
		// check would pass without proving anything. This is a headless browser of
		// the audit's own, so bringing the tab forward costs nobody anything.
		await page("Page.bringToFront");
		await page("Emulation.setFocusEmulationEnabled", { enabled: true });

		const loaded = connection.once("Page.loadEventFired");
		await page("Page.navigate", { url: `${origin}${route}?audit=${scripts ? "js" : "nojs"}` });
		await Promise.race([loaded, sleep(timeout)]);
		await sleep(scripts ? 0 : 200);

		// The hydrated pass has to actually hydrate, or the parity comparison is
		// two static renders and proves nothing. Wait for the `ssr` marker to be
		// gone from every island, then measure; a pass that never hydrates says so
		// in the verdict instead of passing quietly.
		if (scripts) {
			const deadline = Date.now() + Math.min(timeout, 5000);
			while (Date.now() < deadline) {
				const pending = await page("Runtime.evaluate", {
					expression: 'document.querySelectorAll("astro-island[ssr]").length',
					returnByValue: true,
				});
				if ((pending.result.value ?? 0) === 0) break;
				await sleep(100);
			}
			await sleep(200);
		}

		const expression = `(() => {
			const Visible = (element) => {
				if (typeof element.checkVisibility === "function") {
					try {
						return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
					} catch {}
				}
				return element.getClientRects().length > 0;
			};
			const Count = (selector) => {
				let matched = [];
				try { matched = Array.from(document.querySelectorAll(selector)); } catch { return { total: -1, visible: -1 }; }
				return { total: matched.length, visible: matched.filter(Visible).length };
			};
			const Text = (selector) => {
				const element = document.querySelector(selector);
				return element === null ? "" : (element.textContent || "").replace(/\\s+/g, " ").trim();
			};
			const main = document.querySelector("main");
			return {
				title: document.title || "",
				mainText: (main === null ? "" : (main.innerText || main.textContent || "")).replace(/\\s+/g, " ").trim().length,
				titleText: Text(${JSON.stringify(selectors.Title)}),
				titleVisible: Count(${JSON.stringify(selectors.Title)}).visible > 0,
				selectors: Object.fromEntries(${JSON.stringify(selectors.List)}.map((selector) => [selector, Count(selector)])),
				islands: Array.from(document.querySelectorAll("astro-island")).map((island) => ({
					client: island.getAttribute("client") || "",
					ssr: island.hasAttribute("ssr"),
					text: (island.textContent || "").replace(/\\s+/g, " ").trim().length,
					elements: island.querySelectorAll("*").length,
				})),
			};
		})()`;

		const evaluated = await page("Runtime.evaluate", { expression, returnByValue: true });
		if (evaluated.exceptionDetails !== undefined) {
			throw new Error(`the probe threw: ${evaluated.exceptionDetails.text ?? "unknown"}`);
		}
		return evaluated.result.value;
	} finally {
		if (sessionId !== null) {
			await connection.send("Target.detachFromTarget", { sessionId }).catch(() => {});
		}
		await connection.send("Target.closeTarget", { targetId }).catch(() => {});
	}
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

/**
 * Compare the two passes.
 *
 * The parity rule is the whole audit: for every selector the profile names, the
 * script-free render must show at least as much as the hydrated one. Anything
 * else means hydration added content, which is exactly the defect this exists
 * to catch.
 */
function judge({ route, profile, off, on }) {
	const failures = [];
	const warnings = [];

	if (off.title.trim() === "") failures.push("the document has no title");
	if (off.title.trim() === "" && off.mainText === 0) {
		failures.push(
			"the route served no document: its HTML was missing when measured, which is what a build still writing looks like",
		);
	}
	if (off.mainText < MinText) {
		failures.push(
			`<main> renders ${off.mainText} characters of text, under the ${MinText} floor`,
		);
	}

	if (profile !== null) {
		if (off.titleText === "" || off.titleVisible === false) {
			failures.push(`the page title (${profile.Title}) is missing or hidden without scripts`);
		}

		for (const entry of profile.Require ?? []) {
			const seen = off.selectors[entry.Selector] ?? { visible: 0 };
			if (seen.visible < entry.Min) {
				failures.push(`${entry.Selector}: ${seen.visible} visible, needs ${entry.Min}`);
			}
		}

		for (const group of profile.Some ?? []) {
			const satisfied = group.some((entry) => {
				const seen = off.selectors[entry.Selector] ?? { visible: 0 };
				return seen.visible >= entry.Min;
			});
			if (!satisfied) {
				failures.push(
					`none of ${group.map((entry) => `${entry.Selector} >= ${entry.Min}`).join(", ")} holds`,
				);
			}
		}

		for (const selector of selectorsOf(profile)) {
			const disabled = off.selectors[selector]?.visible ?? 0;
			const enabled = on.selectors[selector]?.visible ?? 0;
			if (disabled < enabled) {
				failures.push(
					`${selector}: ${disabled} visible without scripts but ${enabled} with them - content waits for hydration`,
				);
			}
		}
	} else {
		warnings.push("no route profile: generic checks only");
		if (off.titleText === "") failures.push("the page has no visible <h1>");
	}

	for (const island of off.islands) {
		if (island.client === "only") {
			failures.push("an island is client:only, so it renders nothing without scripts");
		} else if (island.client === "load") {
			warnings.push("an island hydrates with client:load; client:visible defers the boot");
		}
		if (island.text === 0 && island.elements === 0) {
			failures.push(
				`an island (${island.client || "unknown"}) has no server-rendered content`,
			);
		}
	}

	if (on.islands.some((island) => island.ssr === true)) {
		warnings.push(
			"the hydrated pass never hydrated, so parity compared two static renders - the directive is not firing",
		);
	}

	return {
		Route: route,
		Profile: profile === null ? null : profile.Path,
		Status: failures.length === 0 ? "pass" : "fail",
		Failures: failures,
		Warnings: warnings,
		Off: off,
		On: on,
	};
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function report(results, meta) {
	const lines = [];
	lines.push(
		`no-js audit  routes=${results.length}  origin=${meta.Origin}  browser=${meta.Browser}`,
	);

	for (const result of results) {
		const island = result.Off.islands.length;
		const hydrated =
			result.On.islands.length === 0
				? "-"
				: result.On.islands.every((entry) => entry.ssr === false)
					? "hydrated"
					: "static";
		const label = result.Profile === null ? "generic" : result.Profile;
		lines.push(
			`  ${result.Status === "pass" ? "PASS" : "FAIL"}  ${result.Route.padEnd(28)} ${label.padEnd(16)} ` +
				`text=${result.Off.mainText} islands=${island} js=${hydrated}`,
		);
		for (const failure of result.Failures) lines.push(`        - ${failure}`);
		for (const warning of result.Warnings) lines.push(`        ~ ${warning}`);
	}

	const passed = results.filter((result) => result.Status === "pass").length;
	const failed = results.length - passed;
	lines.push("", `${results.length} routes: ${passed} pass, ${failed} fail, 0 skipped`);

	return lines.join("\n");
}

function sleep(ms) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * A page that satisfies every structural rule and still fails the audit: its
 * rows arrive from a script and its island carries no server-rendered content.
 *
 * The self-test exists because an audit that cannot fail is decoration. The
 * fixture is generated rather than archived as a second file, so the negative
 * control cannot drift away from the rules that are supposed to catch it.
 */
const Fixture = `<!doctype html>
<html lang="en">
	<head><meta charset="utf-8" /><title>No-script audit fixture</title></head>
	<body>
		<main>
			<article class="sheet">
				<header class="sheet__head">
					<h1 class="sheet__title">Curated</h1>
					<p class="sheet__lede">A fixture whose rows arrive only after a script runs.</p>
				</header>
				<ul class="roster" id="roster"></ul>
				<footer class="sheet__foot">
					<a href="/">Curated</a><a href="/Bookmark/">Bookmarks</a><a href="/List/">Lists</a>
				</footer>
				<astro-island client="load" component-export="default" component-url="/nowhere.js"></astro-island>
			</article>
		</main>
		<script>
			const row = document.createElement("li");
			row.className = "roster__row";
			row.textContent = "Added by hydration";
			document.getElementById("roster").append(row);
		</script>
	</body>
</html>
`;

/**
 * Run the audit against the fixture and require it to fail.
 *
 * Exit code 0 means the rules fired, 1 means one of them stopped catching the
 * defect it exists for - which is the only way a broken audit is allowed to be
 * loud.
 */
async function selfTest(options) {
	const root = await mkdtemp(join(tmpdir(), "no-js-fixture-"));
	await writeFile(join(root, "index.html"), Fixture, "utf8");

	try {
		const { results } = await audit({ ...options, Root: root, Origin: null, Routes: [] });
		const result = results[0];
		const expected = ["content waits for hydration", "no server-rendered content"];
		const missed = expected.filter(
			(fragment) => !(result?.Failures ?? []).some((failure) => failure.includes(fragment)),
		);

		if (result === undefined || result.Status !== "fail" || missed.length > 0) {
			console.error(
				`self-test failed: the fixture did not fail on ${missed.join(", ") || "the parity rule"}`,
			);
			console.error(report(results, { Origin: "-", Browser: "-" }));
			return 1;
		}

		console.log(
			`self-test passed: the fixture failed on ${result.Failures.length} rules, including hydration parity and an empty island`,
		);
		return 0;
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
}

async function main() {
	const options = parseArguments(process.argv.slice(2));

	if (options.Help) {
		console.log(
			"node no-js-audit.mjs [--root <dir>] [--origin <url>] [--browser <path>] [--route <path>] [--json] [--keep] [--self-test] [--timeout <ms>]",
		);
		return 0;
	}

	if (options.SelfTest) return selfTest(options);

	const { results, meta } = await audit(options);

	if (options.Json) {
		console.log(
			JSON.stringify(
				{ meta, results, failed: results.some((result) => result.Status === "fail") },
				null,
				2,
			),
		);
	} else {
		console.log(report(results, meta));
	}

	return results.some((result) => result.Status === "fail") ? 1 : 0;
}

/**
 * Serve the build, launch a browser of the audit's own, and measure every route
 * twice. Returns the verdicts; printing is the caller's decision, because the
 * self-test reads them instead of showing them.
 */
async function audit(options) {
	let server = null;
	let origin = options.Origin;
	if (origin === null) {
		if (!existsSync(options.Root)) {
			throw new Error(
				`no build directory at ${options.Root}; run the build first or pass --root`,
			);
		}
		const served = await serve(options.Root);
		server = served.server;
		origin = served.origin;
	}

	let routes;
	if (options.Origin === null) {
		routes = await discover(options.Root);
	} else {
		// An external origin has no directory to walk, so the profile table is the
		// inventory. A dynamic route is audited at the one instance the profile
		// names, which is why `--route` exists for the rest.
		routes = Profiles.map((profile) => profile.Path).filter((path) => !path.includes("/:"));
	}

	if (options.Routes.length > 0)
		routes = routes.filter((route) => options.Routes.includes(route));
	if (routes.length === 0) throw new Error("no routes to audit");

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

		const results = [];
		for (const route of routes) {
			const profile = profileFor(route);
			const selectors = {
				Title: profile === null ? "h1" : profile.Title,
				List: selectorsOf(profile),
			};

			// A route that cannot be measured is a failure of that route, not of the
			// run: the report still names it, so a broken page is never a silent skip.
			try {
				const off = await measure(connection, {
					origin,
					route,
					scripts: false,
					selectors,
					timeout: options.Timeout,
				});
				const on = await measure(connection, {
					origin,
					route,
					scripts: true,
					selectors,
					timeout: options.Timeout,
				});

				results.push(judge({ route, profile, off, on }));
			} catch (error) {
				results.push({
					Route: route,
					Profile: profile === null ? null : profile.Path,
					Status: "fail",
					Failures: [
						`the route could not be measured: ${error instanceof Error ? error.message : String(error)}`,
					],
					Warnings: [],
					Off: { mainText: 0, islands: [] },
					On: { islands: [] },
				});
			}
		}

		return { results, meta: { Origin: origin, Browser: browser } };
	} finally {
		connection?.close();
		launched.child.kill("SIGTERM");
		server?.close();
		if (!options.Keep) {
			await sleep(300);
			await rm(launched.profile, { recursive: true, force: true }).catch(() => {});
		}
	}
}

main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(
			`no-js audit could not run: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	});
