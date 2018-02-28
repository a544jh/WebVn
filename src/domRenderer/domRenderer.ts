import { VnPlayer } from "../core/player"
import { ADVTextBox, TextBox, TextBoxType, VnPlayerState } from "../core/state"
import { TextBoxRenderer } from "./textBoxRenderer"

import "./animations.css"
import "./defaultTheme.css"

export class DomRenderer {
  private root: HTMLDivElement
  private player: VnPlayer

  private prevState: VnPlayerState | null

  private textBoxRenderer: TextBoxRenderer

  constructor(elem: HTMLDivElement, player: VnPlayer) {
    this.root = elem
    this.player = player

    this.prevState = null

    this.textBoxRenderer = new TextBoxRenderer(this.root)

    // TODO: figure out how to detect animation end
    // (transitionend events -> promise / derived duration?)
    // and how to render state without animations
    const arrow = document.createElement("div")
    arrow.classList.add("vn-arrow")
    this.root.appendChild(arrow)

  }

  public render(state: VnPlayerState) {
    const prevText = (this.prevState === null ? null : this.prevState.animatableState.text)
    this.textBoxRenderer.render(prevText, state.animatableState.text)

    this.prevState = state
  }

}
