import "@Stylesheet/Component/Drawer.scss";
import { For } from "solid-js";
import DrawerColumn, { type Column } from "./DrawerColumn.tsx";
import Icon from "./Icon.tsx";

/**
 * The drawer's header and its band of columns.
 *
 * The header answers three questions in the order a person asks them: where am I
 * (the depth path), what is this (the title), and what may I do here (the hint
 * and the view switch). The columns below are the workspace itself.
 *
 * `View` is a real switch and not a decoration: the same records are laid out as
 * columns or as one ranked list, so a person scanning a long queue is not forced
 * through a column that scrolls.
 */
export type DrawerView = "graph" | "list";

interface Props {
	Eyebrow: string;
	Title: string;
	Hint: string;
	Columns: Column[];
	Active: string;
	View: DrawerView;
	OnActivate: (Key: string) => void;
	OnView: (View: DrawerView) => void;
	OnOpen: (Id: string) => void;
	OnAdd: () => void;
	OnPublish: (Key: string) => void;
}

export default function Drawer(Props: Props) {
	return (
		<div class="drawer">
			<div class="drawer__header">
				<div class="drawer__title-group">
					<span class="drawer__depth" aria-hidden="true">
						<Icon Name="chevron-left" />
					</span>

					<span class="drawer__heading">
						<span class="drawer__eyebrow">{Props.Eyebrow}</span>
						<span class="drawer__name">{Props.Title}</span>
					</span>

					<span class="drawer__depth" aria-hidden="true">
						<Icon Name="chevron-right" />
					</span>
				</div>

				<p class="drawer__hint">
					<Icon Name="lock" />
					<span class="drawer__hint-text">{Props.Hint}</span>
				</p>

				<div class="drawer__views" role="group" aria-label="Layout">
					<button
						type="button"
						class="drawer__view"
						classList={{ "drawer__view--active": Props.View === "graph" }}
						aria-pressed={Props.View === "graph"}
						onClick={() => Props.OnView("graph")}>
						<Icon Name="git-branch" />
						Graph
					</button>

					<button
						type="button"
						class="drawer__view"
						classList={{ "drawer__view--active": Props.View === "list" }}
						aria-pressed={Props.View === "list"}
						onClick={() => Props.OnView("list")}>
						<Icon Name="list" />
						List
					</button>
				</div>
			</div>

			<div class="drawer__tabs">
				<div class="drawer__tabs-spacer">
					<button type="button" class="drawer__add" onClick={() => Props.OnAdd()}>
						<Icon Name="plus" />
						Add folder
					</button>
				</div>
			</div>

			<div class="drawer__columns">
				<For each={Props.Columns}>
					{(Column) => (
						<DrawerColumn
							Column={Column}
							Active={Column.Key === Props.Active}
							OnActivate={Props.OnActivate}
							OnOpen={Props.OnOpen}
							OnPublish={Props.OnPublish}
						/>
					)}
				</For>
			</div>
		</div>
	);
}
