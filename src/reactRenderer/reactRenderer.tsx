import * as React from "react"
import * as ReactDOM from "react-dom"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { Renderer } from "../Renderer"
import { VnRoot } from "./VnRoot"

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

  public render(animate: boolean): void {
    this.onRenderCallbacks.forEach((cb) => cb())
    ReactDOM.render(
      <VnRoot
        animate={animate}
        playerState={this.player.state}
        onClick={this.advance}
        onScroll={this.handleScrollWheelEvent}
        onAnimationFinished={this.onAnimationFinished}
      />,
      this.elem
    )
  }

  public advance = (): void => {
    this.player.advance()
    this.render(true)
  }

  private handleScrollWheelEvent = (e: React.WheelEvent) => {
    e.preventDefault()
    // TODO: proper backlog rollback
    // down
    if (e.deltaY > 0) {
      this.player.goToCommandDirect(this.player.state.commandIndex + 1)
      // up
    } else if (e.deltaY < 0) {
      this.player.goToCommandDirect(this.player.state.commandIndex - 1)
    }

    this.render(false)
  }

  private onAnimationFinished = () => {
    console.log("animation finished")
    this.onFinishedCallbacks.forEach((cb) => cb())
  }

  public loadAssets(): Promise<void[]> {
    return Promise.all([Promise.resolve()])
  }
}

let id = 0

export const getUniqueId = (): number => {
  const ret = id
  id++
  if (id >= Number.MAX_SAFE_INTEGER) {
    id = 0
  }
  return ret
}
