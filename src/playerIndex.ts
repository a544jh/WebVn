import { initialState, VnPlayer } from "./core/player"
import { NARRATOR_ACTOR_ID, VnPlayerState } from "./core/state"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { VnEditor } from "./editor/editor"
import "./player.html"

import { YamlParser } from "./yamlParser/YamlParser"
import { loadFromLocalStorage } from "./core/save"
import { VnPath } from "./core/vnPath"
import toReadableStream from "to-readable-stream"
import { Base64 } from "js-base64"

const state: VnPlayerState = {
  ...initialState,
  actors: {
    default: {
      textColor: "white",
      nameTagColor: "white",
    },
    [NARRATOR_ACTOR_ID]: {
      textColor: "#60baff",
    },
    A1: {
      name: "Actor",
      nameTagColor: "purple",
      sprites: ["idle.png", "2.png"],
    },
    A2: {
      name: "Actor2",
      nameTagColor: "orange",
      sprites: ["idle.png", "2.png"],
    },
  },
  backgrounds: ["a.png", "b.png"],
  audioAssets: ["bgm/map01.ogg", "bgm/dayl_preview.ogg", "sfx/bigthump.ogg"],
}

const yamlText = `
anchor: &anchor
  A1: "This is a YAML anchor"

story:
  - set: [$a, =, 0]
  - textbox: close
  - bg:
      image: a.png
      transition: blinds
      duration: 2000
      pan:
        from: [0,0,100,100]
        to: [0,0,2000,2000]
        duration: 10000
  - Hello, This is WebVn - A fast visual novel engine for the modern web.
  - The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.
  - bgm:
      audio: "bgm/map01.ogg"
      loop: false
  - bg:
      image: b.png
      transition: fade
      duration: 2000
      pan:
        from: [0,0,100,100]
        to: [0,0,1000,1000]
        duration: 10000
  - "Wait for audio to stop"
  - bgm: "bgm/map01.ogg"
  - Looping audio
  - bgm: "bgm/dayl_preview.ogg"
  - Another song...
  - bgm: stop
  - And now... Actors!
  - label: loop
  - show:
      actor: A1
      sprite: idle.png
  - A1: Here I am
  - show:
      actor: A1
      sprite: 2.png
      x: .2
  - A1: Just talking...
  - bgm: "bgm/dayl_preview.ogg"
  - bgPan:
      to: [20,20,500,500]
      duration: 2000
  - show:
      actor: A2
      sprite: idle.png
      x: 0
      y: 0
      anchorX: 0
      anchorY: 0
  - A2: And here I come
  - set: [$a, +=, 1]
  - show:
      actor: A2
      sprite: idle.png
      x: 1
      y: 1
      anchorX: 1
      anchorY: 1
  - A2: Whee!
  - A2: Bye
  - hide: A2
  - Bye bye, actors
  - hide: A1
  - jump:
      to: loop
      if: [$a, ==, 1]
  - ugh: this is an unregonized command
  - textbox: close
  - *anchor
  - bgm: stop
  - bg:
      image: "#000000"
      transition: blinds
      duration: 1000
  - bg:
      image: "b.png"
      transition: blinds
      duration: 1000
  - What decision are you going to make?
  - decision:
    - "asd: asd (quoted string)":
        jump: asd
    - A bad one.:
        jump: bad
  - label: asd
  - More YAML quoting tests...
  - 2
  - "2"
  - no
  - false
  - "Quoted"
  - |
    This is a
    Multiline
    Node
  - Rando: I'm just some random dude
  - A1: But I'm a defined actor
  - textbox: close
  - jump: loop
  - label: bad
  - sfx: "sfx/bigthump.ogg"
  - bg:
      image: "#ffffff"
      transition: fade
      duration: 200
  - bg:
      image: "b.png"
      transition: fade
      duration: 200
  - That was a bad choice.
  - And here we go again...
  - jump: loop
`

// TODO: id from VN title
let save
try {
  save = loadFromLocalStorage("test")
} catch (e) {
  save = undefined
}
const player = new VnPlayer(state, save)

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

if (params.has('vn')) {
  loadEncodedScript(params.get('vn') as string)
} else {
  loadYaml(yamlText)
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