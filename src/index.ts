import { VnPlayer } from "./core/player"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { VnEditor } from "./editor/editor"
import "./index.html"

import "codemirror/lib/codemirror.css"

import { YamlParser } from "./yamlParser/YamlParser"
import { loadFromLocalStorage } from "./core/save"
import { demoState, demoYaml } from "./demoStory"
import { encodeScript, playerUrl } from "./scriptUrl"

const [yamlState] = YamlParser.updateState(demoYaml, demoState)
// TODO: id from VN title
let save
try {
  save = loadFromLocalStorage("test")
} catch (e) {
  save = undefined
}
const player = new VnPlayer(yamlState, save)

declare global {
  interface Window {
    vnPlayer: VnPlayer
    vnDomRenderer: DomRenderer
  }
}

window.vnPlayer = player

const vnDivContainer = document.getElementById("vn-div-container") as HTMLDivElement
const vnDiv = document.getElementById("vn-div") as HTMLDivElement
const renderer = new DomRenderer(vnDiv, player)
window.vnDomRenderer = renderer

const vnEditorDiv = document.getElementById("vn-editor") as HTMLDivElement
const editor = new VnEditor(vnEditorDiv, player, YamlParser, renderer)

const vnStateDiv = document.getElementById("vn-state") as HTMLDivElement
renderer.onRenderCallbacks.push(() => {
  // vnStateDiv.textContent = JSON.stringify(player.state, null, 2)
})

const vnVarsDiv = document.getElementById("vn-variables")
const varHeader = document.createElement("h4")
varHeader.innerText = "Variables"
vnVarsDiv?.appendChild(varHeader)
const varsContainer = document.createElement("div")
vnVarsDiv?.appendChild(varsContainer)

renderer.onRenderCallbacks.push(() => {
  varsContainer.innerHTML = ""
  let text = ""
  for (const variable in player.state.variables) {
    text += `${variable} = ${JSON.stringify(player.state.variables[variable])}\n`
  }
  text += `Seen commands: ${JSON.stringify(player.state.seenCommands.toJSON())}\n`
  text += `Path (shorthand): ${shorthandPath()}\n`
  varsContainer.innerText = text
})

// [...decisions, remainingAdvances] - what a save slot stores. toShorthandPath throws once the
// path contains a goto, which is what clicking a line in the editor records, so that is a normal
// state to be in here rather than something worth blowing up the panel over.
function shorthandPath(): string {
  try {
    return JSON.stringify(player.path.toShorthandPath())
  } catch (e) {
    return "n/a - path contains a goto"
  }
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

editor.loadScript(demoYaml)

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

const exportUrlMessage = document.getElementById("vn-btn-export-url-message") as HTMLSpanElement

document.getElementById("vn-btn-export-url")?.addEventListener("click", exportUrl)

async function exportUrl() {
  const url = playerUrl(await encodeScript(editor.getScript()), location.href)
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
