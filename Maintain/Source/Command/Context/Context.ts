import type { CommandDefinition, Values } from "../../CLI/Parser/Parser.ts";
import { resolve } from "../../Transport/Select.ts";
import type { Transport } from "../../Transport/Transport.ts";

/**
 * What a command body is handed.
 *
 * `values` is argv, parsed. `transport` is the seam: a command names the
 * capability it needs (`CommandDefinition.transport`) and reads this, never an
 * implementation. The property is a getter so a command that declares nothing
 * never resolves one - which is what keeps `store status` working with the
 * browser shut and with no transport named.
 */
export type CommandContext = {
	readonly values: Values;
	readonly transport: Transport;
};

/**
 * Build the context for one run.
 *
 * A declared requirement is resolved here, eagerly: a read-only refusal has to
 * land before the body executes, not at the moment the body first reaches for
 * the transport. A command that declares nothing pays for nothing.
 */
export function create(command: CommandDefinition, values: Values): CommandContext {
	let transport: Transport | null = null;
	const open = (): Transport => (transport ??= resolve(command, values));

	if (command.transport !== undefined) open();

	return {
		values,
		get transport(): Transport {
			return open();
		},
	};
}
