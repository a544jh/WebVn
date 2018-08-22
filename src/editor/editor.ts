import * as CodeMirror from "codemirror"
import { Command } from "../core/commands/Command"
import { VnPlayer } from "../core/player"
import { DomRenderer } from "../domRenderer/domRenderer"
import * as parser from "../parser/parserWrapper.js"

import { SC, Statement } from "../core/commands/StatementConverter"
import "./editor.css"

export class VnEditor {

  private vnEditor: CodeMirror.Editor

  private player: VnPlayer
  private renderer: DomRenderer

  constructor(root: HTMLDivElement, player: VnPlayer, renderer: DomRenderer) {
    this.player = player
    this.renderer = renderer

    this.renderer.onRenderCallbacks.push(() => {
      this.setGutterMarker()
      this.vnEditor.getDoc().setCursor({line: getCurrentLine(player) - 1, ch: 0})
    })

    this.vnEditor = CodeMirror(root, {
      lineNumbers: true,
      gutters: ["CodeMirror-linenumbers", "vn-position-gutter"],
    })
    this.vnEditor.on("gutterClick", (instance, line) => {
      line = line + 1 // codemirror line is zero based
      this.updatePlayerState(line)
    })
    this.vnEditor.on("blur", (instance) => {
      this.updatePlayerState(getCurrentLine(this.player))
    })
  }

  public loadScript(script: string) {
    this.vnEditor.getDoc().setValue(script)
    this.updatePlayerState(1)
  }

  private updatePlayerState(line: number) {
    if (!this.vnEditor.getDoc().isClean()) {
      const statements = parser.parse(this.vnEditor.getDoc().getValue()) as Statement[]
      const commands = SC.convertStatements(statements)
      this.player.loadCommands(commands)
      this.vnEditor.getDoc().markClean()
    }
    // we actually want to be at the next command
    this.player.goToCommand(this.player.state.commands.findIndex((cmd) => cmd.getLine() === line) + 1)
    this.renderer.render(this.player.state, false)
  }

  private setGutterMarker() {
    this.vnEditor.clearGutter("vn-position-gutter")
    this.vnEditor.setGutterMarker(getCurrentLine(this.player) - 1, "vn-position-gutter", makeMarker())
  }
}

function makeMarker(): HTMLDivElement {
  const div = document.createElement("div")
  div.style.background = "blue"
  div.style.width = "100%"
  div.style.height = "1em"
  return div
}

function getCurrentLine(player: VnPlayer): number {
  return player.state.commands[player.state.commandIndex - 1].getLine() || 1
}
