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

  public render(prevText: TextBox | null, text: TextBox | null, animate: boolean): Promise<void> {

    if (prevText === text) {
      // lol diffing
      return Promise.resolve()
    }

    if (text === null) {
      // TODO: exit animation...
      this.root.removeChild(this.advTextBox)
      // TODO
      return Promise.resolve()
    }

    // maybe use dict to lookup, or class instance method....
    switch (text.type) {
      case TextBoxType.ADV:
      this.renderAdv(prevText, text as ADVTextBox)
      break
    }

    // TODO return actual end promise
    return Promise.resolve()
  }

  private renderAdv(prevAdv: ADVTextBox | null, adv: ADVTextBox) {
    if (!this.root.contains(this.advTextBox)) {
      this.root.appendChild(this.advTextBox)
    }
    const prevNameTag = (prevAdv === null ? undefined : prevAdv.nameTag)
    this.renderAdvNameTag(prevNameTag, adv.nameTag)

    this.advTextBox.innerHTML = ""

    const fragment = document.createDocumentFragment()

    let delay = 0

    adv.textNodes.forEach((node, index) => {
      const text = node.text

      for (let i = 0; i < text.length; i++) {
        const span = document.createElement("span")
        span.innerText = text.charAt(i)
        span.style.animation = "appear"
        span.style.animationTimingFunction = "step-end"
        span.style.animationDuration = delay + "ms"

        span.style.color = node.color

        fragment.appendChild(span)

        delay += node.characterDelay
      }
    })

    this.advTextBox.appendChild(fragment)
  }

  private async renderAdvNameTag(prevNameTag: ADVNameTag | undefined, nameTag: ADVNameTag | undefined) {
    if (prevNameTag === nameTag) {
      return
    }

    const remove = () => {
      this.advNameTag.removeEventListener("transitionend", remove)
      this.root.removeChild(this.advNameTag)
    }

    if (nameTag === undefined) {
      if (this.root.contains(this.advNameTag)) {
        this.advNameTag.style.transform = "scaleY(0)"
        this.advNameTag.addEventListener("transitionend", remove)
      }
      return
    }
    if (!this.root.contains(this.advNameTag)) {
      this.root.appendChild(this.advNameTag)
    }

    const transition = () => {
      this.advNameTag.textContent = nameTag.name
      this.advNameTag.style.color = nameTag.color
      this.advNameTag.style.transform = "scaleY(1)"
      this.advNameTag.removeEventListener("transitionend", transition)
    }

    if (prevNameTag === undefined) {
      this.advNameTag.style.transform = "scaleY(0.0001)" // can't be 0 because of firefox lol
      this.advNameTag.textContent = nameTag.name
      this.advNameTag.style.color = nameTag.color
      await nextAnimationFrame()
      this.advNameTag.style.transform = "scaleY(1)"
    } else if (prevNameTag.name !== nameTag.name) {
      this.advNameTag.style.transform = "scaleY(0)"
      this.advNameTag.addEventListener("transitionend", transition)
    }

  }
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(resolve)
  })
}
