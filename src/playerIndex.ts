import { VnPlayer } from "./core/player"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { VnEditor } from "./editor/editor"
import "./player.html"

import { YamlParser } from "./yamlParser/YamlParser"
import { loadFromLocalStorage } from "./core/save"
import { VnPath } from "./core/vnPath"
import toReadableStream from "to-readable-stream"
import { Base64 } from "js-base64"
import { demoState, demoYaml } from "./demoStory"

// TODO: id from VN title
let save
try {
  save = loadFromLocalStorage("test")
} catch (e) {
  save = undefined
}
const player = new VnPlayer(demoState, save)

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

const params = new URLSearchParams(location.search)

if (params.has("vn")) {
  loadEncodedScript(params.get("vn") as string)
} else {
  loadYaml(demoYaml)
}

function loadYaml(yamlText: string) {
  const [state, errors] = YamlParser.updateState(yamlText, player.state)
  player.loadState(state)
  renderer.loadAssets()
}

async function loadEncodedScript(script: string) {
  const bufferStream = toReadableStream(Base64.toUint8Array(script))
  const decompressedStream = bufferStream.pipeThrough(new DecompressionStream("gzip"))
  const yamlString = await new Response(decompressedStream).text()
  loadYaml(yamlString)
}

document.getElementById("vn-btn-fullscreen")?.addEventListener("click", () => {
  document
    .getElementById("vn-div-container")
    ?.requestFullscreen({ navigationUI: "hide" })
    .then(() => {
      screen.orientation.lock("landscape")
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
