import { resolve } from "node:path";
import { optional, root } from "../../Configuration/Load/Load.ts";

/** Where the archive lives when nothing else says otherwise. */
export const DEFAULT_SHADOW = "Maintain/Storage/Shadow";

/** Where the site's collections live when nothing else says otherwise. */
export const DEFAULT_CONTENT = "Source/Content";

function absolute(path: string): string {
	return resolve(root(), path);
}

/**
 * The shadow store root: the environment wins, then the identifier map, then
 * the default. `MAINTAIN_STORAGE` exists so a test can point the whole store at
 * a temporary directory without touching the real archive.
 */
export function shadowDirectory(): string {
	const configured = process.env.MAINTAIN_STORAGE;
	if (configured !== undefined && configured.length > 0) return absolute(configured);
	return absolute(optional()?.storage.shadow ?? DEFAULT_SHADOW);
}

/** The content collection root - the only directory the site builds from. */
export function contentDirectory(): string {
	return absolute(optional()?.content.root ?? DEFAULT_CONTENT);
}
