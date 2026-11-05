import { locate, optional } from "../../Configuration/Load/Load.ts";
import { DEFAULT_CONTENT, DEFAULT_SHADOW } from "../../Configuration/Schema/Schema.ts";

export { DEFAULT_CONTENT, DEFAULT_SHADOW };

/**
 * The shadow store root.
 *
 * Resolved in one order - the map's own relative declaration, then
 * `MAINTAIN_STORAGE`, then the built-in absolute default - and every relative
 * form is anchored to this module's own location rather than to the working
 * directory. `MAINTAIN_STORAGE` exists so a run can point the whole store at a
 * temporary directory without touching the real archive.
 */
export function shadowDirectory(): string {
	return locate(optional()?.storage.shadow, "MAINTAIN_STORAGE", DEFAULT_SHADOW);
}

/**
 * The content collection root - the only directory the site builds from.
 *
 * `MAINTAIN_CONTENT` mirrors `MAINTAIN_STORAGE`, and it names the same tree the
 * build reads: one variable, one meaning, whichever process asks.
 */
export function contentDirectory(): string {
	return locate(optional()?.content.root, "MAINTAIN_CONTENT", DEFAULT_CONTENT);
}
