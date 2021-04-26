import { Renderer } from "../Renderer"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { TextBoxRenderer } from "./TextBoxRenderer"

import "./animations.css"
import "./defaultTheme.css"
import { DecisionRenderer } from "./DecisionRenderer"

export class DomRenderer implements Renderer {
  public onRenderCallbacks: Array<() => void> = []
  public onFinishedCallbacks: Array<() => void> = []

  private finished: boolean

  private root: HTMLDivElement
  private player: VnPlayer

  private committedState: VnPlayerState | null

  public ignoreInputs = false

  private textBoxRenderer: TextBoxRenderer
  private decisionRenderer: DecisionRenderer

  private arrow: HTMLDivElement

  constructor(elem: HTMLDivElement, player: VnPlayer) {
    this.finished = true

    this.root = elem
    this.player = player

    this.committedState = null

    this.root.addEventListener("click", this.advance.bind(this))
    this.root.addEventListener("wheel", this.handleScrollWheelEvent.bind(this))

    this.textBoxRenderer = new TextBoxRenderer(this.root)
    this.decisionRenderer = new DecisionRenderer(this.root, this)

    this.arrow = document.createElement("div")
    this.arrow.classList.add("vn-arrow")
    this.root.appendChild(this.arrow)

    this.render(this.player.state, true)
  }

  public render(state: VnPlayerState, animate: boolean): void {
    this.onRenderCallbacks.forEach((cb) => cb())

    this.finished = false
    this.arrow.style.display = "none"

    const animationsFinished: Array<Promise<void>> = []

    // TODO: diffing (when we know more about other animations)
    const committedText = this.committedState === null ? null : this.committedState.animatableState.text

    animationsFinished.push(this.textBoxRenderer.render(committedText, state.animatableState.text, animate))
    animationsFinished.push(this.decisionRenderer.render(state.decision, animate))

    this.committedState = state

    Promise.all(animationsFinished).then(() => {
      if (this.committedState?.decision === null) this.arrow.style.display = ""
      this.finished = true
      this.onFinishedCallbacks.forEach((cb) => cb())
      if (!this.player.state.stopAfterRender) {
        this.player.advance()
        this.render(this.player.state, animate)
      }
    })
  }

  public advance(): void {
    if (this.ignoreInputs) return
    if (this.finished) {
      this.player.advance()
      this.render(this.player.state, true)
    } else {
      this.render(this.player.state, false)
    }
  }

  public makeDecision(id: number): void {
    this.player.makeDecision(id)
    this.render(this.player.state, true)
  }

  public getCommittedState(): VnPlayerState | null {
    return this.committedState
  }

  private handleScrollWheelEvent(e: WheelEvent) {
    e.preventDefault()
    if (this.ignoreInputs) return
    // TODO: proper backlog rollback
    // down
    if (e.deltaY > 0) {
      this.player.goToCommand(this.player.state.commandIndex + 1)
      // up
    } else if (e.deltaY < 0) {
      this.player.goToCommand(this.player.state.commandIndex - 1)
    }

    this.render(this.player.state, false)
  }
}

export type ResolvePromiseFn = (value?: unknown | PromiseLike<unknown> | undefined) => void

export const createResolvablePromise = (): [Promise<void>, ResolvePromiseFn] => {
  let resolveFn: ResolvePromiseFn | undefined = undefined
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve
  })

  if (resolveFn === undefined) {
    // just making typescript happy...
    throw Error("This shouldn't happen...")
  }

  return [promise, resolveFn]
}
