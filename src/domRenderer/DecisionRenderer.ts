import { DecisionItem } from "../core/state"

export class DecisionRenderer {
  private root: HTMLDivElement

  constructor(vnRoot: HTMLDivElement) {
    this.root = document.createElement("div")
    this.root.id = "vn-decision-renderer"
    vnRoot.appendChild(this.root)
  }

  private rendered = false // for testing

  public async render(decision: DecisionItem[] | null): Promise<void> {

    if (!this.rendered) {
      this.root.appendChild(createOptionElem(1, "Option 1"))
      this.root.appendChild(createOptionElem(2, "Option 2"))
      this.root.appendChild(createOptionElem(3, "Option 3"))

      this.rendered = true
    }

    this.root.offsetHeight // force reflow

    for (const child of this.root.children) {
      if (child.tagName === "DIV") {
         const div = child as HTMLDivElement
         div.style.transform = "scaleY(1)"
      }
    }

    return Promise.resolve()
  }

}

const createOptionElem = (id: number, title: string): HTMLDivElement => {
  const elem = document.createElement("div")
  elem.classList.add("vn-decision-item")
  elem.innerText = title
  elem.style.transform = "scaleY(0)"
  elem.style.transitionDelay = (id * 300) + "ms"
  return elem
}