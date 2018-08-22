import "./index.html"

import { initialState, VnPlayer } from "./core/player"
import { TextBoxType, VnPlayerState } from "./core/state"
import { DomRenderer } from "./domRenderer/domRenderer"
import { VnEditor } from "./editor/editor"

import * as CodeMirror from "codemirror"
import "codemirror/lib/codemirror.css"

import * as parser from "./parser/parserWrapper.js"

declare global {
  interface Window { parser: any}
}
window.parser = parser

const state: VnPlayerState = {
  ...initialState,
  actors: {
    default: {
      textColor: "white",
      nameTagColor: "white",
    },
    none: {
      textColor: "#60baff",
    },
    Actor : {
      name: "Actor",
      nameTagColor: "purple",
    },
    Actor2 : {
      name: "Actor2",
      nameTagColor: "orange",
    },
  },
}

const script =
`Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Cras sit amet ligula ac turpis viverra pretium ut at metus.
Etiam condimentum sed eros in tincidunt. Mauris feugiat vel tortor sit amet bibendum. Maecenas sit amet sapien tellus.
\\close
Hello from WebVn!
A fast visual novel toolkit
For the web
Actor: Hello World!
Actor2: Hello!
Actor: Oh, hello!
Actor: Hello all!
Actor2: Hello again!
Hi
Actor2: 1
Actor2: 2
The end
`

const player = new VnPlayer(state)

const vnDiv = document.getElementById("vn-div") as HTMLDivElement
const renderer = new DomRenderer(vnDiv, player)

const vnEditorDiv = document.getElementById("vn-editor") as HTMLDivElement
const editor = new VnEditor(vnEditorDiv, player, renderer)

const vnStateDiv = document.getElementById("vn-state") as HTMLDivElement
renderer.onRenderCallbacks.push(() => {
  // vnStateDiv.textContent = JSON.stringify(player.state, null, 2)
})

editor.loadScript(script)
