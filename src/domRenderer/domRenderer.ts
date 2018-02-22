import { VnPlayer } from "../core/player"
import { ADVTextBox, TextBox, TextBoxType, VnPlayerState } from "../core/state"

export class DomRenderer {
  private root: HTMLElement
  private player: VnPlayer

  // lol "virtual dom"
  private textBox: HTMLDivElement

  constructor(elem: HTMLElement, player: VnPlayer) {
    this.root = elem
    this.player = player
  }

  public render(state: VnPlayerState) {
    this.renderText(state.animatableState.text)
  }

  private renderText(text: TextBox | null) {

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
    this.textBox = document.createElement("div")
    this.textBox.innerHTML = ""

    adv.textNodes.forEach((node, index) => {
      const text = node.text
      let delay = 0

      for (let i = 0; i < text.length; i++) {
        const span = document.createElement("span")
        span.innerText = text.charAt(i)
        span.style.opacity = "0"
        span.style.transitionProperty = "opacity"
        span.style.transitionDelay = delay + "ms"
        this.textBox.appendChild(span)

        delay += node.characterDelay
      }
    })

    this.root.appendChild(this.textBox)
    // may want to batch suff like this at the end of the whole render...
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        for (let i = 0; i < this.textBox.children.length; i++) {
          const elem = this.textBox.children[i] as HTMLDivElement
          elem.style.opacity = "1"
        }
      })
    })
  }
}
