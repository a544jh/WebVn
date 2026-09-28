import { identifier, noticeDialog, openDialog } from "./chrome/dialog"
import { icon, IconName } from "./chrome/icons"
import { VnEditor } from "./editor/editor"
import { BootedEditor } from "./editorBoot"
import { publishProject, PublishResult } from "./storage/archive"

// The session's tool row, the part of it a suite can reach. `src/index.ts` self-boots on import and
// finds its buttons by id, so what decides anything - Publish's order of work and both of its dialogs,
// and the gate every tool in the row shares - lives here, and the entry point is left with lookups.

// A chrome button's icon and its label, set together - because setting one alone takes the other
// out: the icon is a child of the button, and `textContent` replaces every child there is.
export const face = (button: HTMLButtonElement, name: IconName, label: string): void => {
  button.replaceChildren(icon(name, 14), document.createTextNode(label))
}

// **Every tool in that row that emits the project is gated on the same flag, and it is the editor's
// own** - `editor.ts` tracks whether the manifest buffer last parsed, and ADR 0005 puts the archive,
// and ADR 0007 the published folder, behind exactly that: each is named after an id, and a manifest
// that does not parse has declared none. One helper because the tools would otherwise be the same
// four lines each, with only the sentence differing - and a second flag is what this is here to
// prevent. Applied at once as well as on every change, so a tool wired after the project has opened
// starts in the right state rather than waiting for the next edit.
export const gateOnManifest = (editor: VnEditor, button: HTMLButtonElement, reason: string): void => {
  const gate = () => {
    const valid = editor.isManifestValid()
    button.disabled = !valid
    button.title = valid ? "" : reason
  }
  editor.onManifestStateChangeCallbacks.push(gate)
  gate()
}

// What Publish needs from the page around it.
export interface PublishWiring {
  // The folder the player's own files are fetched from: the document's directory in production, where
  // the deployed app serves `player.html` and `playerIndex.js` beside the editor.
  readonly player: string
  // How the zip reaches the author's disk: `downloadBlob` in production, which no headless browser
  // can watch arrive, and a stand-in in a suite.
  readonly deliver: (blob: Blob, filename: string) => void
}

type Session = Pick<BootedEditor, "directory" | "storing" | "editor">

// **Publish, in the editor's chrome beside Export ZIP**, and not on the picker's rows: a publish can
// be refused for missing files, and the editor already marks each one orange on the manifest line
// that declared it - so the refusal lands where the fix is. A fourth tool, so it wears an icon like
// the other three: Lucide's globe, because the zip becomes a web page.
//
// Greyed while the manifest does not parse, as Export ZIP is. **Missing files are a refusal on click
// rather than a greyed control**: greying on them would mean wiring the gate to the missing-file
// report, and a dialog naming the files tells the author more than a disabled button.
export const wirePublish = (
  button: HTMLButtonElement,
  session: Session,
  wiring: PublishWiring,
  signal?: AbortSignal
): void => {
  face(button, "globe", "Publish")

  const publish = async () => {
    button.disabled = true
    button.textContent = "Publishing…"
    // Put back before the dialog opens rather than after it closes: the dialog is the news, and a
    // button reading "Publishing..." behind it would be saying the work was still going on.
    await publishSession(session, wiring, () => {
      face(button, "globe", "Publish")
      // The gate owns whether this is usable and has not been asked since, so this asks it.
      button.disabled = !session.editor.isManifestValid()
    })
  }
  button.addEventListener("click", () => void publish(), { signal })

  gateOnManifest(session.editor, button, "manifest.yaml does not parse - a project cannot be published until it does")
}

// The whole of pressing Publish, in the spec's order: **flush the storer first** - the debounce is
// 2000ms, so a build taken straight after typing would otherwise be missing the author's last
// sentence, and the store has to be read over a tree nothing is writing into - then build the zip,
// deliver it, and open the dialog that says what happened. Resolves once that dialog is closed.
//
// **Both outcomes are dialogs rather than the message line** Export ZIP reports in: the refusal is a
// list, one missing file per line, and the success is advice the author needs at that moment - put
// the files on a static web host, and do not expect `index.html` to open from the disk. Both are
// `noticeDialog`s, one Close button. The picker's URL import keeps its orange banner, as archive
// import does; this is the editor only.
export const publishSession = async (session: Session, wiring: PublishWiring, settled?: () => void): Promise<void> => {
  let result: PublishResult | null
  try {
    await session.storing.flush()
    result = await publishProject(session.directory, wiring.player)
  } catch (e) {
    // A refusal is a decision about the project; this is the store not doing what it said.
    console.error("The project could not be published", e)
    result = null
  }
  if (result !== null && result.kind === "published") wiring.deliver(result.blob, result.filename)
  settled?.()
  await announce(result)
}

const announce = (result: PublishResult | null): Promise<unknown> => {
  if (result === null) return noticeDialog("Not published", ["The project could not be published - see the console."])
  if (result.kind === "published") {
    return noticeDialog("Published", [
      ["Your browser is saving ", identifier(result.filename), ". It is the whole story, ready for readers."],
      "To let people read it, extract it onto any static web host and open the folder's address.",
      "Opening index.html straight from your disk will not work. It has to be served from a web host.",
    ])
  }
  if (result.kind === "missing") return missingFiles(result.files)
  // A manifest that does not parse, or a missing script, is reachable only if the gate is raced; the
  // player's own files not arriving is the network's. The same dialog, because it is the same news.
  return noticeDialog("Not published", [`The project was not published: ${result.problem}.`, result.advice])
}

// **A list, which is why this is a dialog**: a project with five undrawn backgrounds needs five
// lines, and the message line beside the buttons holds one sentence.
const missingFiles = (files: readonly string[]): Promise<unknown> => {
  const list = document.createElement("ul")
  list.classList.add("vn-dialog-list")
  for (const path of files) {
    const item = document.createElement("li")
    item.textContent = path
    list.appendChild(item)
  }
  const fix = document.createElement("p")
  fix.classList.add("vn-dialog-body")
  fix.textContent =
    "Add each one in the asset panel, or remove its declaration. Each is marked orange on the line that declares it."

  const content = document.createElement("div")
  content.classList.add("vn-dialog-form")
  content.append(list, fix)

  // `noticeDialog`'s one button, with the list between the two paragraphs where the drawing has it.
  return openDialog({
    title: "Not published",
    body: [
      "These files are declared in manifest.yaml but are missing, and a reader would reach a scene that breaks without them:",
    ],
    content,
    confirmLabel: "Close",
    dismissOnly: true,
  })
}
