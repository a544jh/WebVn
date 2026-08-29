import { VnPlayer } from "./core/player"
import { PathStep } from "./core/vnPath"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { JumpMode, VnEditor } from "./editor/editor"
import "./index.html"
import "./debugPanel.css"

import "codemirror/lib/codemirror.css"

import { encodePayload, playerUrl } from "./scriptUrl"
import { bootEditor } from "./editorBoot"
import { isSupported } from "./storage/opfs"

declare global {
  interface Window {
    vnPlayer: VnPlayer
    vnDomRenderer: DomRenderer
  }
}

const vnDivContainer = document.getElementById("vn-div-container") as HTMLDivElement
const vnDiv = document.getElementById("vn-div") as HTMLDivElement
const vnEditorDiv = document.getElementById("vn-editor") as HTMLDivElement

boot().catch((e) => refuseToLoad("Something went wrong opening your project.", e))

// The whole of this is asynchronous, where this file used to be synchronous top to bottom - so all
// the wiring lives inside it, where the objects exist. src/playerIndex.ts already has that shape and
// the same reason for it.
async function boot(): Promise<void> {
  // A browser that cannot store gets no editor at all, rather than a memory-only one. A second boot
  // path that behaves differently and is exercised by nobody is a maintenance cost with no owner,
  // and an editor that silently cannot keep the author's work is worse than one that says so up
  // front. The blast radius is small on purpose: src/playerIndex.ts never touches OPFS, so the
  // *player* still works in any browser, and it is only authoring that needs a place to put things.
  if (!isSupported()) {
    refuseToLoad("This browser cannot store projects, so the editor will not load. Try a recent Chrome or Edge.")
    return
  }

  const { player, renderer, editor, openProject } = await bootEditor({ vnDiv, vnEditorDiv, vnDivContainer })
  window.vnPlayer = player
  window.vnDomRenderer = renderer

  wireDebugPanel(player, renderer)
  wireJumpMode(editor)
  wireFullscreen(renderer)
  wireExportUrl(editor)

  // Last, so the export gate above is listening before the boot reports how the manifest fared.
  await openProject()
}

// The editor's only refusal surface, and it has two callers: a browser without OPFS, and anything
// that goes wrong before the editor is on screen. One unstyled message and nothing mounted, the way
// src/playerIndex.ts's showLoadError already refuses for the player.
function refuseToLoad(reason: string, details?: unknown): void {
  if (details !== undefined) console.error(details)
  const message = document.createElement("p")
  message.textContent = reason
  vnEditorDiv.appendChild(message)
}

function wireJumpMode(editor: VnEditor): void {
  document.getElementById("vn-jump-mode")?.addEventListener("change", (e) => {
    editor.setJumpMode((e.target as HTMLInputElement).value as JumpMode)
  })
}

// The button is page chrome rather than part of the vn, so the wiring stays here and the
// mechanism lives in the renderer.
function wireFullscreen(renderer: DomRenderer): void {
  document.getElementById("vn-btn-fullscreen")?.addEventListener("click", () => renderer.enterFullscreen())
}

function wireExportUrl(editor: VnEditor): void {
  const exportUrlMessage = document.getElementById("vn-btn-export-url-message") as HTMLSpanElement
  const exportUrlButton = document.getElementById("vn-btn-export-url") as HTMLButtonElement

  const exportUrl = async () => {
    const url = playerUrl(await encodePayload(editor.getManifestText(), editor.getScript()), location.href)
    try {
      await navigator.clipboard.writeText(url)
      exportUrlMessage.textContent = "Copied the story URL to the clipboard"
    } catch (e) {
      // writeText needs a secure context and can still be refused by permission policy. There is
      // nothing to retry, so leave the url somewhere the user can still get at it.
      console.log(url)
      exportUrlMessage.textContent = "Could not write to the clipboard - the URL is in the console instead"
    }
  }
  exportUrlButton.addEventListener("click", () => void exportUrl())

  // A payload whose manifest does not parse is one the player refuses, so the link would be dead
  // rather than degraded - and whoever finds out is the person it was sent to. Following canSave's
  // precedent, which greys out Save when the path cannot be written as one.
  editor.onManifestStateChangeCallbacks.push(() => {
    const valid = editor.isManifestValid()
    exportUrlButton.disabled = !valid
    exportUrlButton.title = valid ? "" : "manifest.yaml does not parse - a link exported now would not load"
  })
}

const STEP_CLASS: Record<PathStep["kind"], string> = {
  advance: "vn-path-advance",
  decision: "vn-path-decision",
  directJump: "vn-path-direct-jump",
}

function wireDebugPanel(player: VnPlayer, renderer: DomRenderer): void {
  const vnVarsDiv = document.getElementById("vn-variables")
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
