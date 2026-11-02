import "@Stylesheet/Component/Workspace.scss";
import type { Band } from "@Library/Band.ts";
import { OwnKey, type Context } from "@Script/Session/Context.ts";
import { CrossTheSeam } from "@Script/Session/Seam.ts";
import { Anonymous, Enter, type Slot } from "@Script/Session/Session.ts";
import { store } from "@Script/Workspace/Store.ts";
import { onMount } from "solid-js";
import Bento, { type Tile } from "./Bento.tsx";
import ContextSwitch from "./ContextSwitch.tsx";
import Drawer, { type DrawerEmpty } from "./Drawer.tsx";
import { type Column } from "./DrawerColumn.tsx";
import { type Stage } from "./Provenance.tsx";
import Publish from "./Publish.tsx";
import Spectrometer from "./Spectrometer.tsx";
import StatusFooter from "./StatusFooter.tsx";
import Swimlanes from "./Swimlanes.tsx";

/**
 * The workspace body: the private drawer, the publish seam, and the published
 * canvas.
 *
 * This component holds no state. Everything a person is doing right now - which
 * stage is selected, which column is live, which record is open, which tiles have
 * been published, which context the session is looking at - lives in the
 * workspace store, which the rail beside it reads too. That is why the two are
 * separate islands: the rail can select a stage and this surface names it,
 * because there is one value behind both.
 *
 * What arrives as props is the build's data and nothing else: the stages, the
 * columns, the tiles and the contexts a page derived from its collections. The
 * page still decides what the workspace is looking at; the store decides what the
 * person has done to it since.
 *
 * The session layer decides who is here. The store holds the slot and reads it
 * once on mount, so the first render - the server's and the client's - is the
 * build's own view, and a session that never resolves leaves exactly that in
 * place.
 *
 * Publishing is the composition's core gesture, and it crosses the seam rather
 * than writing the canvas: `CrossTheSeam` is the only path from a drawer record
 * to a tile, so an act that is not a publication cannot reach the canvas even by
 * mistake. The seat a crossed record lands on is the store's, because the rail
 * beside this surface can publish into the same canvas.
 */
interface Props {
	Stages: Stage[];
	Columns: Column[];
	Tiles: Tile[];
	/** The rail's standing note under the scroll bar. */
	Note: string;
	/** The drawer's depth path, e.g. `Depth / Schema`. */
	Eyebrow: string;
	/** The drawer's title. */
	Title: string;
	/** The lock line beside the title, before a session names itself. */
	Hint: string;
	/** The publish bar's standing instruction. */
	Instruction: string;
	/**
	 * Why a drop cannot cross the seam here, or `undefined` when it can
	 * (RFC-0054 §3). Passed straight to the seam, which derives `locked` from it.
	 */
	Locked?: string;
	/** The command that fills an empty drawer (RFC-0050 rule 1). */
	Remedy: string;
	/** What the drawer says while it holds nothing (RFC-0054 §2). */
	Empty: DrawerEmpty;
	/** The contexts the rail may select, in the order it prints them. */
	Contexts: Context[];
	/** When the build's view is current to, as an ISO timestamp. */
	AsOf: string | null;
	/**
	 * The three bands below the canvas and the rail's cluster (RFC-0046 to
	 * RFC-0048).
	 *
	 * One value rather than nine props: the bands answer one question about one
	 * network, and a page that assembled them field by field could give the
	 * swimlanes and the spectrometer different peers.
	 */
	Bands: Band;
}

export default function Workspace(Props: Props) {
	const Store = store();

	Store.Adopt({
		Stages: Props.Stages,
		Columns: Props.Columns,
		Tiles: Props.Tiles,
		Contexts: Props.Contexts,
		AsOf: Props.AsOf,
	});

	// The session is read after the first render, never during it: the server's
	// HTML and the first client render are then the same anonymous slot, and a
	// failed read costs one warning instead of an error during hydration.
	onMount(() => {
		void Store.Resolve();
	});

	/**
	 * The session slot.
	 *
	 * `Adopt` above has already handed the store this page's contexts, so the
	 * fallback is for a reader that mounts the slot before the page does - the
	 * anonymous slot those contexts make, which is the same value the store would
	 * have adopted.
	 */
	const Slot = (): Slot => Store.State.Session ?? Anonymous(Props.Contexts, Props.AsOf);

	/**
	 * The island's whole input (RFC-0043 §7), composed per read.
	 *
	 * The drawer is handed over as the same value every time, which is what makes
	 * a context switch unable to touch it: `Enter` passes it straight through and
	 * only the canvas and the destination are looked up per context. The own
	 * context's canvas is the live tile set; a room falls back to the build's,
	 * because a canvas whose rows are not readable is not an empty canvas.
	 */
	const Contract = () =>
		Enter(Slot(), {
			Drawer: Props.Columns,
			Canvases: { [OwnKey]: Store.State.Published },
			Built: Props.Tiles,
			Pending: [],
		});

	/**
	 * The selected stage's short name, for the seam's note.
	 *
	 * A stage label reads `Source · 3 events`, and the seam wants only the name:
	 * the count belongs to the rail, where the band can show it, not to a band
	 * that has room for one clause.
	 */
	const StageName = () =>
		(Props.Stages.find((Entry) => Entry.Key === Store.State.Stage)?.Label ?? "").split(
			" · ",
		)[0];

	/**
	 * The drawer's lock line.
	 *
	 * Anonymous, it is the page's standing instruction. A session that names
	 * itself replaces it, because the question the line answers - what may I do
	 * here - has a different answer once somebody is signed in.
	 */
	const Hint = () => {
		const Identity = Store.State.Session?.Identity;

		return Identity === null || Identity === undefined
			? Props.Hint
			: `Private workspace - signed in as @${Identity.Name}`;
	};

	/**
	 * Why a drop cannot cross the seam, or `undefined` when it can.
	 *
	 * The page states the reason the build knows - no identity is on this page -
	 * and the session decides whether it still applies. A slot that names an
	 * identity has one, so the seam offers the verb and names the stage a drop
	 * would file into; until then the seam states the reason it is locked, which
	 * is what RFC-0049 rule 4 asks of a control an actor may not use.
	 */
	const LockReason = () => (Slot().Identity === null ? Props.Locked : undefined);

	const Publish_ = (Key: string) => {
		const Column = Props.Columns.find((Candidate) => Candidate.Key === Key);
		const Entry =
			Column?.Entries.find((Candidate) => Candidate.Id === Store.State.Record) ??
			Column?.Entries[0];

		if (Column === undefined || Entry === undefined) {
			return;
		}

		/**
		 * UNKNOWN - a drawer record's signing identity.
		 *
		 * A drawer row carries the handle the page showed, not the identity whose
		 * subkey signed the record, so `Author` is empty until the shadow store
		 * records one. Publishing into the owner's own canvas does not read it;
		 * publishing into a room does, and is refused with `not-author` until the
		 * identity migration lands (RFC-0013's implementing card). The version is
		 * the same gap: a drawer record has no version until the store keeps one.
		 */
		const Crossed = CrossTheSeam({
			Act: "publish",
			Context: Contract().Context,
			Standing: Contract().Standing,
			Record: { Id: Entry.Id, Author: Entry.Author ?? "", Version: 1 },
		});

		if (!Crossed.Crossed) {
			return;
		}

		Store.Publish(Column, Entry);
	};

	return (
		<div class="workspace__body">
			<ContextSwitch
				Contexts={Slot().Contexts}
				Selected={Contract().Context}
				State={Contract().State}
				AsOf={Contract().AsOf}
				OnSelect={(Next) => Store.Switch(Next)}
			/>

			<Drawer
				Eyebrow={Props.Eyebrow}
				Title={Props.Title}
				Hint={Hint()}
				Columns={Props.Columns}
				Active={Store.State.Column}
				View={Store.State.View}
				Remedy={Props.Remedy}
				Empty={Props.Empty}
				OnActivate={(Key) => Store.Activate(Key)}
				OnView={(Next) => Store.Show(Next)}
				OnOpen={(Id) => Store.Open(Id)}
				OnAdd={() => undefined}
				OnPublish={Publish_}
			/>

			<Publish
				Label={Contract().Destination}
				Note={Props.Instruction}
				Context={StageName()}
				Locked={LockReason()}
				OnPublish={() => Publish_(Store.State.Column)}
			/>

			<Bento Tiles={Contract().Canvas} />

			<div class="workspace__bands">
				<Swimlanes
					Lanes={Props.Bands.Lanes}
					Eyebrow={Props.Bands.Words.Swimlanes.Eyebrow}
					Title={Props.Bands.Words.Swimlanes.Title}
					Note={Props.Bands.Words.Swimlanes.Note}
				/>

				<Spectrometer
					Peers={Props.Bands.Peers}
					Eyebrow={Props.Bands.Words.Spectrometer.Eyebrow}
					Title={Props.Bands.Words.Spectrometer.Title}
					Note={Props.Bands.Words.Spectrometer.Note}
					RowLabel={Props.Bands.Words.Spectrometer.RowLabel}
				/>

				<StatusFooter
					Items={Props.Bands.Status}
					Eyebrow={Props.Bands.Words.Footer.Eyebrow}
					Label={Props.Bands.Words.Footer.Label}
				/>
			</div>
		</div>
	);
}
