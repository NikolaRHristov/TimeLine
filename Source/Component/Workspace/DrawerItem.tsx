import { Match, Show, Switch } from "solid-js";
import Icon from "./Icon.tsx";

/**
 * One row in a drawer column.
 *
 * The four kinds are the four content shapes the composition draws, and the kind
 * decides the height as well as the leading element - a text row is 36px and
 * leads with an icon, a media row is 44px and leads with a thumbnail, a comment
 * row is 44px and leads with an avatar, and a control row is 28px and has no
 * trailing action. That coupling is why there is one component rather than four:
 * the shape and the height cannot disagree.
 */
export interface Entry {
	/** The record's own key - a status id, a handle, a list slug. */
	Id: string;
	/** The line the row prints. */
	Title: string;
	/** The quieter line under it. */
	Meta: string;
	Kind: "text" | "media" | "control" | "comment";
	/** The icon name for a text row. */
	Icon?: string;
	/** The thumbnail for a media row. */
	Thumb?: string;
	/** The two-letter mark for a comment row. */
	Avatar?: string;
	/**
	 * The identity whose subkey signed the record, when the drawer knows it.
	 *
	 * A row is published under its author's signature (RFC-0012 rule 2), so a
	 * record whose author is unknown can be shown but not addressed to a room.
	 */
	Author?: string;
	/** Whether the workspace currently has this row open. */
	Selected?: boolean;
}

interface Props {
	Entry: Entry;
	OnOpen?: (Id: string) => void;
}

export default function DrawerItem(Props: Props) {
	return (
		<button
			type="button"
			class="drawer-item"
			classList={{
				"drawer-item--text": Props.Entry.Kind === "text",
				"drawer-item--media": Props.Entry.Kind === "media",
				"drawer-item--comment": Props.Entry.Kind === "comment",
				"drawer-item--control": Props.Entry.Kind === "control",
				"drawer-item--selected": Props.Entry.Selected === true,
			}}
			aria-pressed={Props.Entry.Selected === true}
			onClick={() => Props.OnOpen?.(Props.Entry.Id)}>
			<Switch>
				<Match when={Props.Entry.Kind === "media"}>
					<Show when={Props.Entry.Thumb !== undefined}>
						<img
							class="drawer-item__thumb"
							src={Props.Entry.Thumb}
							alt=""
							loading="lazy"
						/>
					</Show>
				</Match>
				<Match when={Props.Entry.Kind === "comment"}>
					<span class="drawer-item__avatar" aria-hidden="true">
						{Props.Entry.Avatar ?? Props.Entry.Title.slice(0, 2)}
					</span>
				</Match>
				<Match when={Props.Entry.Icon !== undefined}>
					<Icon Name={Props.Entry.Icon} Class="drawer-item__icon" />
				</Match>
			</Switch>

			<span class="drawer-item__body">
				<span class="drawer-item__title">{Props.Entry.Title}</span>
				<span class="drawer-item__meta">{Props.Entry.Meta}</span>
			</span>

			<Show
				when={Props.Entry.Kind === "comment"}
				fallback={
					<Show when={Props.Entry.Kind !== "control"}>
						<Icon Name="more-vertical" Class="drawer-item__action" />
					</Show>
				}>
				<Icon Name="message-circle" Class="drawer-item__action" />
			</Show>
		</button>
	);
}
