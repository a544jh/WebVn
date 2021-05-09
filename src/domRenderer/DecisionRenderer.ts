import { DecisionItem } from "../core/state"
import { createResolvablePromise, DomRenderer, ResolvePromiseFn } from "./DomRenderer"

export class DecisionRenderer {
  private renderer: DomRenderer
  private root: HTMLDivElement

  private readonly TRANSITION_DELAY = 300

  constructor(vnRoot: HTMLDivElement, renderer: DomRenderer) {
    this.renderer = renderer
    this.root = document.createElement("div")
    this.root.id = "vn-decision-renderer"
    vnRoot.appendChild(this.root)
  }

  public async render(decision: DecisionItem[] | null, animate: boolean): Promise<void> {
    if (animate && this.renderer.getCommittedState()?.decision === decision) {
      return Promise.resolve()
    }

    if (decision === null) {
      if (!animate) {
        this.root.innerHTML = ""
        return Promise.resolve()
      }
      const [promise, resolve] = createResolvablePromise()
      const elems = this.root.children
      for (let i = 0; i < elems.length; i++) {
        const elem = elems[i] as HTMLDivElement
        if (i === elems.length - 1) {
          resolveOnTransitionEnd(elem, resolve)
          elem.addEventListener("transitionend", () => (this.root.innerHTML = ""))
        }

        elem.style.transform = "scaleY(0)"
        elem.style.transitionDelay = i * this.TRANSITION_DELAY + "ms"
      }
      return promise
    }

    const elems: HTMLDivElement[] = []
    decision.forEach((item, i) => {
      // TODO handle showIf option
      const elem = createOptionElem(i, item.title)
      elem.addEventListener("click", () => {
        if (this.renderer.ignoreInputs) return
        this.renderer.ignoreInputs = true
        elem.addEventListener(
          "animationend",
          (e) => {
            this.renderer.ignoreInputs = false
            this.renderer.makeDecision(i)
            e.stopPropagation()
          },
          { capture: true }
        )
        elem.classList.add("vn-decision-item-blink")
      })
      elems.push(elem)
    })

    if (animate) {
      for (const [index, elem] of elems.entries()) {
        elem.style.transform = "scaleY(0)"
        elem.style.transitionDelay = index * this.TRANSITION_DELAY + "ms"
        this.root.appendChild(elem)
      }

      this.root.offsetHeight // force reflow

      const [promise, resolve] = createResolvablePromise()
      for (const [index, elem] of elems.entries()) {
        if (index === elems.length - 1) {
          resolveOnTransitionEnd(elem, resolve)
        }
        elem.style.transform = "scaleY(1)"
      }
      return promise
    } else {
      this.root.innerHTML = ""

      for (const elem of elems) {
        this.root.appendChild(elem)
      }

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

const resolveOnTransitionEnd = (elem: HTMLDivElement, resolve: ResolvePromiseFn) => {
  const onTransitionEnd = () => {
    elem.removeEventListener("transitionend", onTransitionEnd)
    resolve()
  }
  elem.addEventListener("transitionend", onTransitionEnd)
}
