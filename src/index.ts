import { VnPlayer } from "./core/player"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { VnEditor } from "./editor/editor"
import "./index.html"

import "codemirror/lib/codemirror.css"

import { YamlParser } from "./yamlParser/YamlParser"
import { loadFromLocalStorage } from "./core/save"
import { Base64 } from "js-base64"
import { demoState, demoYaml } from "./demoStory"

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

document.getElementById("vn-btn-export-url")?.addEventListener("click", getCompressedScript)

async function getCompressedScript() {
  const script = editor.getScript()
  const stringStream = new Response(new TextEncoder().encode(script)).body
  if (stringStream === null) {
    throw new Error("Could not read the script.")
  }
  const compressedStream = stringStream.pipeThrough(new CompressionStream("gzip"))
  const ab = await new Response(compressedStream).arrayBuffer()
  const base64 = Base64.fromUint8Array(new Uint8Array(ab), true)
  console.log(base64)
  return base64
}
