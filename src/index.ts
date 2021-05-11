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
}

const yamlText = `
anchor: &anchor
  A1: "This is a YAML anchor"

story:
  - set: [$a, =, 0]
  - textbox: close
  - Hello, This is WebVn - A fast visual novel engine for the modern web.
  - label: loop
  - show:
      actor: A1
      sprite: idle.png
  - A1: Here I am
  - show:
      actor: A1
      sprite: 2.png
  - A1: Just talking...
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
  - What decision are you going to make?
  - decision:
    - Option 1:
        jump: loop
    - Option 2:
        jump: bad
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
  - label: bad
  - That was a bad choice.
  - jump: loop
`

const [yamlState] = YamlParser.updateState(yamlText, state)
const player = new VnPlayer(yamlState)

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

editor.loadScript(yamlText)
