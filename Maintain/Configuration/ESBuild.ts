import type { BuildOptions, Plugin } from "esbuild";

/**
 * @module ESBuild
 *
 * esbuild options for `@playform/build`, mirroring the sibling packages: ESM,
 * Node platform, `esnext`, one `tsconfig`, a metafile, and an `onStart` hook
 * that removes the output directory so a renamed or deleted source never
 * leaves a stale file behind.
 *
 * Two options go further than a plain library build, and both follow from the
 * sources importing each other with `.ts` specifiers - the same form `node`
 * strips types from, so `node Source/Index.ts` runs with no toolchain:
 *
 * - `bundle` is on. A non-bundled emit copies `from "./X.ts"` straight into
 *   `Target/**`, where only `X.js` exists, so `node Target/Index.js` would
 *   fail to resolve its own imports.
 * - `splitting` keeps that from inlining every module into each of the ~57
 *   entry points: shared code is emitted once as `Target/chunk-*.js`.
 */
export default {
	bundle: true,

	color: true,

	format: "esm",

	logLevel: "debug",

	metafile: true,

	minify: true,

	outdir: "Target",

	platform: "node",

	splitting: true,

	target: "esnext",

	tsconfig: "tsconfig.json",

	write: true,

	plugins: [
		{
			name: "Target",

			setup({ onStart, initialOptions: { outdir } }) {
				onStart(async () => {
					try {
						outdir
							? await (
									await import("node:fs/promises")
								).rm(outdir, {
									recursive: true,
								})
							: {};
					} catch (_Error) {
						console.log(_Error);
					}
				});
			},
		} as Plugin,
	],
} satisfies BuildOptions as BuildOptions;
