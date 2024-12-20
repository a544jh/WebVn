import { ADVNameTag, ADVTextBox, TextBox, TextBoxType, TextNode } from "../core/state"
import { createResolvablePromise, ResolvePromiseFn } from "./DomRenderer"

export class TextBoxRenderer {
  private root: HTMLDivElement
  private advTextBox: HTMLDivElement
  private advNameTag: HTMLDivElement

  constructor(vnRoot: HTMLDivElement) {
    this.root = document.createElement("div")
    this.root.id = "vn-textbox-renderer"
    this.root.classList.add("vn-textbox-renderer")
    vnRoot.appendChild(this.root)

    this.advTextBox = document.createElement("div")
    this.advTextBox.classList.add("vn-adv-textbox")

    this.advNameTag = document.createElement("div")
    this.advNameTag.classList.add("vn-adv-nametag")
  }

  public async render(committedTextBox: TextBox | null, textBox: TextBox | null, animate: boolean): Promise<void> {
    if (animate && textBox === committedTextBox) {
      return Promise.resolve()
    }
    // if we're NOT animating, we want to go ahead and clear the event listeners

    if (!animate) {
      const clone = this.advTextBox.cloneNode() as HTMLDivElement
      this.advTextBox.replaceWith(clone)
      this.advTextBox = clone
      this.advTextBox.style.transform = ""
    }

    if (textBox === null) {
      // exit
      // close adv box
      if (animate && committedTextBox?.type === TextBoxType.ADV && this.root.contains(this.advTextBox)) {
        const [promise, resolve] = createResolvablePromise()
        await this.renderAdvNameTag(undefined, undefined, true) // animate nametag removal...
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

      return Promise.resolve()
    }

    // maybe use dict to lookup, or class instance method....
    switch (textBox.type) {
      case TextBoxType.ADV:
        return this.renderAdv(committedTextBox, textBox as ADVTextBox, animate)
    }

    return Promise.resolve()
  }

  private async renderAdv(committedAdv: ADVTextBox | null, adv: ADVTextBox, animate: boolean): Promise<void> {
    const [animationFinished, resolveAnimationFinished] = createResolvablePromise()

    this.advTextBox.innerHTML = "" // this will clear any pending span event listners?

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
      }
    }

    const prevNameTag = committedAdv === null ? undefined : committedAdv.nameTag
    await this.renderAdvNameTag(prevNameTag, adv.nameTag, animate)

    appendTextNodesToDiv(adv.textNodes, this.advTextBox, animate, resolveAnimationFinished)

    return animationFinished
  }

  private async renderAdvNameTag(
    prevNameTag: ADVNameTag | undefined,
    nameTag: ADVNameTag | undefined,
    animate: boolean
  ): Promise<unknown> {
    const [animationFinished, resolveAnimationFinished] = createResolvablePromise()

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
      this.advNameTag.style.transform = "scaleY(0)"
      setNameTagProps()
      this.advNameTag.offsetHeight // force reflow
      this.advNameTag.style.transform = "scaleY(1)"
      this.advNameTag.addEventListener("transitionend", finishTransition)
      // swap
    } else if (prevNameTag.name !== nameTag.name || prevNameTag.color !== nameTag.color) {
      // TODO: deep compare
      this.advNameTag.style.transform = "scaleY(0)"
      this.advNameTag.addEventListener("transitionend", changeNameTransition)
    } else {
      return
    }

    return animationFinished
  }
}

export const appendTextNodesToDiv = (
  nodes: TextNode[],
  targetDiv: HTMLDivElement,
  animate: boolean,
  resolveAnimationFinished: ResolvePromiseFn
): void => {
  const fragment = document.createDocumentFragment()

  let delay = 0

  nodes.forEach((node, nodeIndex) => {
    const text = node.text

    for (let i = 0; i < text.length; i++) {
      const span = document.createElement("span")
      span.innerText = text.charAt(i)

      if (animate) {
        span.style.animation = "appear"
        span.style.animationTimingFunction = "step-end"
        span.style.animationDuration = delay + "ms"
        if (nodeIndex === nodes.length - 1 && i === text.length - 1) {
          span.addEventListener("animationend", () => resolveAnimationFinished())
        }
      }

      span.style.color = node.color

      fragment.appendChild(span)

      delay += node.characterDelay
    }
  })

  targetDiv.appendChild(fragment)

  if (!animate) {
    resolveAnimationFinished()
  }
}
