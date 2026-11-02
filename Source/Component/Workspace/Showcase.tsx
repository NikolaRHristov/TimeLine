import "@Stylesheet/Component/Note.scss";
import "@Stylesheet/Component/Showcase.scss";
import "@Stylesheet/Component/Workspace.scss";
import { createSignal, For, Show } from "solid-js";
import Bento, { type Tile } from "./Bento.tsx";
import Provenance, { type Stage } from "./Provenance.tsx";
import Publish from "./Publish.tsx";

/**
 * The showcase: the workspace with its private half dropped.
 *
 * The parts are the ones `/Workspace` mounts and none of them is a copy -
 * `Provenance` draws the drum, `Publish` draws the seam, `Bento` draws the
 * canvas - so the composition cannot drift into two designs. What this file adds
 * is the arrangement and the one signal the parts share.
 *
 * The drawer's band becomes the page's masthead. The workspace answers "where am
 * I" inside the drawer's header, and a page with no drawer has to answer it
 * somewhere: the band above the seam carries the title, the sentence that counts
 * what the archive holds, and the routes a reader can leave by. Without it the
 * page is a frame with no name and no way out, which is the one thing a public
 * surface may not be.
 *
 * The signal is what the rail is for. A band is a `<button>`, so a press has to
 * answer: it moves the selection, the drum redraws around it, and the seam names
 * the stage the rail landed on. The canvas does not read it - the tiles are the
 * owner's picks and the feed, and no stage selection changes them - so the page
 * is complete before anyone presses anything, and complete again when the
 * scripts never run: every part here is server-rendered and only the press is
 * lost.
 *
 * Publishing is the gesture this composition does not carry. A drop came from
 * the drawer's queue; with no drawer there is nothing to drag, so the seam stays
 * a seam. It states where the canvas publishes to and which stage is selected
 * rather than offering a drop with no source.
 */
export interface ShowcaseLink {
	Href: string;
	Label: string;
}

/** The masthead's words, all decided by the page. */
export interface ShowcaseHead {
	/** The small line above the title. */
	Eyebrow: string;
	/** The page's title, and the document's only `<h1>`. */
	Title: string;
	/** The sentence under the title. */
	Lede: string;
	/** What the route row is, for a screen reader. */
	Label: string;
	/** The routes a reader can leave by. */
	Links: readonly ShowcaseLink[];
}

/** What an empty archive says instead of drawing a page of grey seats. */
export interface ShowcaseEmpty {
	Title: string;
	Body: string;
	/** The commands that fill the archive, in the order they are run. */
	Steps: readonly string[];
	Hint: string;
	/** The document the hint points at. */
	Reference: string;
}

interface Props {
	Stages: Stage[];
	Tiles: Tile[];
	/** The rail's standing note under the scroll bar. */
	Note: string;
	Head: ShowcaseHead;
	/** The seam's destination, e.g. `Showcase · Network`. */
	Destination: string;
	/** The seam's standing line, before the selected stage is named. */
	Instruction: string;
	/** Rendered under the seam when the archive holds nothing to draw. */
	Empty?: ShowcaseEmpty;
}

export default function Showcase(Props: Props) {
	const [Stage, SetStage] = createSignal(Props.Stages[0]?.Key ?? "");

	/**
	 * The selected stage's short name, for the seam's line.
	 *
	 * A stage label reads `Source · 3 events` and the seam wants only the name:
	 * the count belongs to the rail, where the band can show it, not to a band
	 * with room for one clause.
	 */
	const StageName = () =>
		(Props.Stages.find((Entry) => Entry.Key === Stage())?.Label ?? "").split(" · ")[0];

	return (
		<div class="workspace showcase">
			<Provenance
				Stages={Props.Stages}
				Selected={Stage()}
				Note={Props.Note}
				OnSelect={(Key) => SetStage(Key)}
			/>

			<div class="workspace__body">
				<header class="showcase__head">
					<div class="showcase__identity">
						<p class="showcase__eyebrow">{Props.Head.Eyebrow}</p>
						<h1 class="showcase__title">{Props.Head.Title}</h1>
						<p class="showcase__lede">{Props.Head.Lede}</p>
					</div>

					<nav class="showcase__nav" aria-label={Props.Head.Label}>
						<ul>
							<For each={Props.Head.Links}>
								{(Link) => (
									<li>
										<a href={Link.Href}>{Link.Label}</a>
									</li>
								)}
							</For>
						</ul>
					</nav>
				</header>

				<Publish Label={Props.Destination} Note={Props.Instruction} Context={StageName()} />

				<Show when={Props.Empty}>
					{(Empty) => (
						<section class="showcase__empty">
							<div class="note">
								<h2 class="note__title">{Empty().Title}</h2>
								<p class="note__body">{Empty().Body}</p>
								<ol>
									<For each={Empty().Steps}>
										{(Step) => (
											<li>
												<code>{Step}</code>
											</li>
										)}
									</For>
								</ol>
								<p class="note__body">
									{Empty().Hint}
									<code>{Empty().Reference}</code>.
								</p>
							</div>
						</section>
					)}
				</Show>

				<Bento Tiles={Props.Tiles} />
			</div>
		</div>
	);
}
