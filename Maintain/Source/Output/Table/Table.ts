/** A column is a key into the same object the JSON path prints. */
export type Column = { key: string; header: string };

/**
 * Render rows as padded columns. A table is a rendering of the JSON object,
 * never a second code path: the rows handed in are the object's own records.
 */
export function render(
	rows: readonly Record<string, unknown>[],
	columns: readonly Column[],
): string {
	const cells = rows.map((row) => columns.map((column) => String(row[column.key] ?? "")));
	const widths = columns.map((column, index) =>
		Math.max(column.header.length, ...cells.map((row) => row[index]!.length)),
	);
	const head = columns.map((column, index) => column.header.padEnd(widths[index]!)).join("  ");
	const body = cells.map((row) =>
		row.map((cell, index) => cell.padEnd(widths[index]!)).join("  "),
	);
	return `${[head, ...body].join("\n")}\n`;
}
