/**
 * The session slot as a Solid signal pair.
 *
 * A hook rather than a store, because there is one value and one transition: the
 * slot, and a context selection. The workspace store owns the drawer, the canvas
 * and the pending queue; this owns only the part that answers who is here.
 *
 * The read happens on mount, never during render, so the server-rendered HTML
 * and the first client render are the same anonymous slot and hydration has
 * nothing to disagree with. `Resolve` never rejects, so there is no error path
 * for the caller to remember.
 */
import { createSignal, onMount } from "solid-js";
import type { Context } from "./Context.ts";
import { Anonymous, Resolve, Select as SelectContext, type Reader, type Slot } from "./Session.ts";

export function UseSession(Contexts: readonly Context[], AsOf: string | null, Read?: Reader) {
	const [Slot, SetSlot] = createSignal<Slot>(Anonymous(Contexts, AsOf));

	onMount(() => {
		void Resolve(Slot(), Read).then((Next) => SetSlot(() => Next));
	});

	return {
		Slot,
		Select: (Next: Context) => SetSlot((Current) => SelectContext(Current, Next)),
	};
}
