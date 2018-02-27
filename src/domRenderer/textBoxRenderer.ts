import { ADVTextBox, TextBox, TextBoxType, VnPlayerState } from "../core/state"

export class TextBoxRenderer {

  private root : HTMLDivElement
  private advTextBox : HTMLDivElement

  constructor(vnRoot : HTMLDivElement) {
    this.root = document.createElement("div")
    this.root.id = "vn-textbox-renderer"
    vnRoot.appendChild(this.root)

    this.advTextBox = document.createElement("div")
    this.advTextBox.classList.add("vn-adv-textbox")
  }


  public render(prevText: TextBox | null, text: TextBox | null) {
    if (prevText === text) {
      // lol diffing
      return
    }

    if (text === null) {
      this.root.removeChild(this.advTextBox)
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
    if(!this.root.contains(this.advTextBox)) {
      this.root.appendChild(this.advTextBox)
    }

    this.advTextBox.innerHTML = ""

    adv.textNodes.forEach((node, index) => {
      const text = node.text
      let delay = 0

      for (let i = 0; i < text.length; i++) {
        const span = document.createElement("span")
        span.innerText = text.charAt(i)
        span.style.animation = "appear"
        span.style.animationTimingFunction = "step-end"
        span.style.animationDuration = delay + "ms"
        this.advTextBox.appendChild(span)

        delay += node.characterDelay
      }
    })

  }
}