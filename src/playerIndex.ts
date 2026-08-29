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

  const renderer = new DomRenderer(vnDiv, player, { container: vnDivContainer })
  window.vnDomRenderer = renderer
  // The button is page chrome rather than part of the vn, so the wiring stays here and the
  // mechanism lives in the renderer. Wired inside boot because that is where the renderer exists -
  // before it does, and on the error path where it never will, there is no scene to scale.
  document.getElementById("vn-btn-fullscreen")?.addEventListener("click", () => renderer.enterFullscreen())

  const [state, scriptErrors] = YamlParser.parseStory(script, manifest)
  // Not showLoadError: a script with a broken command still has content worth showing, and every
  // reference the manifest could not answer has already been neutralized - ADR 0002 and 0004. The
  // player has no gutter to mark, so the console is where the author is told, as below.
  if (scriptErrors.length > 0) {
    console.warn("Script errors:\n" + scriptErrors.map((e) => `L${e.location.startLine}: ${e.message}`).join("\n"))
  }
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
  message.textContent = "The VN could not be loaded."
  vnDiv.appendChild(message)
}
