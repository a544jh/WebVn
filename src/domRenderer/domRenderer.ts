import { Renderer } from "../Renderer"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { TextBoxRenderer } from "./textBoxRenderer"

import "./animations.css"
import "./defaultTheme.css"
import { DecisionRenderer } from "./decisionRenderer"

export class DomRenderer implements Renderer {
  public onRenderCallbacks: Array<() => void> = []
  public onFinishedCallbacks: Array<() => void> = []

  private finished: boolean

  private root: HTMLDivElement
  private player: VnPlayer

  private prevState: VnPlayerState | null

  private textBoxRenderer: TextBoxRenderer
  private decisionRenderer: DecisionRenderer

  private arrow: HTMLDivElement

  constructor(elem: HTMLDivElement, player: VnPlayer) {
    this.finished = true

    this.root = elem
    this.player = player

    this.prevState = null

    this.root.addEventListener("click", this.advance.bind(this))
    this.root.addEventListener("wheel", this.handleScrollWheelEvent.bind(this))

    this.textBoxRenderer = new TextBoxRenderer(this.root)
    this.decisionRenderer = new DecisionRenderer(this.root)

    this.arrow = document.createElement("div")
    this.arrow.classList.add("vn-arrow")
    this.root.appendChild(this.arrow)

    this.render(this.player.state, true)
  }

  public render(state: VnPlayerState, animate: boolean): void {
    this.onRenderCallbacks.forEach((cb) => cb())

    this.finished = false
    this.arrow.style.display = "none"

    const animationsFinished: Array<Promise<void>> = []

    // TODO: diffing (when we know more about other animations)
    const prevText = (this.prevState === null ? null : this.prevState.animatableState.text)

    animationsFinished.push(this.textBoxRenderer.render(prevText, state.animatableState.text, animate))
    animationsFinished.push(this.decisionRenderer.render(null))

    this.prevState = state

    Promise.all(animationsFinished).then(() => {
      this.arrow.style.display = ""
      this.finished = true
      this.onFinishedCallbacks.forEach((cb) => cb())
      if (!this.player.state.stopAfterRender) {
        this.player.advance()
        this.render(this.player.state, animate)
      }
    })
  }

  public advance(): void {
    if (this.finished) {
      this.player.advance()
      this.render(this.player.state, true)
    } else {
      this.render(this.player.state, false)
    }
  }

  private handleScrollWheelEvent(e: WheelEvent) {
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
