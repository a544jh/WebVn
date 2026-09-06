import { VnPlayer } from "./core/player"
import { PathStep } from "./core/vnPath"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { JumpMode, VnEditor } from "./editor/editor"
import "./index.html"
import "./chrome/chrome.css"
import "./debugPanel.css"

import "codemirror/lib/codemirror.css"

import { icon, IconName } from "./chrome/icons"
import { encodePayload, playerUrl } from "./scriptUrl"
import { BootedEditor, unsupportedBrowserReason } from "./editorBoot"
import { downloadBlob } from "./chrome/download"
import { exportProject } from "./storage/archive"
import { AppShell } from "./AppShell"
import { browserNavigation } from "./projectUrl"

declare global {
  interface Window {
    vnPlayer: VnPlayer
    vnDomRenderer: DomRenderer
  }
}

const pickerDiv = document.getElementById("vn-picker") as HTMLDivElement
const sessionDiv = document.getElementById("vn-session") as HTMLDivElement
const vnDivContainer = document.getElementById("vn-div-container") as HTMLDivElement
const vnDiv = document.getElementById("vn-div") as HTMLDivElement
const vnEditorDiv = document.getElementById("vn-editor") as HTMLDivElement
const backButton = document.getElementById("vn-btn-back") as HTMLButtonElement
const sessionTitle = document.getElementById("vn-session-title") as HTMLSpanElement

// Taken off when the session is closed. The editor's own parts go away with it, but these four wire
// into markup that outlives every session - a second boot would otherwise stack a second listener on
// the same button, which is the entry point's version of the bug ticket 01 fixed in the storer.
let wiring = new AbortController()

// Which view is up and what it takes to swap them lives in src/appShell.ts, not here: this module
// self-boots on import and looks its elements up by id, so nothing can exercise it, and the ordering
// that swap depends on is load-bearing. What is left here is what a test could not run anyway.
const shell = new AppShell(
  { pickerDiv, sessionDiv, vnDiv, vnEditorDiv, vnDivContainer },
  {
    onOpen: (booted) => {
      const { player, renderer, editor } = booted
      window.vnPlayer = player
      window.vnDomRenderer = renderer
      // The title the manifest declared, beside the way back out. Nothing else on this page says
      // which project is open - the picker knew, and the editor did not.
      sessionTitle.textContent = player.state.title

      wiring = new AbortController()
      wireDebugPanel(player, renderer)
      wireJumpMode(editor)
      wireFullscreen(renderer)
      wireCopyPlayerLink(editor)
      wireExportZip(booted)
    },
    onClose: () => wiring.abort(),
    // The real address bar. Everything with a decision in it is above this line, in the shell, where
    // a test can drive it; this is four one-line members over `location` and `history`.
    navigation: browserNavigation(),
  }
)

boot().catch((e) => refuseToLoad("Something went wrong opening your project.", e))

// The whole of this is asynchronous, where this file used to be synchronous top to bottom - so all
// the wiring lives inside it, where the objects exist. src/playerIndex.ts already has that shape and
// the same reason for it.
async function boot(): Promise<void> {
  // Before the picker, not inside the boot: a browser that cannot store gets no authoring tool at
  // all, and it must not be shown a list it cannot open anything from. One message, from the place
  // that already had it.
  const unsupported = unsupportedBrowserReason()
  if (unsupported !== null) {
    refuseToLoad(unsupported)
    return
  }

  backButton.prepend(icon("chevron-left", 14))
  backButton.addEventListener("click", () => void shell.backToProjects())

  // Wherever `?project=` says, which is the picker when it says nothing.
  await shell.start()
}

// The editor's only refusal surface, and it has two callers: a browser without OPFS, and anything
// that goes wrong before the editor is on screen. One unstyled message and nothing mounted, the way
// src/playerIndex.ts's showLoadError already refuses for the player.
function refuseToLoad(reason: string, details?: unknown): void {
  if (details !== undefined) console.error(details)
  const message = document.createElement("p")
  message.textContent = reason
  pickerDiv.replaceChildren(message)
}

function wireJumpMode(editor: VnEditor): void {
  document.getElementById("vn-jump-mode")?.addEventListener(
    "change",
    (e) => {
      editor.setJumpMode((e.target as HTMLInputElement).value as JumpMode)
    },
    { signal: wiring.signal }
  )
}

// The button is page chrome rather than part of the vn, so the wiring stays here and the
// mechanism lives in the renderer. Its icon is the chrome's, like the other two in that row: icons
// on all three or none, because one icon among three is not one style.
function wireFullscreen(renderer: DomRenderer): void {
  const button = document.getElementById("vn-btn-fullscreen") as HTMLButtonElement
  face(button, "maximize", "Fullscreen")
  button.addEventListener("click", () => renderer.enterFullscreen(), { signal: wiring.signal })
}

// A chrome button's icon and its label, set together - because setting one alone takes the other
// out: the icon is a child of the button, and `textContent` replaces every child there is.
function face(button: HTMLButtonElement, name: IconName, label: string): void {
  button.replaceChildren(icon(name, 14), document.createTextNode(label))
}

// The `?vn=` payload as a link, copied to the clipboard. **Not "Export"**: CONTEXT.md's Payload
// entry reserves that word for the archive, which carries the assets, and this button now sits
// beside the one that is the archive - which is what turned a tidy-up into a rename.
function wireCopyPlayerLink(editor: VnEditor): void {
  const message = document.getElementById("vn-btn-copy-player-link-message") as HTMLSpanElement
  const button = document.getElementById("vn-btn-copy-player-link") as HTMLButtonElement
  face(button, "link", "Copy player link")

  const copyPlayerLink = async () => {
    const url = playerUrl(await encodePayload(editor.getManifestText(), editor.getScript()), location.href)
    try {
      await navigator.clipboard.writeText(url)
      message.textContent = "Copied the player link to the clipboard"
    } catch (e) {
      // writeText needs a secure context and can still be refused by permission policy. There is
      // nothing to retry, so leave the url somewhere the user can still get at it.
      console.log(url)
      message.textContent = "Could not write to the clipboard - the link is in the console instead"
    }
  }
  button.addEventListener("click", () => void copyPlayerLink(), { signal: wiring.signal })
  // A message from the project just closed is not this one's news, and the two buttons in that row
  // share it.
  message.textContent = ""

  // A payload whose manifest does not parse is one the player refuses, so the link would be dead
  // rather than degraded - and whoever finds out is the person it was sent to. Following canSave's
  // precedent, which greys out Save when the path cannot be written as one.
  editor.onManifestStateChangeCallbacks.push(() => {
    const valid = editor.isManifestValid()
    button.disabled = !valid
    button.title = valid ? "" : "manifest.yaml does not parse - a link copied now would not load"
  })
}

// The project as an archive, from inside the editor - because the author spends their time here, and
// sending them back to the front door for a backup is friction in the one gesture we most want them
// to make. `AppShell` owns the session, so this is a line of wiring.
//
// **Flush first.** The debounce is 2000ms, so an export taken straight after typing would otherwise
// ship an archive missing the author's last sentence - the worst possible bug in a backup feature -
// and a walk has to run over a tree nothing is writing into. `session.storing.flush()` resolves once
// every write the storer has queued has landed, pending or not. Not `AppShell.settled()`, which is
// the view-swap queue and says nothing about the store. No lock is taken: this session already holds
// this project's, and `takeProjectLock` is `ifAvailable`, so asking again would refuse us against
// ourselves.
function wireExportZip(session: BootedEditor): void {
  const message = document.getElementById("vn-btn-copy-player-link-message") as HTMLSpanElement
  const button = document.getElementById("vn-btn-export-zip") as HTMLButtonElement
  face(button, "upload", "Export ZIP")

  const exportZip = async () => {
    button.disabled = true
    button.textContent = "Exporting\u2026"
    try {
      await session.storing.flush()
      const result = await exportProject(session.directory)
      if (result.kind === "refused") {
        message.textContent = `Not exported: ${result.problem}. ${result.advice}`
      } else {
        message.textContent = `Exported ${result.filename}`
        downloadBlob(result.blob, result.filename)
      }
    } catch (e) {
      // A refusal is a decision about the project; this is the store not doing what it said, and it
      // is caught because the caller is a `void`ed handler - an unhandled rejection there would leave
      // the button reading "Exporting..." for the rest of the session.
      console.error("The project could not be exported", e)
      message.textContent = "Could not export the project - see the console"
    } finally {
      face(button, "upload", "Export ZIP")
      // The gate below owns whether this is usable and has not been asked since, so this asks it -
      // otherwise a finished export leaves the button dead on a project it should be live on.
      button.disabled = !session.editor.isManifestValid()
    }
  }
  button.addEventListener("click", () => void exportZip(), { signal: wiring.signal })

  // The same gate the link button follows, and deliberately the same flag: an archive is named after
  // an id and imports into a directory named after one, and a manifest that does not parse has
  // declared none. ADR 0005 - and `editor.ts` already tracks this, so there is no second flag.
  session.editor.onManifestStateChangeCallbacks.push(() => {
    const valid = session.editor.isManifestValid()
    button.disabled = !valid
    button.title = valid ? "" : "manifest.yaml does not parse - a project cannot be exported until it does"
  })
}

const STEP_CLASS: Record<PathStep["kind"], string> = {
  advance: "vn-path-advance",
  decision: "vn-path-decision",
  directJump: "vn-path-direct-jump",
}

function wireDebugPanel(player: VnPlayer, renderer: DomRenderer): void {
  const vnVarsDiv = document.getElementById("vn-variables")
  // The panel is rebuilt per session rather than added to: this markup outlives the session it
  // describes, and a second boot would otherwise draw a second panel under the first.
  vnVarsDiv?.replaceChildren()
  const varHeader = document.createElement("h4")
  varHeader.innerText = "Variables"
  vnVarsDiv?.appendChild(varHeader)
  const varsContainer = document.createElement("div")
  vnVarsDiv?.appendChild(varsContainer)
  // The path is drawn as its own row of elements rather than joining the blob of innerText above, so
  // each action can be coloured by what it is.
  const pathContainer = document.createElement("div")
  pathContainer.classList.add("vn-path")
  vnVarsDiv?.appendChild(pathContainer)

  renderer.onRenderCallbacks.push(() => {
    varsContainer.innerHTML = ""
    let text = ""
    for (const variable in player.state.variables) {
      text += `${variable} = ${JSON.stringify(player.state.variables[variable])}\n`
    }
    text += `Seen commands: ${JSON.stringify(player.state.seenCommands.toJSON())}\n`
    varsContainer.innerText = text
    showPath(player, pathContainer)
  })
}

function showPath(player: VnPlayer, pathContainer: HTMLDivElement): void {
  pathContainer.innerHTML = ""
  pathContainer.appendChild(aside("Path:"))

  const steps = player.path.getSteps()
  if (steps.length === 0) {
    pathContainer.appendChild(aside("(nothing yet)"))
  }
  for (const step of steps) {
    const elem = document.createElement("span")
    elem.classList.add("vn-path-step", STEP_CLASS[step.kind])
    elem.innerText = stepLabel(step)
    pathContainer.appendChild(elem)
  }

  // A direct jump cannot be written as [...decisions, remainingAdvances], so say so rather than
  // letting toShorthandPath throw: the author has not broken anything, they are just somewhere only
  // the editor can reach. The yellow step above shows which jump did it.
  pathContainer.appendChild(
    aside(
      player.path.containsDirectJump()
        ? "not saveable - use replay mode"
        : JSON.stringify(player.path.toShorthandPath())
    )
  )
}

function stepLabel(step: PathStep): string {
  switch (step.kind) {
    case "advance":
      return `${step.value}>`
    case "decision":
      return `choice ${step.value}`
    case "directJump":
      return `jump ${step.value}`
  }
}

function aside(text: string): HTMLSpanElement {
  const elem = document.createElement("span")
  elem.innerText = text
  return elem
}
