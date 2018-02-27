import { ADVNameTag, ADVTextBox, TextBox, TextBoxType, VnPlayerState } from "../core/state"

export class TextBoxRenderer {

  private root: HTMLDivElement
  private advTextBox: HTMLDivElement
  private advNameTag: HTMLDivElement

  constructor(vnRoot: HTMLDivElement) {
    this.root = document.createElement("div")
    this.root.id = "vn-textbox-renderer"
    vnRoot.appendChild(this.root)

    this.advTextBox = document.createElement("div")
    this.advTextBox.classList.add("vn-adv-textbox")

    this.advNameTag = document.createElement("div")
    this.advNameTag.classList.add("vn-adv-nametag")
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
        this.renderAdv(prevText, text as ADVTextBox)
        break
    }
  }

  private renderAdv(prevAdv: ADVTextBox | null, adv: ADVTextBox) {
    if (!this.root.contains(this.advTextBox)) {
      this.root.appendChild(this.advTextBox)
    }
    const prevNameTag = (prevAdv === null ? undefined : prevAdv.nameTag)
    this.renderAdvNameTag(prevNameTag, adv.nameTag)

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

        span.style.color = node.color

        this.advTextBox.appendChild(span)

        delay += node.characterDelay
      }
    })
  }

  private renderAdvNameTag(prevNameTag: ADVNameTag | undefined, nameTag: ADVNameTag | undefined) {
    if (!nameTag) {
      if (this.root.contains(this.advNameTag)) { this.root.removeChild(this.advNameTag) }
      return
    }
    if (!this.root.contains(this.advNameTag)) {
      this.root.appendChild(this.advNameTag)
    }
    if (prevNameTag !== nameTag) {
      // TODO: transition animation
      this.advNameTag.style.animationPlayState = "running"
      this.advNameTag.textContent = nameTag.name
      this.advNameTag.style.color = nameTag.color
    }
  }
}
