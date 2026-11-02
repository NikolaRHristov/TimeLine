import "@Stylesheet/Component/Drawer.scss";
import { Read as ReadState } from "@Library/DataState.ts";
import { For, Show } from "solid-js";
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
 *
 * The drawer is the reader's own, so an empty one is a state and not a failure
 * (RFC-0054 §2). It is drawn over the four lanes rather than instead of them:
 * the lanes are the composition's structure and a reader should see the shape
 * that will hold their records, while the note states what the shape is waiting
 * for and the command that fills it (RFC-0050 rule 1). The state is derived from
 * the rows the drawer was handed - never passed in as a flag - so a drawer that
 * gains a record stops being empty without anyone telling it to.
 *
 * The title is the page's `<h1>`. The composition draws no page heading above
 * the frame - the rail names the stage and the drawer names the surface - so the
 * drawer's own title is the only element that names the document, and a page
 * without a heading is a page a screen reader cannot outline. It keeps its
 * 13px semibold face: the level is the document's, not a type step.
 */
export type DrawerView = "graph" | "list";

/** What an empty drawer says, in the page's own words. */
export interface DrawerEmpty {
	Title: string;
	Body: string;
	/** The prerequisite of the command, as a sentence that ends in `Reference`. */
	Hint: string;
	/** The document the hint points at. */
	Reference: string;
}

interface Props {
	Eyebrow: string;
	Title: string;
	Hint: string;
	Columns: Column[];
	Active: string;
	View: DrawerView;
	/** The command that fills an empty drawer (RFC-0050 rule 1). */
	Remedy: string;
	/** What the drawer says while it holds nothing. */
	Empty: DrawerEmpty;
	OnActivate: (Key: string) => void;
	OnView: (View: DrawerView) => void;
	OnOpen: (Id: string) => void;
	OnAdd: () => void;
	OnPublish: (Key: string) => void;
}

export default function Drawer(Props: Props) {
	/** How many rows the drawer holds, across every lane. */
	const Count = () => Props.Columns.reduce((Total, Column) => Total + Column.Entries.length, 0);

	/** The drawer's own read, in the one shape every surface renders (RFC-0050). */
	const State = () => ReadState({ Count: Count(), Remedy: Props.Remedy });

	return (
		<div class="drawer">
			<div class="drawer__header">
				<div class="drawer__title-group">
					<span class="drawer__depth" aria-hidden="true">
						<Icon Name="chevron-left" />
					</span>

					<div class="drawer__heading">
						<span class="drawer__eyebrow">{Props.Eyebrow}</span>
						<h1 class="drawer__name">{Props.Title}</h1>
					</div>

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

			<div
				class="drawer__columns"
				classList={{ "drawer__columns--empty": State().State === "empty" }}>
				<Show when={State().State === "empty"}>
					<section class="drawer__empty note note--chrome" data-read={State().State}>
						<h2 class="note__title">{Props.Empty.Title}</h2>
						<p class="note__body">{Props.Empty.Body}</p>
						<p class="note__meta">
							<code>{State().Remedy}</code>
						</p>
						<p class="note__body">
							{Props.Empty.Hint} <code>{Props.Empty.Reference}</code>.
						</p>
					</section>
				</Show>

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
