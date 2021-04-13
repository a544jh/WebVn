import * as CodeMirror from "codemirror"
import "codemirror/mode/yaml/yaml"
import { VnParser } from "../core/commands/Parser"
import { VnPlayer } from "../core/player"
import { DomRenderer } from "../domRenderer/domRenderer"
import "./editor.css"

// https://github.com/codemirror/CodeMirror/issues/988#issuecomment-14921785
function betterTab(cm: CodeMirror.Editor) {
  if (cm.somethingSelected()) {
    cm.indentSelection("add")
  } else {
    cm.replaceSelection(
      cm.getOption("indentWithTabs") ? "\t" : Array((cm.getOption("indentUnit") || 0) + 1).join(" "),
      "end"
    )
  }
}

export class VnEditor {
  private vnEditor: CodeMirror.Editor

  private player: VnPlayer
  private parser: VnParser
  private renderer: DomRenderer

  constructor(root: HTMLDivElement, player: VnPlayer, parser: VnParser, renderer: DomRenderer) {
    this.player = player
    this.parser = parser
    this.renderer = renderer

    this.renderer.onRenderCallbacks.push(() => {
      this.setGutterMarker()
      this.vnEditor.getDoc().setCursor({ line: getCurrentLine(player) - 1, ch: 0 })
    })

    this.vnEditor = CodeMirror(root, {
      lineNumbers: true,
      gutters: ["CodeMirror-linenumbers", "vn-position-gutter"],
      indentWithTabs: false,
      indentUnit: 2,
      extraKeys: { Tab: betterTab },
    })
    this.vnEditor.on("gutterClick", (instance, line) => {
      line = line + 1 // codemirror line is zero based
      this.goToLine(line)
    })
    this.vnEditor.on("blur", () => {
      this.goToLine(getCurrentLine(this.player))
    })
  }

  public loadScript(script: string): void {
    this.vnEditor.getDoc().setValue(script)
    this.player.goToCommand(1)
    this.renderer.render(this.player.state, false)
  }

  private goToLine(line: number) {
    if (!this.vnEditor.getDoc().isClean()) {
      this.player.state = this.parser.updateState(this.vnEditor.getDoc().getValue(), this.player.state)
      this.vnEditor.getDoc().markClean()
    }
    const commandIndex = this.player.state.commands.findIndex((cmd) => cmd.getLine() === line)
    if (commandIndex === -1) return // do nothing if we try to go to a non-command line
    // visually we show that we are on the line's command, but the player needs to be ready for the next one.
    this.player.goToCommand(commandIndex + 1)
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
  return player.state.commands[player.state.commandIndex - 1].getLine() || 1
}
