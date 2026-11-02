import "@Stylesheet/Component/Context.scss";
import { Key, type Context } from "@Script/Session/Context.ts";
import { Stamp, type IslandState } from "@Script/Session/State.ts";
import { For, Show } from "solid-js";

/**
 * The context strip: which place the workspace is looking at, and how current
 * what it shows is.
 *
 * The two belong together because they answer one question. A person selects the
 * owner's own archive or one room of their User Network, and the strip says
 * which of the four states produced the canvas beside it - `live`, `snapshot`,
 * `static` or `joined` - with the time that state is current to. Naming the
 * state is what separates this ladder from the silent fallback RFC-0003 refuses:
 * a reader who cannot tell live rows from the build's rows will act on the
 * build's rows.
 *
 * The strip renders every context the session holds and nothing else. With an
 * empty session that is the owner's own archive alone, which is why a visitor
 * with no session sees one tab and a state line rather than an invented room.
 */
interface Props {
	Contexts: readonly Context[];
	Selected: Context;
	State: IslandState;
	AsOf: string | null;
	OnSelect: (Next: Context) => void;
}

export default function ContextSwitch(Props: Props) {
	return (
		<div class="context">
			<div class="context__tabs" role="group" aria-label="Context">
				<For each={Props.Contexts}>
					{(Entry) => (
						<button
							type="button"
							class="context__tab"
							classList={{
								"context__tab--active": Key(Entry) === Key(Props.Selected),
							}}
							aria-pressed={Key(Entry) === Key(Props.Selected)}
							onClick={() => Props.OnSelect(Entry)}>
							{Entry.Label}
						</button>
					)}
				</For>
			</div>

			<p class="context__state" data-state={Props.State}>
				<span class="context__state-word">{Props.State}</span>
				<span class="context__state-rule" aria-hidden="true">
					·
				</span>
				<Show
					when={Props.AsOf}
					keyed
					fallback={<span class="context__state-time">time unknown</span>}>
					{(AsOf) => (
						<time class="context__state-time" datetime={AsOf}>
							{Stamp(AsOf)}
						</time>
					)}
				</Show>
			</p>
		</div>
	);
}
