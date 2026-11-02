/**
 * JSON is the only output channel: one object per command, two-space indent.
 * Key order is the order a command writes its keys - deterministic per command,
 * which is what diffing event and post files needs.
 */
export function stringify(value: unknown): string {
	return JSON.stringify(value, null, 2) ?? "null";
}

export function write(value: unknown): void {
	process.stdout.write(`${stringify(value)}\n`);
}
