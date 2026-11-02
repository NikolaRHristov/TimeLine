import { resolve } from "node:path";

import { optional, root } from "../../Configuration/Load/Load.ts";
import {
	DEFAULT_CONTENT,
	DEFAULT_SHADOW,
} from "../../Configuration/Schema/Schema.ts";

export { DEFAULT_CONTENT, DEFAULT_SHADOW };

function absolute(path: string): string {
	return resolve(root(), path);
}

/**
 * The shadow store root: the environment wins, then the identifier map, then
 * the default. `MAINTAIN_STORAGE` exists so a test can point the whole store at
 * a temporary directory without touching the real archive.
 */
export function shadowDirectory(): string {
	const configured = process.env["MAINTAIN_STORAGE"];
	if (configured !== undefined && configured.length > 0)
		return absolute(configured);
	return absolute(optional()?.storage.shadow ?? DEFAULT_SHADOW);
}

/**
 * The content collection root - the only directory the site builds from.
 *
 * `MAINTAIN_CONTENT` mirrors `MAINTAIN_STORAGE`: a test can point the Author
 * collection at a temporary directory and prove what a command does with a
 * manual decision without touching the real one.
 */
export function contentDirectory(): string {
	const configured = process.env["MAINTAIN_CONTENT"];
	if (configured !== undefined && configured.length > 0)
		return absolute(configured);
	return absolute(optional()?.content.root ?? DEFAULT_CONTENT);
}
