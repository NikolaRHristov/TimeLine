import { For, Show } from "solid-js";
import DrawerItem, { type Entry } from "./DrawerItem.tsx";
import Icon from "./Icon.tsx";

/**
 * One column of the drawer.
 *
 * The column owns the accent for everything inside it - the drop ghost's colour
 * arrives as `--ghost-tone`, so the affordance that publishes names the stage it
 * feeds without any item knowing what that stage is. That is also why the ghost
 * is drawn here rather than as a member of `Entries`: it is not a record, it is
 * the column's own invitation.
 */
export interface Column {
	/** The stage key this column feeds, e.g. `bookmark`. */
	Key: string;
	/** What the tab prints. */
	Label: string;
	/** The accent for this column's selected row and ghost. */
	Tone: string;
	/** The sentence on the dashed row, e.g. `Drag to showcase ↓`. */
	Ghost: string;
	Entries: Entry[];
}

interface Props {
	Column: Column;
	Active: boolean;
	OnActivate: (Key: string) => void;
	OnOpen: (Id: string) => void;
	OnPublish: (Key: string) => void;
}

export default function DrawerColumn(Props: Props) {
	return (
		<section
			class="drawer-column"
			classList={{ "drawer-column--active": Props.Active }}
			aria-label={Props.Column.Label}
			onFocusIn={() => Props.OnActivate(Props.Column.Key)}>
			<div class="drawer-column__inner">
				<For each={Props.Column.Entries}>
					{(Entry) => <DrawerItem Entry={Entry} OnOpen={Props.OnOpen} />}
				</For>

				<Show when={Props.Column.Entries.length > 0}>
					<button
						type="button"
						class="drawer-item drawer-item--ghost"
						style={{ "--ghost-tone": Props.Column.Tone }}
						onClick={() => Props.OnPublish(Props.Column.Key)}>
						<Icon Name="arrow-down" Class="drawer-item__icon" />
						<span class="drawer-item__title">{Props.Column.Ghost}</span>
					</button>
				</Show>
			</div>
		</section>
	);
}
