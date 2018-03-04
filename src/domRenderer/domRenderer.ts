import { VnPlayer } from "../core/player"
import { ADVTextBox, TextBox, TextBoxType, VnPlayerState } from "../core/state"
import { TextBoxRenderer } from "./textBoxRenderer"

import "./animations.css"
import "./defaultTheme.css"

export class DomRenderer {
  public onRender: () => void
  public onFinished: () => void

  private finished: boolean

  private root: HTMLDivElement
  private player: VnPlayer

  private prevState: VnPlayerState | null

  private textBoxRenderer: TextBoxRenderer

  private arrow: HTMLDivElement

  constructor(elem: HTMLDivElement, player: VnPlayer) {
    this.finished = true

    this.root = elem
    this.player = player

    this.prevState = null

    this.root.addEventListener("click", this.advance.bind(this))

    this.textBoxRenderer = new TextBoxRenderer(this.root)

    this.arrow = document.createElement("div")
    this.arrow.classList.add("vn-arrow")
    this.root.appendChild(this.arrow)

    this.render(this.player.state, true)
  }

  public render(state: VnPlayerState, animate: boolean) {
    if (typeof this.onRender === "function") { this.onRender() }

    this.finished = false
    this.arrow.style.display = "none"

    const animationsFinished: Array<Promise<void>> = []

    const prevText = (this.prevState === null ? null : this.prevState.animatableState.text)
    animationsFinished.push(this.textBoxRenderer.render(prevText, state.animatableState.text, animate))

    this.prevState = state

    Promise.all(animationsFinished).then(() => {
      this.arrow.style.display = ""
      this.finished = true
      if (typeof this.onFinished === "function") { this.onFinished() }
    })
  }

  public advance() {
    if (this.finished) {
      this.player.advance()
      this.render(this.player.state, true)
    } else {
      this.render(this.player.state, false)
    }
  }

}
