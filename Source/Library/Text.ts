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
 * `fill` is the run-time half of the placeholder syntax: `{{name}}` in a content
 * file is left in the text on purpose, because the value - a count, a day, a
 * handle - only exists while the page renders. `${NAME}` in all caps is the
 * build-time half, resolved by `Maintain/Configuration/Content.ts`.
 *
 * A name with no value throws. Printing an empty string instead would put a hole
 * in a sentence with nothing to say which word went missing.
 */
const Placeholder = /\{\{([A-Za-z][A-Za-z0-9]*)}}/g;

export const content = (Value: string | undefined, Name: string): string => {
	if (Value === undefined) {
		throw new Error(
			`${Name} is not defined: the site is built with the content layer through Scripts/Content.ts, so this module is complete only inside \`astro build\` or \`astro dev\`.`,
		);
	}

	return Value;
};

export const fill = (Template: string, Values: Readonly<Record<string, string>>): string =>
	Template.replace(Placeholder, (Whole: string, Name: string) => {
		const Value = Values[Name];

		if (Value === undefined) {
			throw new Error(`no value for {{${Name}}} in: ${Template}`);
		}

		return Value;
	});
