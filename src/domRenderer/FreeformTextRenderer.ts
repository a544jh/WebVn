import { FreeformInsertionPoint, FreeformTextBox } from "../core/state"
import { createResolvablePromise } from "./DomRenderer"
import { appendTextNodesToDiv } from "./TextBoxRenderer"

export class FreeformTextRenderer {
  private root: HTMLDivElement

  private readonly sceneWidth: number
  private readonly sceneHeight: number

  constructor(vnRoot: HTMLDivElement) {
    this.root = document.createElement("div")
    this.root.id = "vn-freeform-renderer"
    this.root.classList.add("vn-textbox-renderer")
    vnRoot.appendChild(this.root)
    this.sceneWidth = this.root.clientWidth
    this.sceneHeight = this.root.clientHeight
  }

  public async render(textBoxes: FreeformTextBox[], ip: FreeformInsertionPoint, committedBoxes: FreeformTextBox[] | undefined, animate: boolean): Promise<void> {

    if(textBoxes.length === 0) {
      // clear everything (we only support that for now)
      this.root.innerHTML = ""
      return
    }

    // if we're NOT animating, we want to go ahead and clear the event listeners and animation
    if (!animate) {
      const clone = this.root.cloneNode(true) as HTMLDivElement
      clone.childNodes.forEach((box) => {
        box.childNodes.forEach((span) => {
          (span as HTMLSpanElement).style.animation = ""
        })
      })
      this.root.replaceWith(clone)
      this.root = clone
    }

    if (textBoxes === committedBoxes) {
      return // no new boxes
    }

    const newBox = textBoxes.find(b => b.x == ip.x && b.y == ip.y && b.width == ip.width) as FreeformTextBox // this should always exist
    const existingBox = committedBoxes?.find(b => b.x == ip.x && b.y == ip.y && b.width == ip.width)

    if(existingBox) {
      // if current element has all the text already -> done
      if(existingBox.textNodes.length === newBox?.textNodes.length){
        return
      } else {
        // append new nodes to the existing box
        const elem = this.getTextBoxElem(ip)
        if (elem){
          const [animationFinished, resolveAnimationFinished] = createResolvablePromise()
          const newNodes = newBox.textNodes.slice(existingBox.textNodes.length)
          appendTextNodesToDiv(newNodes, elem, animate, resolveAnimationFinished)
          return animationFinished
        } else {
          // we should not get here
        }
      }
    } else {
      // create new div
      const [animationFinished, resolveAnimationFinished] = createResolvablePromise()
      const elem = document.createElement("div")
      elem.classList.add("vn-freeform-textbox")
      const xPos = this.sceneWidth * ip.x
      const yPos = this.sceneHeight * ip.y
      elem.style.transform = `translate(${Math.round(xPos)}px, ${Math.round(yPos)}px)`
      elem.style.width = `${ip.width * 100}%`
      elem.dataset.vnFreeform = `${ip.x}-${ip.y}-${ip.width}`
      this.root.appendChild(elem)

      appendTextNodesToDiv(newBox.textNodes, elem, animate, resolveAnimationFinished)
      return animationFinished
    }
    
  }

  private getTextBoxElem(ip: FreeformInsertionPoint): HTMLDivElement | null {
    return this.root.querySelector(`[data-vn-freeform="${ip.x}-${ip.y}-${ip.width}"]`)
  }

}