/**
 * @module Content
 *
 * The site's entry to the content layer: the same tree, the same names, the same
 * `define` map the tool layer bakes in.
 *
 * It re-exports `Maintain/Configuration/Content.ts` rather than repeating the
 * walk, because the two builds have to agree on every name - a page and a
 * command that read the same file must read the same key. `Maintain/Source`,
 * the tool layer itself, is still off limits to this build; the shared module is
 * build configuration that happens to live beside the tool's own esbuild options.
 *
 * `astro.config.ts` reads it directly, before Vite exists, and passes the map to
 * `vite.define`; nothing here is imported by a page at run time.
 */
export { Content, Root } from "../Maintain/Configuration/Content.ts";
export type { Entry, Kind, Layer } from "../Maintain/Configuration/Content.ts";
