import "./index.html"

import { Command, CommandType } from "./core/commands"
import { VnPlayer } from "./core/player"
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
  commandIndex: 0,
  commands: [
    {
      type: CommandType.ADV,
      text: "Hello from WebVn!",
    },
    {
      type: CommandType.ADV,
      text: "A fast visual novel toolkit",
    },
    {
      type: CommandType.ADV,
      text: "For the Web",
    },
    {
      type: CommandType.ADV,
      text: "Hello world!",
      actor: "Actor",
    },
    {
      type: CommandType.ADV,
      text: "Bye",
      actor: "Actor2",
    },
    {
      type: CommandType.ADV,
      text: "Oh, hello again!",
      actor: "Actor",
    },
    {
      type: CommandType.ADV,
      text: "Hello world!",
      actor: "Actor",
    },
    {
      type: CommandType.ADV,
      text: "Hello world!",
      actor: "Actor2",
    },
    {
      type: CommandType.ADV,
      text: "Hello world!",
    },
    {
      type: CommandType.ADV,
      text: "Hello world!",
      actor: "Actor2",
    },
    {
      type: CommandType.ADV,
      text: "Hello world!",
      actor: "Actor2",
    },
    {
      type: CommandType.ADV,
      text: "The end",
    },
  ],
  animatableState: {
    text: {
      type: TextBoxType.ADV,
      textNodes: [
        {
          text:
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras sit" +
            "amet ligula ac turpis viverra pretium ut at metus. Etiam " +
            "condimentum sed eros in tincidunt. Mauris feugiat vel tortor sit" +
            "amet bibendum. Maecenas sit amet sapien tellus.",
          characterDelay: 20,
          color: "white",
        },
      ],
    },
  },
}

// TODO: make player event driven?
const player = new VnPlayer(state)

const vnDiv = document.getElementById("vn-div") as HTMLDivElement
const renderer = new DomRenderer(vnDiv, player)

const vnEditorDiv = document.getElementById("vn-editor") as HTMLDivElement
const vnEditor = new VnEditor(vnEditorDiv, player, renderer)

const vnStateDiv = document.getElementById("vn-state") as HTMLDivElement
renderer.onRenderCallbacks.push(() => {
  vnStateDiv.textContent = JSON.stringify(player.state, null, 2)
})
