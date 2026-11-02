/**
 * @module Text
 *
 * The two run-time helpers the content layer needs on the site.
 *
 * `content` is the guard around a baked string. Each content file is a `define`,
 * so `process.env["..."]` is replaced by the file's text at compile time; the
 * guard is what a build without the define sees, and it names the missing key
 * instead of letting `undefined` reach a page.
 *
 * The define does not always apply: Vite substitutes a static member expression,
 * and the call sites use computed access (`process.env["NAME"]`), which the dev
 * module runner leaves alone. So the same Markdown is also globbed eagerly as raw
 * text - Vite inlines it at both dev and build - and looked up by the same key
 * derivation the generator uses. The define stays the primary path (it costs
 * nothing at run time); the glob is what makes `astro dev` work.
 *
 * `fill` is the run-time half of the placeholder syntax: `{{name}}` in a content
 * file is left in the text on purpose, because the value - a count, a day, a
 * handle - only exists while the page renders. `${NAME}` in all caps is the
 * build-time half, resolved by `Maintain/Configuration/Content.ts`.
 *
 * A name with no value throws. Printing an empty string instead would put a hole
 * in a sentence with nothing to say which word went missing.
 */
import { Strings } from "../Generated/Content.ts";

const Placeholder = /\{\{([A-Za-z][A-Za-z0-9]*)}}/g;

export const content = (Value: string | undefined, Name: string): string => {
	const Resolved = Value ?? Strings[Name];

	if (Resolved === undefined) {
		throw new Error(
			`${Name} is not defined: no define was substituted and no file under Content/ derives that key.`,
		);
	}

	return Resolved;
};

export const fill = (Template: string, Values: Readonly<Record<string, string>>): string =>
	Template.replace(Placeholder, (Whole: string, Name: string) => {
		const Value = Values[Name];

		if (Value === undefined) {
			throw new Error(`no value for {{${Name}}} in: ${Template}`);
		}

		return Value;
	});
