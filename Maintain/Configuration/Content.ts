/**
 * @module Content
 *
 * The content layer: `Content/**` holds every string, document and instruction
 * the code embeds, one Markdown file each, and this module turns that tree into
 * an esbuild `define` map.
 *
 * A define is a compile-time substitution, so a content file costs nothing at
 * run time: its text is baked into the bundle as one string literal, and no
 * source file reads a file or imports the Markdown. `@playform/build` carries
 * the package version the same way (`process.env.VERSION_PACKAGE`), and the site
 * gets the same names through Vite's `define`.
 *
 * The key is the path. `Content/String/Command/Store/Push/Summary.md` becomes
 * `CONTENT_STRING_COMMAND_STORE_PUSH_SUMMARY`, so the define a source file
 * references names the file it came from and a search finds either end.
 *
 * Two placeholder syntaxes, and the difference is when they resolve:
 *
 * - `${NAME}`, all caps - resolved here, at build time, from
 *   `Content/Configuration.json` and its gitignored `.local` override. An
 *   unresolved name fails the build rather than shipping a blank.
 * - `{{name}}`, any case - left untouched, and resolved at run time by the
 *   caller. A sentence that interpolates a count is written this way.
 *
 * This file sits beside `ESBuild.ts` rather than under `Source/` because it is
 * build configuration, not part of the tool layer: `Maintain/Source` is what the
 * site must never import, and this module is shared with it through
 * `Scripts/Content.ts`.
 *
 * Paths come from this module's own location, not from the working directory:
 * `pnpm run Build` runs in `Maintain/`, `astro build` runs at the root, and both
 * must read the same tree.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The three kinds of content, and the define prefix each one contributes. */
export const Prefix = {
	Document: "CONTENT_DOCUMENT_",
	Instruction: "CONTENT_INSTRUCTION_",
	String: "CONTENT_STRING_",
} as const;

export type Kind = keyof typeof Prefix;

/** One content file, already read. */
export type Entry = {
	Kind: Kind;
	/** Path relative to the content directory, with `/` separators. */
	File: string;
	/** The define name without its prefix, e.g. `SITE_TITLE`. */
	Key: string;
	/** The file's text, trailing line terminator still attached. */
	Text: string;
};

/** Everything the builds need: the files, the values, and the map over them. */
export type Layer = {
	Entries: Entry[];
	Values: Record<string, string>;
	Define: Record<string, string>;
};

/**
 * A configuration reference: `${NAME}`.
 *
 * Only an all-caps name is a reference. A template that interpolates a count at
 * run time writes `${count}` in lower case, and that has to survive compilation
 * rather than be read as a missing configuration value.
 */
const Reference = /\\?\$\{([A-Z][A-Z0-9_]*)\}/g;

/** The define name for one path: `Site/Title.md` -> `SITE_TITLE`. */
export function Key(File: string): string {
	return File.replace(/\.[^./\\]+$/, "")
		.split(/[\\/]+/)
		.map((Segment) =>
			Segment.replace(/[^A-Za-z0-9]+/g, "_")
				.replace(/^_+|_+$/g, "")
				.toUpperCase(),
		)
		.filter((Segment) => Segment !== "")
		.join("_");
}

/**
 * The value a file holds: its text without the single trailing line terminator.
 *
 * A tracked text file ends with a newline and the value does not, so exactly one
 * is removed. Every newline before it belongs to the value.
 */
export function Value(Text: string): string {
	if (Text.endsWith("\r\n")) return Text.slice(0, -2);
	if (Text.endsWith("\n")) return Text.slice(0, -1);
	return Text;
}

/**
 * Substitute every `${NAME}` from `Values`.
 *
 * An unresolved reference throws instead of producing an empty string: a missing
 * origin or licence would otherwise ship as a blank in every page that used it,
 * with nothing to say why. `\${NAME}` is the escape, and it is what lets a
 * content file talk about the syntax itself.
 */
export function Substitute(
	Text: string,
	Values: Readonly<Record<string, string>>,
	File: string,
): string {
	return Text.replace(Reference, (Whole: string, Name: string) => {
		if (Whole.startsWith("\\")) return Whole.slice(1);
		const Resolved = Values[Name];
		if (Resolved === undefined) {
			throw new Error(`${File}: ${Name} has no value in Content/Configuration.json`);
		}
		return Resolved;
	});
}

/**
 * Every `.md` file under the three content directories, read and keyed.
 *
 * A directory that does not exist yet is empty content, not a failure: a
 * repository with no instructions is a normal state.
 */
export async function Collect(Directory: string): Promise<Entry[]> {
	const Entries: Entry[] = [];

	for (const Kind of Object.keys(Prefix) as Kind[]) {
		const Root = join(Directory, Kind);

		let Files: string[];
		try {
			Files = await readdir(Root, { recursive: true });
		} catch (Error) {
			if ((Error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw Error;
		}

		for (const Name of Files.sort()) {
			const Segments = Name.split(/[\\/]+/);
			if (!Name.toLowerCase().endsWith(".md")) continue;
			if (Segments.some((Segment) => Segment.startsWith("."))) continue;

			Entries.push({
				Kind,
				File: `${Kind}/${Segments.join("/")}`,
				Key: Key(Name),
				Text: await readFile(join(Root, Name), "utf8"),
			});
		}
	}

	return Entries;
}

/**
 * The define map: one entry per content file, keyed `process.env.<NAME>`, each a
 * JSON string literal.
 *
 * `JSON.stringify` is what makes Markdown safe here. A backtick, a `${`, a quote
 * or a newline inside the text becomes an escape inside one double-quoted
 * literal, so the compiler emits the byte-identical string instead of a template
 * it would re-interpret.
 */
export function Define(
	Entries: readonly Entry[],
	Values: Readonly<Record<string, string>>,
): Record<string, string> {
	const Define: Record<string, string> = {};
	const Claimed = new Map<string, string>();

	for (const Entry of Entries) {
		const Name = Prefix[Entry.Kind] + Entry.Key;
		const Previous = Claimed.get(Name);

		if (Previous !== undefined) {
			throw new Error(`${Entry.File} and ${Previous} both map to ${Name}`);
		}
		Claimed.set(Name, Entry.File);

		// The key is the expression the source writes, not the bare name: a
		// `define` is a substitution on that expression, and `process.env.X`
		// matches both `process.env.X` and `process.env["X"]` in the source.
		Define[`process.env.${Name}`] = JSON.stringify(
			Substitute(Value(Entry.Text), Values, Entry.File),
		);
	}

	return Define;
}

/**
 * One JSON object, or null when the file is not there.
 *
 * An absent file is a normal state - the local override is optional, and a
 * repository may have no content values at all. A file that exists and does not
 * parse is not, and it is reported with its own path so the build says which
 * one.
 */
async function read(Path: string): Promise<Record<string, unknown> | null> {
	let Text: string;
	try {
		Text = await readFile(Path, "utf8");
	} catch (Error) {
		if ((Error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw new Error(`${Path}: ${Error instanceof Error ? Error.message : String(Error)}`);
	}

	let Parsed: unknown;
	try {
		Parsed = JSON.parse(Text);
	} catch (Error) {
		throw new Error(`${Path}: ${Error instanceof Error ? Error.message : String(Error)}`);
	}

	if (Parsed === null || typeof Parsed !== "object" || Array.isArray(Parsed)) {
		throw new Error(`${Path}: expected one JSON object`);
	}

	return Parsed as Record<string, unknown>;
}

/**
 * A configuration object as substitution values.
 *
 * A nested object or an array is refused rather than flattened: `${NAME}` is one
 * value, and a structure would resolve to `[object Object]` in a page with
 * nothing to say it had gone wrong.
 */
function flatten(Source: Record<string, unknown> | null, Path: string): Record<string, string> {
	const Values: Record<string, string> = {};

	for (const [Name, Value] of Object.entries(Source ?? {})) {
		if (Value !== null && typeof Value === "object") {
			throw new Error(`${Path}: ${Name} must be a string, number or boolean`);
		}
		Values[Name] = String(Value);
	}

	return Values;
}

/**
 * Read the content tree and build the define map.
 *
 * The precedence is deliberate: the package's own name and version first, then
 * the tracked `Configuration.json`, then `Configuration.local.json` on top of
 * both. The local file is the gitignored one, so a clone can set its own origin
 * or licence without editing a tracked file.
 */
export async function Layer(Root: string): Promise<Layer> {
	const PackagePath = join(Root, "package.json");
	const Package = await read(PackagePath);

	if (Package === null) {
		throw new Error(
			`${PackagePath}: missing; the content layer needs a package name and version`,
		);
	}

	const Name = Package["name"];
	const Version = Package["version"];

	if (typeof Name !== "string" || Name === "" || typeof Version !== "string" || Version === "") {
		throw new Error(`${PackagePath}: expected a non-empty name and version`);
	}

	const ConfigurationPath = join(Root, "Content", "Configuration.json");
	const LocalPath = join(Root, "Content", "Configuration.local.json");

	const Values: Record<string, string> = {
		PACKAGE_NAME: Name,
		VERSION_PACKAGE: Version,
		...flatten(await read(ConfigurationPath), ConfigurationPath),
		...flatten(await read(LocalPath), LocalPath),
	};

	// The content tree, in the order every path in this repository resolves:
	// relative to this module's own location first, then `MAINTAIN_CONTENT`, then
	// the absolute default under the root. A relative variable is anchored the
	// same way, so `MAINTAIN_CONTENT=Content` means the same tree from any cwd.
	const declared = process.env["MAINTAIN_CONTENT"];
	const Directory =
		declared !== undefined && declared.length > 0
			? isAbsolute(declared)
				? declared
				: resolve(Root, declared)
			: join(Root, "Content");

	const Entries = await Collect(Directory);

	return { Entries, Values, Define: Define(Entries, Values) };
}

/** The repository root. This file lives in `Maintain/Configuration`. */
export const Root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The tool layer's content layer: the repository's own tree. */
export const Content = (): Promise<Layer> => Layer(Root);
