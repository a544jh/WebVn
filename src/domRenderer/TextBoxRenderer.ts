import { ADVNameTag, ADVTextBox, TextBox, TextBoxType } from "../core/state"
import { createResolvablePromise } from "./DomRenderer"

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

  public async render(prevTextBox: TextBox | null, textBox: TextBox | null, animate: boolean): Promise<void> {
    if (animate && textBox === prevTextBox) {
      return Promise.resolve()
    }
    // if we're NOT animating, we want to go ahead and clear the event listners

    if (textBox === null) {
      // exit
      if (animate && prevTextBox?.type === TextBoxType.ADV && this.root.contains(this.advTextBox)) {
        const [promise, resolve] = createResolvablePromise()
        this.renderAdvNameTag(undefined, undefined, true) // animate nametag removal...
        this.advTextBox.style.transform = "scaleY(0)"
        const removeFromDom = () => {
          this.advTextBox.removeEventListener("transitionend", removeFromDom)
          this.root.innerHTML = ""
          resolve()
        }
        this.advTextBox.addEventListener("transitionend", removeFromDom)
        return promise
      }

      this.root.innerHTML = ""
      // TODO
      return Promise.resolve()
    }

    // maybe use dict to lookup, or class instance method....
    switch (textBox.type) {
      case TextBoxType.ADV:
        return this.renderAdv(prevTextBox, textBox as ADVTextBox, animate)
    }

    return Promise.resolve()
  }

  private async renderAdv(prevAdv: ADVTextBox | null, adv: ADVTextBox, animate: boolean): Promise<void> {
    let resolveAnimationFinished: (value?: unknown | PromiseLike<unknown> | undefined) => void
    const animationFinished = new Promise<void>((resolve) => {
      resolveAnimationFinished = resolve
    })

    this.advTextBox.innerHTML = "" // this will clear any pending event listners?

    // enter
    if (!this.root.contains(this.advTextBox)) {
      this.root.appendChild(this.advTextBox)
      if (animate) {
        const [promise, resolve] = createResolvablePromise()
        this.advTextBox.style.transform = "scaleY(0)"
        this.advTextBox.offsetHeight // force reflow
        this.advTextBox.style.transform = "scaleY(1)"
        const animationFinished = () => {
          this.advTextBox.removeEventListener("transitionend", animationFinished)
          resolve()
        }
        this.advTextBox.addEventListener("transitionend", animationFinished)
        await promise
      } else {
        this.advTextBox.style.transform = ""
      }
    }

    const prevNameTag = prevAdv === null ? undefined : prevAdv.nameTag
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
    animate: boolean
  ): Promise<unknown> {
    let resolveAnimationFinished: (value?: unknown | PromiseLike<unknown> | undefined) => void = () => {
      return
    }
    const animationFinished = new Promise((resolve) => {
      resolveAnimationFinished = resolve
    })

    const removeFromDom = () => {
      this.advNameTag.removeEventListener("transitionend", removeFromDom)
      this.root.removeChild(this.advNameTag)
      resolveAnimationFinished()
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

    if (!animate) {
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
          this.advNameTag.addEventListener("transitionend", removeFromDom)
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

    // enter
    if (prevNameTag === undefined) {
      this.advNameTag.style.transform = "scaleY(0.0001)" // can't be 0 because of firefox lol
      setNameTagProps()
      this.advNameTag.offsetHeight // force reflow
      this.advNameTag.style.transform = "scaleY(1)"
      this.advNameTag.addEventListener("transitionend", finishTransition)
      // swap
    } else if (prevNameTag.name !== nameTag.name || prevNameTag.color !== nameTag.color) {
      // TODO: deep compare
      this.advNameTag.style.transform = "scaleY(0.0001)"
      this.advNameTag.addEventListener("transitionend", changeNameTransition)
    } else {
      return
    }

    return animationFinished
  }
}
