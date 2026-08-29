import { seedState } from "./core/manifest"
import { VnPlayer } from "./core/player"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { VnEditor } from "./editor/editor"
import "./player.html"

import { YamlParser } from "./yamlParser/YamlParser"
import { loadFromLocalStorage } from "./core/save"
import { VnPath } from "./core/vnPath"
import { demoManifestYaml, demoYaml } from "./demoStory"
import { decodePayload } from "./scriptUrl"

declare global {
  interface Window {
    vnPlayer: VnPlayer
    vnDomRenderer: DomRenderer
  }
}

const vnDivContainer = document.getElementById("vn-div-container") as HTMLDivElement
const vnDiv = document.getElementById("vn-div") as HTMLDivElement

const params = new URLSearchParams(location.search)

// The demo is a source of (manifest text, script text), not a second code path - so every demo load
// exercises exactly what a shared link takes. docs/adr/0003-the-url-payload-carries-the-manifest.md.
boot().catch((e) => showLoadError(e))

async function boot(): Promise<void> {
  const [manifestText, script] = params.has("vn")
    ? await decodePayload(params.get("vn") as string)
    : [demoManifestYaml, demoYaml]

  const [manifest, manifestErrors] = YamlParser.parseManifest(manifestText)
  // A manifest that does not validate has no identity to load the project under, so there is nothing
  // to fall back to - docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md.
  if (manifest === null) {
    showLoadError(manifestErrors.map((e) => `L${e.location.startLine}: ${e.message}`).join("\n"))
    return
  }

  let save
  try {
    save = loadFromLocalStorage(manifest.id)
  } catch (e) {
    save = undefined
  }
  const player = new VnPlayer(seedState(manifest), save)
  window.vnPlayer = player

  const renderer = new DomRenderer(vnDiv, player)
  window.vnDomRenderer = renderer

  const [state] = YamlParser.parseStory(script, manifest)
  const failed = await renderer.loadAssets(state)
  // The player has no tab to mark, but a declared file that is not there is worth saying somewhere
  // other than the frame it eventually throws on.
  if (failed.length > 0) {
    console.warn("Declared files that could not be loaded: " + failed.map((asset) => asset.path).join(", "))
  }
  // Animated, unlike the editor: everything the story runs before its first stop is played out,
  // which is what makes an intro or a title screen possible.
  renderer.loadStory(state, true)
}

// The player's first and only error surface. A blank stage is indistinguishable from a bug, and a
// refused payload is a dead end rather than a degraded render, so it says so - one unstyled line.
// A real error screen belongs to design-docs/PROJECT_STORAGE.md.
function showLoadError(details: unknown): void {
  console.error(details)
  const message = document.createElement("p")
  message.textContent = "This story could not be loaded."
  vnDiv.appendChild(message)
}

document.getElementById("vn-btn-fullscreen")?.addEventListener("click", () => {
  document
    .getElementById("vn-div-container")
    ?.requestFullscreen({ navigationUI: "hide" })
    .then(() => {
      // Rejects on desktop browsers, which expose the API but refuse to lock. Nothing to
      // do about that, and the scaling below still works, so swallow it.
      screen.orientation.lock("landscape").catch(() => undefined)
      window.setTimeout(setScale, 500)
    }) // hackety hack to let mobile ui settle..
})

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement === null) {
    restoreOnFullscreenExit()
  }
})

// TODO move to DomRenderer
function setScale() {
  const containerWidth = vnDivContainer.clientWidth // width of screen in css pixels
  const vnWidth = vnDiv.clientWidth
  const containerHeight = vnDivContainer.clientHeight
  const vnHeight = vnDiv.clientHeight

  let scale
  // if screen is wider than vn aspect ratio
  if (containerWidth / containerHeight > vnWidth / vnHeight) {
    scale = containerHeight / vnHeight
    vnDivContainer.style.paddingLeft = (containerWidth - vnWidth * scale) / 2 + "px"
  } else {
    scale = containerWidth / vnWidth
    vnDivContainer.style.paddingTop = (containerHeight - vnHeight * scale) / 2 + "px"
  }
  const transform = `scale(${scale})`
  vnDiv.style.margin = "initial"
  vnDiv.style.transform = transform
  vnDiv.style.transformOrigin = "top left"
}

function restoreOnFullscreenExit() {
  vnDivContainer.style.paddingLeft = ""
  vnDivContainer.style.paddingTop = ""
  vnDiv.style.margin = ""
  vnDiv.style.transform = ""
  vnDiv.style.transformOrigin = ""
}
