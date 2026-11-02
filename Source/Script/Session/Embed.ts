/**
 * The session a page embeds at build time, as a reader the store can call.
 *
 * A page resolves its own view when it builds: the identity, the rooms and the
 * standing are build-time facts, and the only thing the browser has to do is read
 * them back. They arrive as one `application/json` element, the same way a page
 * embeds the vote configuration - one element, one id, and no module that guesses
 * where the words came from.
 *
 * A page with no session embeds nothing and gets no reader, which is the normal
 * case: the workspace is anonymous until a session layer can answer (RFC-0043
 * §7). That absence is not a failure and prints no warning. A payload that is
 * not JSON is a failure, and it arrives as a rejected promise rather than a
 * throw, so the session layer reports it once and the store keeps its anonymous
 * slot.
 */
import type { Reader } from "./Session.ts";

/** The element a page embeds its session in. */
export const ELEMENT = "Workspace-Session";

/**
 * The reader this page's embedded session gives the store, or `undefined`.
 *
 * `async` on purpose: `JSON.parse` throws on a malformed payload, and a reader
 * that threw synchronously would escape the promise chain the session layer is
 * already handling.
 */
export function embed(): Reader | undefined {
	if (typeof document === "undefined") {
		return undefined;
	}

	const Element = document.getElementById(ELEMENT);

	if (Element === null) {
		return undefined;
	}

	return async () => JSON.parse(Element.textContent ?? "");
}
