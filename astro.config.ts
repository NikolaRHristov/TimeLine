import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

export const On = process.env["NODE_ENV"] === "development";

export const Here = dirname(fileURLToPath(import.meta.url));

// The alias table mirrors the `paths` that `@playform/build` defines in its
// tsconfig. TypeScript and Vite resolve those specifiers on their own, but the
// CSS `@import` statements are resolved by Vite's stylesheet pipeline, which
// needs the same table registered as `resolve.alias` or an
// `@import "@Stylesheet/Global.css"` fails to resolve during the build.
export const Aliases = Object.fromEntries(
	[
		"Asset",
		"Class",
		"Component",
		"Content",
		"Context",
		"Element",
		"Function",
		"Interface",
		"Layout",
		"Library",
		"Notation",
		"Option",
		"Page",
		"Script",
		"Stylesheet",
		"Target",
		"Test",
		"Type",
		"Variable",
	].map((Folder) => [
		`@${Folder}`,
		resolve(Here, "Source", Folder === "Page" ? "pages" : Folder),
	]),
);

// The canonical origin. `astro.config.ts` is evaluated before Astro populates
// `process.env` from the `.env` files, so `SITE_URL` has to be read here through
// Vite's own loader - otherwise `site` (and therefore the sitemap) would fall
// back to the example domain while the shell's canonical link used the real one.
const { loadEnv } = await import("vite");
const { Fallback } = await import("./Source/Library/Content.ts");

const Env = loadEnv(process.env["NODE_ENV"] ?? "production", Here, "");

const Site = Env["SITE_URL"] ?? Fallback;

// The route map, read directly rather than through `@Function/`: this file is
// loaded by Astro's config loader before the alias table above is registered.
const { CanonicalPath, Pair } = await import("./Source/Function/Route/Map.ts");

/**
 * The service worker's precache version.
 *
 * Workbox already revisions every precached file by its content hash, so a
 * changed page is re-fetched - but the cache *name* is what decides whether an
 * older cache is left behind, and a fixed name is what lets a retired path
 * survive an upgrade. Deriving the name from the route map makes the two
 * states the map can be in - a path added, a path retired - produce a
 * different cache, and `cleanupOutdatedCaches` then deletes the previous one on
 * activate.
 *
 * Derived from the map rather than from the clock on purpose: two builds of the
 * same map must produce the same name, or every deploy would orphan a cache.
 */
const PrecacheVersion = createHash("sha256")
	.update(
		[[...CanonicalPath].sort().join("\n"), ...Pair().map(([From, To]) => `${From} ${To}`)].join(
			"\n",
		),
	)
	.digest("hex")
	.slice(0, 12);

export default defineConfig({
	srcDir: "./Source",
	publicDir: "./Public",
	outDir: "./Target",
	site: Site,
	compressHTML: true,
	prefetch: {
		defaultStrategy: "hover",
		prefetchAll: true,
	},
	server: {
		port: 9999,
	},
	build: {
		concurrency: 9999,
	},
	integrations: [
		// The dev half of the route map: the alias 301s a static host reads from
		// `Public/_redirects`, answered by the dev server so they are testable
		// before a deploy. It installs only an `astro:server:setup` hook, so a
		// production build carries no middleware.
		(await import("./Source/Function/Route/Integration.ts")).default(),
		// The service worker. Added unconditionally on purpose: the integration
		// itself decides what each command gets - `astro build` generates the
		// worker, `astro dev` serves a no-op that clears any previously installed
		// one so hot module reloading keeps working.
		//
		// Registration is `autoRegister: false` and the shell registers the worker
		// itself, inside a build-time `import.meta.env.PROD` guard. The
		// integration's own auto-registration is injected for every command,
		// including `astro dev`, which would put a worker in front of the dev
		// server; the guard is what makes the worker production-only, and passing
		// `{ scope: "/" }` is what makes its scope explicit rather than implied by
		// the script's location.
		//
		// The precache scope is the second half of that. Only files that are safe
		// to serve from cache are listed, and the two that are not - the host's
		// redirect map and the content JSON - are named explicitly rather than left
		// to the extension list. `_redirects` is an instruction to the host, not a
		// resource: a cached copy would outlive the route map that produced it. The
		// JSON is the archive's payload; the page that renders it is precached
		// instead, so a stale copy of the data can never be served next to a fresh
		// page.
		(await import("astrojs-service-worker")).default({
			registration: { autoRegister: false },
			workbox: {
				cacheId: `timeline-${PrecacheVersion}`,
				globPatterns: [
					"**/*.{html,css,js,svg,png,jpg,jpeg,gif,webp,avif,ico,woff,woff2,txt,xml,webmanifest}",
				],
				globIgnores: ["_redirects", "_headers", "**/*.json"],
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
			},
		}),
		(await import("@astrojs/sitemap")).default(),
		// The site has more than one page and one shared stylesheet. Pruning the
		// source after inlining the first page leaves the later pages without the
		// shared rules, so the source stays whole and each page inlines its own
		// critical CSS on top of it.
		(await import("@playform/inline")).default({
			Beasties: { pruneSource: false },
			Logger: 1,
		}),
		(await import("@playform/compress")).default({ Logger: 1 }),
	],
	experimental: {
		clientPrerender: true,
		contentIntellisense: true,
	},
	vite: {
		build: {
			sourcemap: On,
			manifest: true,
			minify: On ? false : "terser",
			cssMinify: On ? false : "esbuild",
			terserOptions: On
				? {
						compress: false,
						ecma: 2020,
						enclose: false,
						format: {
							ascii_only: false,
							braces: false,
							comments: false,
							ie8: false,
							indent_level: 4,
							indent_start: 0,
							inline_script: false,
							keep_numbers: true,
							keep_quoted_props: true,
							max_line_len: 80,
							preamble: "",
							ecma: 5,
							preserve_annotations: true,
							quote_keys: false,
							quote_style: 3,
							safari10: true,
							semicolons: true,
							shebang: false,
							shorthand: false,
							webkit: true,
							wrap_func_args: true,
							wrap_iife: true,
						},
						sourceMap: true,
						ie8: true,
						keep_classnames: true,
						keep_fnames: true,
						mangle: false,
						module: true,
						toplevel: true,
					}
				: {},
		},
		resolve: {
			preserveSymlinks: false,
			alias: Aliases,
		},
		css: {
			devSourcemap: true,
			transformer: "postcss",
		},
		plugins: [
			{
				name: "CrossOrigin",
				transform(Code, Identifier, _) {
					const CrossOrigin =
						Identifier.includes(".mjs") ||
						Identifier.includes(".js") ||
						Identifier.includes(".astro")
							? `crossorigin=\\"anonymous\\"`
							: 'crossorigin="anonymous"';

					return Code.replace(/<script/g, `<script ${CrossOrigin}`)
						.replace(
							/<link[^>]*(?=.*rel="preload")(?=.*href="[^"]*\.js")(?=.*as="script")[^>]*/g,
							`$& ${CrossOrigin}`,
						)
						.replace(
							/<link[^>]*(?=.*rel="preload")(?=.*as="font")[^>]*/g,
							`$& ${CrossOrigin}`,
						)
						.replace(
							/<link[^>]*(?=.*rel="stylesheet")(?=.*href="https?:\/\/[^"]*")[^>]*/g,
							`$& ${CrossOrigin}`,
						);
				},
			},
		],
	},
});
