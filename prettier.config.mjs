/** @type {import('prettier').Config} */

/**
 * Mirrors the PlayForm sibling sites so this repository formats identically:
 * tabs for indentation, 100 columns, double quotes, semicolons, trailing commas.
 *
 * Two decisions that look cosmetic but are not:
 *
 * - `useTabs: true` keeps indentation one byte per level, so a deep tree costs
 *   less in diffs and screen readers can be told a tab width.
 * - `endOfLine: "lf"` is load-bearing here: extensionless hook scripts in
 *   `.githooks/` break with `env: bash\r` when CRLF creeps in.
 */
export default {
	printWidth: 100,
	useTabs: true,
	tabWidth: 4,
	semi: true,
	singleQuote: false,
	trailingComma: "all",
	bracketSameLine: true,
	bracketSpacing: true,
	arrowParens: "always",
	endOfLine: "lf",
	proseWrap: "always",
	quoteProps: "preserve",

	htmlWhitespaceSensitivity: "css",
	jsxSingleQuote: false,
	vueIndentScriptAndStyle: true,
	embeddedLanguageFormatting: "auto",

	plugins: ["@ianvs/prettier-plugin-sort-imports", "prettier-plugin-astro"],

	overrides: [
		{
			files: "*.astro",
			options: { parser: "astro" },
		},
		{
			// Prettier's json parser accepts comments; keep output standard.
			files: ["*.json", "*.jsonc"],
			options: { parser: "json", trailingComma: "none" },
		},
		{
			// YAML has no tab indentation.
			files: ["*.{yaml,yml}"],
			options: { useTabs: false, tabWidth: 2 },
		},
	],
};
