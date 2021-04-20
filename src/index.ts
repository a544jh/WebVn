import { initialState, VnPlayer } from "./core/player"
import { NARRATOR_ACTOR_ID, VnPlayerState } from "./core/state"
import { DomRenderer } from "./domRenderer/domRenderer"
import { VnEditor } from "./editor/editor"
import "./index.html"
import { Renderer } from "./Renderer"
import { ReactRenderer } from "./reactRenderer/reactRenderer"

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
    },
    A2: {
      name: "Actor2",
      nameTagColor: "orange",
    },
  },
}

const yamlText = `
anchor: &anchor
  A1: "This is a YAML anchor"

story:
  - Hello, This is WebVn - A fast visual novel engine for the modern web.
  - label: loop
  - A1: Here I am
  - A1: Just talking...
  - A2: But here I come
  - A2: Bye
  - Bye bye, actors
  - jump: loop
  - ugh: this is an unregonized command
  - textbox: close
  - *anchor
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
`

const [yamlState] = YamlParser.updateState(yamlText, state)
const player = new VnPlayer(yamlState)

const vnDiv = document.getElementById("vn-div") as HTMLDivElement
const renderer = new ReactRenderer(vnDiv, player)

const vnEditorDiv = document.getElementById("vn-editor") as HTMLDivElement
const editor = new VnEditor(vnEditorDiv, player, YamlParser, renderer)

const vnStateDiv = document.getElementById("vn-state") as HTMLDivElement
renderer.onRenderCallbacks.push(() => {
  // vnStateDiv.textContent = JSON.stringify(player.state, null, 2)
})

editor.loadScript(yamlText)
