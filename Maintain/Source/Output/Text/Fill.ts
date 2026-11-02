/**
 * @module Fill
 *
 * Run-time placeholders: `{{name}}` in a content string, replaced by the value
 * the caller has for it.
 *
 * This is the second half of the content layer's placeholder syntax, and the
 * split is by *when* the value exists. `${NAME}` in a content file is resolved
 * by the build from `Content/Configuration.json`; `{{name}}` is left in the text
 * on purpose, because the value - a count, a list of handles - only exists while
 * the command or the page runs.
 *
 * A name with no value throws. Substituting an empty string instead would print
 * a sentence with a hole in it and nothing to say which word went missing.
 */
const Placeholder = /\{\{([A-Za-z][A-Za-z0-9]*)}}/g;

export function fill(Template: string, Values: Readonly<Record<string, string>>): string {
	return Template.replace(Placeholder, (_Whole: string, Name: string) => {
		const Value = Values[Name];

		if (Value === undefined) {
			throw new Error(`no value for {{${Name}}} in: ${Template}`);
		}

		return Value;
	});
}
