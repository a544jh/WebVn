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

  public async render(
    textBoxes: FreeformTextBox[],
    committedBoxes: FreeformTextBox[] | undefined,
    animate: boolean
  ): Promise<void> {

    // Handle non-animated state reset
    if (!animate) {
      this.resetAnimations()
    }

    if (textBoxes === committedBoxes) {
      return
    }

    // Remove obsolete text boxes (present in committedBoxes but not in textBoxes)
    this.removeObsoleteBoxes(textBoxes, committedBoxes)

    const promises: Promise<void>[] = []

    // Add or update text boxes
    for (const newBox of textBoxes) {
      const existingBox = committedBoxes?.find((b) => b.x === newBox.x && b.y === newBox.y && b.width === newBox.width)

      if (existingBox) {
        // Update existing box
        const elem = this.getTextBoxElem({
          x: existingBox.x,
          y: existingBox.y,
          width: existingBox.width,
        })
        if (elem) {
          // Reconcile text nodes
          promises.push(this.reconcileTextNodes(elem, existingBox, newBox, animate))
        }
      } else {
        // Create a new box
        promises.push(this.createNewBox(newBox, animate))
      }
    }
    await Promise.all(promises)
  }

  private resetAnimations(): void {
    const clone = this.root.cloneNode(true) as HTMLDivElement
    clone.childNodes.forEach((box) => {
      box.childNodes.forEach((span) => {
        ;(span as HTMLSpanElement).style.animation = ""
      })
    })
    this.root.replaceWith(clone)
    this.root = clone
  }

  private removeObsoleteBoxes(textBoxes: FreeformTextBox[], committedBoxes: FreeformTextBox[] | undefined): void {
    const currentIds = new Set(textBoxes.map((b) => `${b.x}-${b.y}-${b.width}`))
    const committedIds = new Set(committedBoxes?.map((b) => `${b.x}-${b.y}-${b.width}`))

    const obsoleteIds = [...committedIds].filter((id) => !currentIds.has(id))

    for (const id of obsoleteIds) {
      const elem = this.root.querySelector(`[data-vn-freeform="${id}"]`) as HTMLDivElement
      if (elem) elem.remove()
    }
  }

  private async reconcileTextNodes(
    elem: HTMLDivElement,
    existingBox: FreeformTextBox,
    newBox: FreeformTextBox,
    animate: boolean
  ): Promise<void> {
    const existingNodes = existingBox.textNodes.length
    const newNodes = newBox.textNodes.length

    if (!animate || newNodes < existingNodes) {
      // Reset text nodes, also just reset everything when we are undoing
      const [animationFinished, resolveAnimationFinished] = createResolvablePromise()
      elem.innerHTML = ""
      appendTextNodesToDiv(newBox.textNodes, elem, false, resolveAnimationFinished)
      return animationFinished
    } else if (newNodes > existingNodes) {
      // Append new nodes
      const [animationFinished, resolveAnimationFinished] = createResolvablePromise()
      const nodesToAppend = newBox.textNodes.slice(existingNodes)
      appendTextNodesToDiv(nodesToAppend, elem, animate, resolveAnimationFinished)
      return animationFinished
    }
  }

  private async createNewBox(newBox: FreeformTextBox, animate: boolean): Promise<void> {
    const [animationFinished, resolveAnimationFinished] = createResolvablePromise()
    const elem = document.createElement("div")
    elem.classList.add("vn-freeform-textbox")
    const xPos = this.sceneWidth * newBox.x
    const yPos = this.sceneHeight * newBox.y
    elem.style.transform = `translate(${Math.round(xPos)}px, ${Math.round(yPos)}px)`
    elem.style.width = `${newBox.width * 100}%`
    elem.dataset.vnFreeform = `${newBox.x}-${newBox.y}-${newBox.width}`
    this.root.appendChild(elem)

    appendTextNodesToDiv(newBox.textNodes, elem, animate, resolveAnimationFinished)
    return animationFinished
  }

  private getTextBoxElem(ip: FreeformInsertionPoint): HTMLDivElement | null {
    return this.root.querySelector(`[data-vn-freeform="${ip.x}-${ip.y}-${ip.width}"]`)
  }
}
