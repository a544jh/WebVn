import { VnPlayer } from "../core/player"
import { ADVTextBox, TextBox, TextBoxType, VnPlayerState } from "../core/state"

import "./animations.css"

export class DomRenderer {
  private root: HTMLElement
  private player: VnPlayer

  private prevState : VnPlayerState

  // lol "virtual dom"
  private textBox: HTMLDivElement

  constructor(elem: HTMLElement, player: VnPlayer) {
    this.root = elem
    this.player = player

    // separeate "virtual dom" logic...
    this.textBox = document.createElement("div")
    this.textBox.classList.add("vn-adv-textbox")
    this.root.appendChild(this.textBox)
  }

  public render(state: VnPlayerState) {
    this.renderText(state.animatableState.text)

    this.prevState = state
  }

  private renderText(text: TextBox | null) {
    if (this.prevState && this.prevState.animatableState.text === text) {
      // lol diffing
      return
    }

    if (text === null) {
      this.root.removeChild(this.textBox)
      return
    }

    // maybe use dict to lookup, or class instance method....
    switch (text.type) {
      case TextBoxType.ADV:
        this.renderAdv(text as ADVTextBox)
        break
    }
  }

  private renderAdv(adv: ADVTextBox) {
    this.textBox.innerHTML = ""

    adv.textNodes.forEach((node, index) => {
      const text = node.text
      let delay = 0

      for (let i = 0; i < text.length; i++) {
        const span = document.createElement("span")
        span.innerText = text.charAt(i)
        span.style.animation = "appear"
        span.style.animationTimingFunction = "step-end"
        span.style.animationDuration = delay + "ms"
        this.textBox.appendChild(span)

        delay += node.characterDelay
      }
    })

  }
}
