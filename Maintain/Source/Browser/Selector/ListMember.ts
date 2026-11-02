/**
 * Where a handle's list membership lives, in one file.
 *
 * Same contract as `Selector/Post.ts`: `inPage` never runs in Node - its source
 * text is sent to the page, so every selector, label and wait lives here and
 * nowhere else. The flow is the profile's own: the header's "More" caret opens
 * "Add/remove from Lists", which opens a "Pick a List" dialog of checkboxes;
 * clicking a row stages the membership and Save commits it.
 *
 * Two facts this file exists to record, both probed against the live client:
 *
 * - A row is `div[role="checkbox"][data-testid="listCell"]` and its state is
 *   `aria-checked`. The row's label is `<list name>·<n> members<owner>`, so the
 *   list name is the text before the middle dot.
 * - Closing the dialog without pressing Save writes nothing. That is what makes
 *   a dry run a read: it may open the dialog, but it never clicks a row.
 */

export type ListMemberRequest =
	| { op: "open" }
	| { op: "rows" }
	| { op: "pick"; name: string }
	| { op: "save" }
	| { op: "close" };

export type ListMemberResult = {
	/** The dialog is up and has at least one row. */
	ready: boolean;
	/** The caret and the menu item were both found and clicked. */
	opened: boolean;
	/** `pick` found exactly one row with that name. */
	found: boolean;
	/** `pick` found more than one row with that name. */
	ambiguous: boolean;
	/** The button this op was asked to press was pressed. */
	clicked: boolean;
	/** Save exists but is disabled - nothing is staged. */
	save: boolean;
	rows: { name: string; checked: boolean }[];
	alerts: string[];
};

async function inPage(request: {
	op: string;
	name?: string;
}): Promise<unknown> {
	const sleep = (ms: number): Promise<void> =>
		new Promise((resolve) => setTimeout(resolve, ms));
	const text = (node: Element | null): string =>
		node === null ? "" : (node.textContent ?? "").trim();

	/** The dialog with the most nodes: the page keeps smaller ones mounted too. */
	const dialog = (): Element | null => {
		let best: Element | null = null;
		for (const candidate of Array.from(
			document.querySelectorAll('[role="dialog"]'),
		)) {
			if (
				best === null ||
				candidate.querySelectorAll("*").length >
					best.querySelectorAll("*").length
			) {
				best = candidate;
			}
		}
		return best;
	};

	const cells = (): Element[] => {
		const root = dialog();
		return root === null
			? []
			: Array.from(root.querySelectorAll('[data-testid="listCell"]'));
	};

	/** "Alpha·70 membersExample Person@example_handle" -> "Alpha". */
	const nameOf = (cell: Element): string => {
		const head = (cell.textContent ?? "").split("·")[0];
		return head === undefined ? "" : head.trim();
	};

	const rows = (): { name: string; checked: boolean }[] =>
		cells().map((cell) => ({
			name: nameOf(cell),
			checked: cell.getAttribute("aria-checked") === "true",
		}));

	const alerts = (): string[] =>
		Array.from(
			document.querySelectorAll('[role="alert"], [data-testid="toast"]'),
		)
			.map((node) => text(node))
			.filter((message) => message !== "");

	const saveButton = (): Element | null => {
		const root = dialog();
		if (root === null) return null;
		return (
			Array.from(root.querySelectorAll('[role="button"], button')).find(
				(node) => /^save$/i.test(text(node)),
			) ?? null
		);
	};

	const enabled = (node: Element | null): boolean =>
		node !== null &&
		(node as HTMLButtonElement).disabled !== true &&
		node.getAttribute("aria-disabled") !== "true";

	const snapshot = (extra: Record<string, unknown> = {}): unknown => {
		const read = rows();
		return {
			ready: read.length > 0,
			opened: false,
			found: false,
			ambiguous: false,
			clicked: false,
			save: enabled(saveButton()),
			rows: read,
			alerts: alerts(),
			...extra,
		};
	};

	const press = (node: Element | null): boolean => {
		if (node === null) return false;
		(node as HTMLElement).click();
		return true;
	};

	if (request.op === "rows") return snapshot();

	if (request.op === "close") {
		const root = dialog();
		const closeButton =
			root === null
				? null
				: root.querySelector('[data-testid="app-bar-close"]');
		const clicked = press(closeButton);
		if (!clicked) {
			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Escape",
					keyCode: 27,
					bubbles: true,
				}),
			);
		}
		await sleep(400);
		return snapshot({ clicked });
	}

	if (request.op === "open") {
		if (rows().length > 0) return snapshot({ opened: true });

		const caret = document.querySelector('[data-testid="userActions"]');
		if (caret === null) return snapshot({ opened: false });
		press(caret);

		/** The menu is a portal: it mounts a tick after the caret is pressed. */
		let item: Element | null = null;
		for (let attempt = 0; attempt < 25 && item === null; attempt += 1) {
			await sleep(120);
			item =
				Array.from(document.querySelectorAll('[role="menuitem"]')).find(
					(node) =>
						/add\/remove from lists/i.test(node.textContent ?? ""),
				) ?? null;
		}
		if (item === null) return snapshot({ opened: false });
		press(item);

		/** The dialog fetches the account's lists before it has any row. */
		for (let attempt = 0; attempt < 50 && rows().length === 0; attempt += 1)
			await sleep(150);
		return snapshot({ opened: true });
	}

	if (request.op === "pick") {
		const wanted = request.name ?? "";
		const matches = cells().filter((cell) => nameOf(cell) === wanted);
		if (matches.length !== 1) {
			return snapshot({
				found: matches.length === 1,
				ambiguous: matches.length > 1,
			});
		}
		const match = matches[0];
		if (match === undefined) return snapshot({ found: false });
		const clicked = press(match);
		await sleep(700);
		return snapshot({ found: true, clicked });
	}

	if (request.op === "save") {
		const button = saveButton();
		if (!enabled(button)) return snapshot({ clicked: false });
		press(button);
		/** The write is a request behind the click; the toast lands after it. */
		await sleep(2500);
		return snapshot({ clicked: true });
	}

	return snapshot();
}

/** The expression to evaluate for one request. */
export function expression(request: ListMemberRequest): string {
	return `(${inPage.toString()})(${JSON.stringify(request)})`;
}

/** A wait-for expression: the profile header's own menu is on the page. */
export function readyExpression(): string {
	return `document.querySelector('[data-testid="userActions"]') !== null`;
}
