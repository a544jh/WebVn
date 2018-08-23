import { Renderer } from "../Renderer"
import * as React from "react";
import * as ReactDOM from "react-dom"
import { VnPlayer } from "../core/player"
import { VnRoot } from "./VnRoot";
import { VnPlayerState } from "../core/state";

import "../domRenderer/animations.css"
import "../domRenderer/defaultTheme.css"

export class ReactRenderer implements Renderer {

  public onRenderCallbacks: Array<() => void> = []
  public onFinishedCallbacks: Array<() => void> = []

  private elem: HTMLDivElement
  private player: VnPlayer

  constructor(elem: HTMLDivElement, player: VnPlayer) {
    this.elem = elem
    this.player = player
  }

  public render(state: VnPlayerState, animate: boolean) {
    this.onRenderCallbacks.forEach((cb) => cb())
    ReactDOM.render(<VnRoot playerState={state} onClick={this.advance} onScroll={this.handleScrollWheelEvent} />, this.elem)
    // TODO: animations...
    this.onFinishedCallbacks.forEach((cb) => cb())
  }

  public advance = () => {
    this.player.advance()
    this.render(this.player.state, true)
  }

  private handleScrollWheelEvent = (e: React.WheelEvent) => {
    e.preventDefault()
    // TODO: proper backlog rollback
      // down
    if (e.deltaY > 0) {
      this.player.goToCommand(this.player.state.commandIndex + 1)
      // up
    } else if (e.deltaY < 0) {
      this.player.goToCommand(this.player.state.commandIndex - 1)
    }

    this.render(this.player.state, false)
  }

}