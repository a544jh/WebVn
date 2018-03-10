import * as CodeMirror from "codemirror"
import { Command } from "../core/commands"
import { VnPlayer } from "../core/player"
import { DomRenderer } from "../domRenderer/domRenderer"
import * as parser from "../parser/parserWrapper.js"

export class VnEditor {

  private vnEditor: CodeMirror.Editor

  private player: VnPlayer
  private renderer: DomRenderer

  constructor(root: HTMLDivElement, player: VnPlayer, renderer: DomRenderer) {
    this.player = player
    this.renderer = renderer

    this.vnEditor = CodeMirror(root, {
      lineNumbers: true,
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
}
