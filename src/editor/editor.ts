import * as CodeMirror from "codemirror"
import "codemirror/mode/yaml/yaml"
import { ErrorLevel, ParserError, SourceLocation, VnParser } from "../core/commands/Parser"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { VnPath } from "../core/vnPath"
import { Renderer } from "../Renderer"
import "./editor.css"

// How clicking a line in the editor gets the player there. "replay" plays the story from the top,
// following jumps and answering decisions from the recorded ones, so the scene is built and the
// path stays honest. "direct" teleports and applies that one command onto whatever is on screen.
export type JumpMode = "replay" | "direct"

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
  private renderer: Renderer
  private baseState: VnPlayerState
  private jumpMode: JumpMode = "replay"

  // `baseState` is the story's starting point - the actors and asset lists the script is parsed
  // against, with the playhead at the top. Every reparse goes through it rather than through the
  // live state, so editing a script cannot leave the player believing the story begins wherever it
  // happened to be standing.
  constructor(root: HTMLDivElement, player: VnPlayer, parser: VnParser, renderer: Renderer, baseState: VnPlayerState) {
    this.player = player
    this.parser = parser
    this.renderer = renderer
    this.baseState = baseState

    this.renderer.onRenderCallbacks.push(() => {
      this.setPositionMarker()
      const location = getCurrentLocation(player)
      if (location === null) return
      this.vnEditor.getDoc().setCursor({ line: location.startLine - 1, ch: 0 })
    })

    this.vnEditor = CodeMirror(root, {
      lineNumbers: true,
      gutters: ["CodeMirror-linenumbers", "vn-position-gutter", "vn-error-gutter"],
      indentWithTabs: false,
      indentUnit: 2,
      extraKeys: { Tab: betterTab },
    })
    this.vnEditor.on("gutterClick", (instance, line) => {
      line = line + 1 // codemirror line is zero based
      this.goToLine(line)
    })
    this.vnEditor.on("blur", () => {
      const location = getCurrentLocation(this.player)
      if (location !== null) this.goToLine(location.startLine)
    })
    this.vnEditor.on("scrollCursorIntoView", (instance, event) => {
      // this prevents the whole window from scrolling for some reason, but the editor itself is still scrolled
      event.preventDefault()
    })
  }

  // Parses the document into the player and returns the new state, for callers that need it after
  // the swap. goToLine only wants the side effect, and is safe to leave at that because it renders
  // synchronously right after - see DomRenderer.loadStory for why that matters.
  private parseDocument(): VnPlayerState {
    const [state, errors] = this.parser.updateState(this.vnEditor.getDoc().getValue(), this.baseState)
    this.vnEditor.clearGutter("vn-error-gutter")
    for (const error of errors) {
      this.setErrorMarker(error)
    }

    this.player.loadState(state)

    this.vnEditor.getDoc().markClean()
    return state
  }

  public async loadScript(script: string): Promise<void> {
    this.vnEditor.getDoc().setValue(script)
    const state = this.parseDocument()

    await this.renderer.loadAssets(state)

    // Unanimated: an author reloading a script wants to be back at the first stop, not to sit
    // through the intro again. The standalone player boots the same story with animations.
    this.renderer.loadStory(state, false)
  }

  public getScript(): string {
    return this.vnEditor.getDoc().getValue()
  }

  public setJumpMode(mode: JumpMode): void {
    this.jumpMode = mode
  }

  private goToLine(line: number) {
    if (!this.vnEditor.getDoc().isClean()) {
      this.parseDocument()
    }
    const commandIndex = this.player.state.commands.findIndex((cmd) => {
      const location = cmd.getSourceLocation()
      return line >= location.startLine && line <= location.endLine
    })
    if (commandIndex === -1) return // do nothing if we try to go to a non-command line
    // visually we show that we are on the line's command, but the player needs to be ready for the next one.
    if (this.jumpMode === "replay") {
      this.player.goToCommandByReplay(commandIndex + 1)
    } else {
      this.player.goToCommandDirect(commandIndex + 1)
    }
    this.renderer.render(false)
  }

  private setPositionMarker() {
    this.vnEditor.clearGutter("vn-position-gutter")
    const location = getCurrentLocation(this.player)
    if (location === null) return
    for (let line = location.startLine; line <= location.endLine; line++) {
      this.vnEditor.setGutterMarker(line - 1, "vn-position-gutter", makeMarker("blue"))
    }
  }

  private setErrorMarker(error: ParserError) {
    const color = error.level === ErrorLevel.WARNING ? "orange" : "red"
    for (let line = error.location.startLine; line <= error.location.endLine; line++) {
      this.vnEditor.setGutterMarker(line - 1, "vn-error-gutter", makeMarker(color, error.message))
    }
  }
}

function makeMarker(color: string, title?: string): HTMLDivElement {
  const height = document.querySelector(".CodeMirror-linenumber")?.clientHeight + "px" // hack to get height..
  const div = document.createElement("div")
  div.style.background = color
  div.style.width = "100%"
  div.style.height = height
  if (title) div.title = title
  return div
}

// The command the player last ran. Null on the first frame of a boot, where nothing has run yet.
function getCurrentLocation(player: VnPlayer): SourceLocation | null {
  if (player.state.commandIndex === 0) return null
  return player.state.commands[player.state.commandIndex - 1].getSourceLocation()
}
