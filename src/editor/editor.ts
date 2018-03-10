import * as CodeMirror from "codemirror"
import { Command } from "../core/commands"
import { VnPlayer } from "../core/player"
import { DomRenderer } from "../domRenderer/domRenderer"
import * as parser from "../parser/parserWrapper.js"

import "./editor.css"

export class VnEditor {

  private vnEditor: CodeMirror.Editor

  private player: VnPlayer
  private renderer: DomRenderer

  constructor(root: HTMLDivElement, player: VnPlayer, renderer: DomRenderer) {
    this.player = player
    this.renderer = renderer

    this.renderer.onRenderCallbacks.push(this.setGutterMarker.bind(this))

    this.vnEditor = CodeMirror(root, {
      lineNumbers: true,
      gutters: ["CodeMirror-linenumbers", "vn-position-gutter"],
    })
    this.vnEditor.on("gutterClick", (instance, line) => {
      line = line + 1 // codemirror line is zero based
      const commands = parser.parse(this.vnEditor.getDoc().getValue()) as Command[]
      this.player.loadCommands(commands)
      // we actually want to be at the next command
      this.player.goToCommand(commands.findIndex((cmd) => cmd.line === line) + 1)
      this.renderer.render(this.player.state, false)
    })
  }

  private setGutterMarker() {
    this.vnEditor.clearGutter("vn-position-gutter")
    const command = this.player.state.commands[this.player.state.commandIndex - 1]
    const currentLine = (command ? command.line : 1) || 1 // TODO handle undefiner properly...
    this.vnEditor.setGutterMarker(currentLine - 1, "vn-position-gutter", makeMarker())
  }
}

function makeMarker(): HTMLDivElement {
  const div = document.createElement("div")
  div.style.background = "blue"
  div.style.width = "10px"
  div.style.height = "10px"
  return div
}
