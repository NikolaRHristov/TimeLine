/**
 * @module ComponentState
 *
 * The seven states every interactive component has, and the one channel each of
 * them changes.
 *
 * RFC-0049 fixes the set - `rest`, `hover`, `focus`, `active`, `selected`,
 * `locked`, `busy` - and this module is the only place it is declared. A
 * component that needs an eighth state is a vocabulary change in this file, and
 * `Documentation/Skill/Tool-Archive/Reference/TokenContract.mjs` fails the
 * build when a sheet, a stylesheet or a component names a state that is not in
 * the set.
 *
 * The reason the set is shared rather than documented per component: eleven
 * components with eleven spellings of "hover" is the drift every design system
 * drifts into, and a reader cannot tell whether two of them mean the same
 * thing. The same argument applies to `active` and `selected`, which look alike
 * and are not - one is the key or the pointer being down right now, the other
 * is the record the surface is showing - so they are separate members of the
 * set and separate channels of change.
 *
 * The module is dependency-free, holds no markup and renders nothing: it states
 * the facts a control has and derives one state from them. That is what lets
 * `Scripts/StateContract.mjs` import it directly and assert the contract, and
 * what keeps a page from having to know how a state is drawn.
 *
 * Two rules are enforced here rather than in review, because a component cannot
 * be trusted to remember them:
 *
 * - `locked` carries a reason. `StateOf` refuses to produce a locked state
 *   without one, so a forbidden control cannot be rendered as a dead end.
 * - A state is derived, never passed. There is no `IsSelected` boolean on the
 *   way out of this module - the caller's facts go in and one named state comes
 *   out, because a flag cannot say which of seven states it meant.
 */

/**
 * The closed set, in the order the composition introduces them.
 *
 * `rest` is where every control starts; the other six are reached from it. The
 * order is stable because the token contract reads this array to learn the set,
 * so reordering it reorders the documentation and nothing else.
 */
export const ComponentState = [
	"rest",
	"hover",
	"focus",
	"active",
	"selected",
	"locked",
	"busy",
] as const;

/** One of the seven. A component takes this type, never a bare string. */
export type ComponentStateName = (typeof ComponentState)[number];

/**
 * The one channel a state is allowed to change.
 *
 * The composition has three channels - the face an element is filled with, the
 * line that edges it, and the ink that draws what is on it - and a state moves
 * exactly one of them. Two at once reads as a different component rather than
 * as the same component in a different state, which is the failure RFC-0049
 * rule 7 exists to prevent.
 *
 * `rest` owns `none`: it is the baseline every other state is a change from,
 * not a change itself.
 */
export type StateChannel = "none" | "face" | "line" | "ink";

/**
 * Which channel each state moves.
 *
 * `active` and `selected` are deliberately on different channels - a pressed
 * row steps its face, a chosen row moves its line - so a reader never has to
 * work out which of the two a row is in. `focus` draws its ring on the line
 * channel, outside the element, so the ring cannot be mistaken for a border
 * that belongs to the design. `locked` moves ink and gains a glyph, which is
 * what separates it from `disabled`: a disabled control is quieter, a locked
 * one is legible and says why it is closed.
 */
export const StateChannel: Readonly<Record<ComponentStateName, StateChannel>> = {
	rest: "none",
	hover: "face",
	focus: "line",
	active: "face",
	selected: "line",
	locked: "ink",
	busy: "line",
};

/**
 * The input that reaches a state without a pointer.
 *
 * RFC-0049 rule 6: a state reachable only by hover is a state half the readers
 * cannot see, and it is also the state most likely to be untested. So each
 * state names its keyboard twin. `hover` names `focus` rather than itself,
 * because the affordance a pointer reveals is the one the tab key reveals too -
 * there is no pointer-only state in the set.
 */
export type StateReach =
	"none" | "focus" | "tab" | "key-down" | "enter-or-space" | "reason" | "action";

/** Which input reaches each state. Only `rest` is reached by nothing. */
export const StateReach: Readonly<Record<ComponentStateName, StateReach>> = {
	rest: "none",
	hover: "focus",
	focus: "tab",
	active: "key-down",
	selected: "enter-or-space",
	locked: "reason",
	busy: "action",
};

/**
 * The attribute a component publishes its state on.
 *
 * `data-control-state` rather than a class, because a class is also a hook for
 * styling that is not a state, and a surface that needs to know the state (a
 * test, an island, a screenshot) should read one attribute rather than parse a
 * list.
 *
 * It is also not the bare `data-state`, because the tree holds three closed sets
 * of states and one attribute cannot carry all three: a capability cell states
 * `running`, `available` or `absent` (RFC-0046), a collection states `partial`
 * or `stale` (RFC-0050, published as `data-read`), and a control states one of
 * the seven above. Three sets, three attributes - the token contract fails the
 * build when a control's state is published under a name that belongs to one of
 * the others.
 */
export const StateAttribute = "data-control-state";

/**
 * The mark a state adds, when it adds one.
 *
 * Only `locked` draws a glyph: the lock is the part of the state a reader sees
 * before reading the reason, and it is the shape that tells a permission apart
 * from a bug. The name is the icon set's (`Source/Component/Workspace/Icon.tsx`),
 * so a component renders `<Icon Name={Glyph} />` without a second table.
 */
export const StateGlyph: Readonly<Record<ComponentStateName, string | null>> = {
	rest: null,
	hover: null,
	focus: null,
	active: null,
	selected: null,
	locked: "lock",
	busy: null,
};

/**
 * What a control knows about itself.
 *
 * These are facts, not states: a row can be both hovered and selected, and it is
 * this module's job to say which of the two the surface draws. `Locked` is a
 * string rather than a boolean because the reason is the state's whole content
 * (RFC-0049 rule 4) - a locked control that cannot say why is the dead end the
 * rule exists to prevent.
 */
export interface StateFacts {
	readonly Hover?: boolean;
	readonly Focus?: boolean;
	readonly Active?: boolean;
	readonly Selected?: boolean;
	readonly Busy?: boolean;
	readonly Locked?: string;
}

/** One state, with the reason it is locked and the glyph it draws. */
export interface StateResolution {
	readonly State: ComponentStateName;
	readonly Reason: string | null;
	readonly Glyph: string | null;
}

/**
 * Raised when a caller tries to reach a state the set does not allow.
 *
 * A thrown error rather than a silent fallback to `rest`: a control rendered in
 * the wrong state looks deliberate, and the bug then survives review. The
 * message names the rule so the fix is the obvious one.
 */
export class StateContractError extends Error {
	constructor(Message: string) {
		super(Message);
		this.name = "StateContractError";
	}
}

/**
 * The order the facts are read in, which is the order of precedence.
 *
 * `locked` first, because a control a person may not use must never look
 * available for the moment before it is read. Then `busy`, because work in
 * flight outranks a selection. Then `active` before `selected`, so a row being
 * pressed looks pressed rather than chosen - the bug RFC-0049 rule 2 names.
 * Then the two pointer states, `focus` before `hover` because the ring is the
 * affordance a keyboard reader has.
 */
export const StatePrecedence: readonly Exclude<ComponentStateName, "rest">[] = [
	"locked",
	"busy",
	"active",
	"selected",
	"focus",
	"hover",
];

/** Whether a string is one of the seven. The guard a boundary uses. */
export function IsComponentState(Value: string): Value is ComponentStateName {
	return (ComponentState as readonly string[]).includes(Value);
}

const Resolution = (Name: ComponentStateName, Reason: string | null = null): StateResolution => ({
	State: Name,
	Reason,
	Glyph: StateGlyph[Name],
});

/**
 * The state a control is in, derived from the facts it has.
 *
 * The facts are checked rather than trusted: a toggle handed a string or a
 * number is a caller that meant something else, and the error names which fact
 * was wrong. `Locked` is checked hardest - an empty or blank reason is refused,
 * because a lock with nothing written on it is indistinguishable from a broken
 * control, and that is the one thing `locked` exists to avoid.
 */
export function StateOf(Facts: StateFacts): StateResolution {
	const Locked = Facts.Locked;

	if (Locked !== undefined) {
		if (typeof Locked !== "string") {
			throw new StateContractError(
				`locked takes the reason it is locked, not ${typeof Locked} - a locked control without a reason is a dead end (RFC-0049 rule 4). Pass the grant or the audience that would open it.`,
			);
		}

		const Reason = Locked.trim();

		if (Reason === "") {
			throw new StateContractError(
				"locked was given an empty reason - say what would open the control (a grant, an audience, a session) or leave the control disabled instead.",
			);
		}

		return Resolution("locked", Reason);
	}

	const Known: Record<Exclude<ComponentStateName, "rest">, boolean | string | undefined> = {
		locked: undefined,
		busy: Facts.Busy,
		active: Facts.Active,
		selected: Facts.Selected,
		focus: Facts.Focus,
		hover: Facts.Hover,
	};

	for (const Name of StatePrecedence) {
		const Value = Known[Name];

		if (Value === undefined) {
			continue;
		}

		if (typeof Value !== "boolean") {
			throw new StateContractError(
				`${Name} was given ${typeof Value} - a state fact is a boolean, and only locked carries text.`,
			);
		}

		if (Value) {
			return Resolution(Name);
		}
	}

	return Resolution("rest");
}

export default StateOf;
