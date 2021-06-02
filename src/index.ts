import { initialState, VnPlayer } from "./core/player"
import { NARRATOR_ACTOR_ID, VnPlayerState } from "./core/state"
import { DomRenderer } from "./domRenderer/DomRenderer"
import { VnEditor } from "./editor/editor"
import "./index.html"

import "codemirror/lib/codemirror.css"

import { YamlParser } from "./yamlParser/YamlParser"

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
  - asd
  - bgm: "bgm/dayl_preview.ogg"
  - asd
  - bgm: stop
  - asd
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
  - A2: But here I come
  - set: [$a, +=, 1]
  - show:
      actor: A2
      sprite: idle.png
      x: 1
      y: 1
      anchorX: 1
      anchorY: 1
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
    - "asd: asd ":
        jump: asd
    - A bad one.:
        jump: bad
  - label: asd
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
  - jump: loop
`

const [yamlState] = YamlParser.updateState(yamlText, state)
const player = new VnPlayer(yamlState)

const vnDivContainer = document.getElementById("vn-div-container") as HTMLDivElement
const vnDiv = document.getElementById("vn-div") as HTMLDivElement
const renderer = new DomRenderer(vnDiv, player)

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
  varsContainer.innerText = text
})

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

editor.loadScript(yamlText)

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
