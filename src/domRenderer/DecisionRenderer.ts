import { VnPlayer } from "../core/player"
import { DecisionItem } from "../core/state"
import { createResolvablePromise } from "./DomRenderer"

export class DecisionRenderer {
  private player: VnPlayer
  private root: HTMLDivElement

  constructor(vnRoot: HTMLDivElement, player: VnPlayer) {
    this.player = player
    this.root = document.createElement("div")
    this.root.id = "vn-decision-renderer"
    vnRoot.appendChild(this.root)
  }

  // This might be a better model than keeping the previous state
  private committed: DecisionItem[] | null = null

  public async render(decision: DecisionItem[] | null, animate: boolean): Promise<void> {
    if (animate && this.committed === decision) {
      return Promise.resolve()
    }

    if (decision === null) {
      this.root.innerHTML = ""
      this.committed = null
      return Promise.resolve()
    }

    const elems: HTMLDivElement[] = []
    decision.forEach((item, i) => {
      // TODO handle showIf option
      const elem = createOptionElem(i, item.title)
      elem.addEventListener("click", () => {
        // TODO Blink animation
        this.player.makeDecision(i)
      })
      elems.push(elem)
    })

    if (animate) {
      for (const [index, elem] of elems.entries()) {
        elem.style.transform = "scaleY(0)"
        elem.style.transitionDelay = index * 300 + "ms"
        this.root.appendChild(elem)
      }

      this.root.offsetHeight // force reflow

      const [promise, resolve] = createResolvablePromise()
      for (const [index, elem] of elems.entries()) {
        if (index === elems.length - 1) {
          const onAnimationEnd = () => {
            elem.removeEventListener("transitionend", onAnimationEnd)
            resolve()
          }
          elem.addEventListener("transitionend", onAnimationEnd)
        }
        elem.style.transform = "scaleY(1)"
      }
      this.committed = decision
      return promise
    } else {
      this.root.innerHTML = ""

      for (const elem of elems) {
        this.root.appendChild(elem)
      }

      this.committed = decision
      return Promise.resolve()
    }
  }
}

const createOptionElem = (id: number, title: string): HTMLDivElement => {
  const elem = document.createElement("div")
  elem.classList.add("vn-decision-item")
  elem.innerText = title

  return elem
}
