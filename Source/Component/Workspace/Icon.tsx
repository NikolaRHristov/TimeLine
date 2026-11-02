import type { JSX } from "solid-js";

// The icon set the workspace draws, as path data rather than as twenty image
// files. Every icon is a 24-unit outline stroked in `currentColor`, so a tile, a
// card and a control all inherit the colour their container already decided -
// which is what keeps a selected row's icon indigo without a second rule.
//
// The set is closed on purpose: a name that is not here renders nothing, and
// that is a visible gap in review rather than a silent fetch of something a
// designer never approved.
const Path: Record<string, JSX.Element> = {
	"arrow-down": <path d="M12 5v14M19 12l-7 7-7-7" />,
	"arrow-down-circle": (
		<>
			<circle cx="12" cy="12" r="10" />
			<path d="M8 12l4 4 4-4M12 8v8" />
		</>
	),
	"chevron-left": <path d="M15 18l-6-6 6-6" />,
	"chevron-right": <path d="M9 18l6-6-6-6" />,
	"file-text": (
		<>
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<path d="M14 2v6h6M9 13h6M9 17h6" />
		</>
	),
	folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
	"git-branch": (
		<>
			<path d="M6 3v12" />
			<circle cx="18" cy="6" r="3" />
			<circle cx="6" cy="18" r="3" />
			<path d="M18 9a9 9 0 0 1-9 9" />
		</>
	),
	layout: (
		<>
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<path d="M3 9h18M9 21V9" />
		</>
	),
	list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
	lock: (
		<>
			<rect x="4" y="10" width="16" height="11" rx="2" />
			<path d="M8 10V7a4 4 0 0 1 8 0v3" />
		</>
	),
	"message-circle": (
		<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
	),
	"more-vertical": (
		<>
			<circle cx="12" cy="5" r="1" />
			<circle cx="12" cy="12" r="1" />
			<circle cx="12" cy="19" r="1" />
		</>
	),
	plus: <path d="M12 5v14M5 12h14" />,
};

export interface IconProps {
	Name: keyof typeof Path | string;
	Class?: string;
}

export default function Icon(Props: IconProps) {
	return (
		<svg
			class={Props.Class}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			focusable="false">
			{Path[Props.Name] ?? null}
		</svg>
	);
}
