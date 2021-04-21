import { ADVNameTag, ADVTextBox, TextBox, TextBoxType } from "../core/state"

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

    if (text === null) {
      // TODO: exit animation...
      this.root.innerHTML = ""
      // TODO
      return Promise.resolve()
    }

    if (text === prevText) {
      return Promise.resolve()
    }

    // maybe use dict to lookup, or class instance method....
    switch (text.type) {
      case TextBoxType.ADV:
        return this.renderAdv(prevText, text as ADVTextBox, animate)
    }

    return Promise.resolve()
  }

  private async renderAdv(prevAdv: ADVTextBox | null, adv: ADVTextBox, animate: boolean): Promise<void> {

    let resolveAnimationFinished: (value?: unknown | PromiseLike<unknown> | undefined) => void
    const animationFinished = new Promise<void>((resolve) => { resolveAnimationFinished = resolve })

    if (!this.root.contains(this.advTextBox)) {
      this.root.appendChild(this.advTextBox)
    }
    this.advTextBox.innerHTML = ""

    const prevNameTag = (prevAdv === null ? undefined : prevAdv.nameTag)
    await this.renderAdvNameTag(prevNameTag, adv.nameTag, animate)

    const fragment = document.createDocumentFragment()

    let delay = 0

    adv.textNodes.forEach((node) => {
      const text = node.text

      for (let i = 0; i < text.length; i++) {
        const span = document.createElement("span")
        span.innerText = text.charAt(i)

        if (animate) {
          span.style.animation = "appear"
          span.style.animationTimingFunction = "step-end"
          span.style.animationDuration = delay + "ms"
          if (i === text.length - 1) {
            span.addEventListener("animationend", resolveAnimationFinished)
          }
        }

        span.style.color = node.color

        fragment.appendChild(span)

        delay += node.characterDelay
      }
    })

    this.advTextBox.appendChild(fragment)

    if (!animate) {
      return
    } else {
      return animationFinished
    }
  }

  private async renderAdvNameTag(
    prevNameTag: ADVNameTag | undefined,
    nameTag: ADVNameTag | undefined,
    animate: boolean): Promise<unknown> {

    let resolveAnimationFinished: (value?: unknown | PromiseLike<unknown> | undefined) => void = () => { return }
    const animationFinished = new Promise((resolve) => { resolveAnimationFinished = resolve })

    const remove = () => {
      this.advNameTag.removeEventListener("transitionend", remove)
      this.root.removeChild(this.advNameTag)
      resolveAnimationFinished()
    }

    if(!animate) {
      // remove event listeners to prevent race conditions...
      const clone = this.advNameTag.cloneNode(true) as HTMLDivElement
      this.advNameTag.replaceWith(clone)
      this.advNameTag = clone
    }

    // exit
    if (nameTag === undefined) {
      if (this.root.contains(this.advNameTag)) {
        if (animate) {
          this.advNameTag.style.transform = "scaleY(0)"
          this.advNameTag.addEventListener("transitionend", remove)
        } else {
          this.root.removeChild(this.advNameTag)
          resolveAnimationFinished()
        }
        return animationFinished
      } else {
        return
      }
    }

    const setNameTagProps = () => {
      this.advNameTag.textContent = nameTag.name
      this.advNameTag.style.color = nameTag.color
    }

    if (!this.root.contains(this.advNameTag)) {
      this.root.appendChild(this.advNameTag)
    }

    if (!animate) {
      setNameTagProps()
      this.advNameTag.style.transform = ""
      return
    }

    const changeNameTransition = () => {
      this.advNameTag.removeEventListener("transitionend", changeNameTransition)
      setNameTagProps()
      this.advNameTag.style.transform = "scaleY(1)"
      this.advNameTag.addEventListener("transitionend", finishTransition)
    }

    const finishTransition = () => {
      this.advNameTag.removeEventListener("transitionend", finishTransition)
      resolveAnimationFinished()
    }
    // enter
    if (prevNameTag === undefined) {
      this.advNameTag.style.transform = "scaleY(0.0001)" // can't be 0 because of firefox lol
      setNameTagProps()
      this.advNameTag.offsetHeight // force reflow
      this.advNameTag.style.transform = "scaleY(1)"
      this.advNameTag.addEventListener("transitionend", finishTransition)
      // swap
    } else if (prevNameTag.name !== nameTag.name || prevNameTag.color !== nameTag.color) { // TODO: deep compare
      this.advNameTag.style.transform = "scaleY(0.0001)"
      this.advNameTag.addEventListener("transitionend", changeNameTransition)
    } else {
      return
    }

    return animationFinished
  }
}

