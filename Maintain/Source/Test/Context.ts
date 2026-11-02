import type { Values } from "../CLI/Parser/Parser.ts";
import type { CommandContext } from "../Command/Context/Context.ts";
import { view } from "../Transport/View/Transport.ts";

/**
 * A command context for a test.
 *
 * The transport is the archive one because constructing it touches nothing: no
 * socket, no navigation, and no file read until a method is called. A test that
 * hands this to a command which actually uses its transport therefore gets a
 * named refusal rather than a fake success - which is the failure such a test
 * should be reading anyway.
 */
export function context(values: Values = {}): CommandContext {
	return { values, transport: view() };
}
