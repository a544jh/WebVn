import { Renderer } from "../Renderer"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { TextBoxRenderer } from "./TextBoxRenderer"

import "./animations.css"
import "./defaultTheme.css"
import "./gg.css"
import { DecisionRenderer } from "./DecisionRenderer"
import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { SpriteRenderer } from "./SpriteRenderer"
import { BackgroundRenderer } from "./BackgroundRenderer"
import { AudioAssetLoaderSrc } from "../assetLoaders/AudioAssetLoaderSrc"
import { AudioRenderer } from "./AudioRenderer"

export class DomRenderer implements Renderer {
  public onRenderCallbacks: Array<() => void> = []
  public onFinishedCallbacks: Array<() => void> = []
  private consecutiveCommands = 0

  private finished: boolean

  private root: HTMLDivElement
  private player: VnPlayer

  private committedState: VnPlayerState | null

  private SKIP_DELAY = 50

  public ignoreInputs = false
  public skipMode = false

  private textBoxRenderer: TextBoxRenderer
  private decisionRenderer: DecisionRenderer
  private spriteRenderer: SpriteRenderer
  private backgroundRenderer: BackgroundRenderer
  private audioRenderer: AudioRenderer

  private imageLoader: ImageAssetLoaderSrc
  private audioLoader: AudioAssetLoaderSrc

  private arrow: HTMLDivElement

  constructor(elem: HTMLDivElement, player: VnPlayer) {
    this.finished = true

    this.root = elem
    this.player = player

    this.committedState = null
    this.root.addEventListener(
      "click",
      (e) => {
        // click anywhere to cancel skip mode
        if (this.skipMode) {
          this.skipMode = false
          e.stopPropagation()
        }
      },
      { capture: true }
    )
    this.root.addEventListener("click", () => {
      this.advance()
    })
    this.root.addEventListener("wheel", this.handleScrollWheelEvent.bind(this))
    document.addEventListener("keydown", this.handleKeyDownEvent.bind(this))
    this.root.querySelector(".vn-action-back")?.addEventListener("click", (e) => {
      e.stopPropagation()
      this.undo()
    })
    this.root.querySelector(".vn-action-skip")?.addEventListener("click", (e) => {
      e.stopPropagation()
      this.enterSkipMode()
    })

    this.imageLoader = new ImageAssetLoaderSrc()
    this.audioLoader = new AudioAssetLoaderSrc()

    this.textBoxRenderer = new TextBoxRenderer(this.root)
    this.decisionRenderer = new DecisionRenderer(this.root, this)
    this.spriteRenderer = new SpriteRenderer(this.root, this, this.imageLoader)
    this.backgroundRenderer = new BackgroundRenderer(this.root, this, this.imageLoader)
    this.audioRenderer = new AudioRenderer(this, this.audioLoader)

    this.arrow = document.createElement("div")
    this.arrow.classList.add("vn-arrow", "vn-anim-bounce")
    this.root.appendChild(this.arrow)

    this.render(true)
  }

  public render(animate: boolean): void {
    this.ignoreInputs = false
    const state = this.player.state

    this.onRenderCallbacks.forEach((cb) => cb())

    this.finished = false
    this.arrow.style.display = "none"

    const animationsFinished: Array<Promise<void | void[]>> = []

    // TODO: diffing (when we know more about other animations)
    const committedText = this.committedState === null ? null : this.committedState.animatableState.text

    animationsFinished.push(this.textBoxRenderer.render(committedText, state.animatableState.text, animate))
    animationsFinished.push(this.decisionRenderer.render(state.decision, animate))
    animationsFinished.push(this.spriteRenderer.render(state.animatableState.sprites, animate))
    animationsFinished.push(this.backgroundRenderer.render(state.animatableState.background, animate))
    animationsFinished.push(this.audioRenderer.render(state.animatableState.audio))

    this.committedState = state

    Promise.all(animationsFinished).then(() => {
      if (this.committedState?.decision === null) this.arrow.style.display = ""

      if (!this.player.isNextCommandSeen() || this.player.state.decision !== null) {
        this.root.querySelector(".vn-action-skip")?.classList.add("vn-action-disabled")
      } else {
        this.root.querySelector(".vn-action-skip")?.classList.remove("vn-action-disabled")
      }

      this.finished = true
      this.onFinishedCallbacks.forEach((cb) => cb())
      if (this.consecutiveCommands > 10000) {
        alert("Seems like we're stuck in an infinite loop")
        throw new Error("Got stuck in infinite loop while rendering")

        return
      }
      if (!this.player.state.stopAfterRender) {
        this.consecutiveCommands++
        this.player.advance()
        this.render(animate)
      }
    })
  }

  public advance(): void {
    if (this.ignoreInputs) return
    this.consecutiveCommands = 0
    if (this.finished) {
      this.player.advance()
      this.render(true)
    } else {
      this.render(false)
    }
  }

  public makeDecision(id: number): void {
    this.consecutiveCommands = 0
    this.player.makeDecision(id)
    this.render(true)
  }

  public undo(): void {
    this.consecutiveCommands = 0
    this.player.undo()
    this.render(false)
  }

  private skip() {
    if (!this.player.isNextCommandSeen()) {
      this.player.advanceUntilStop()
      this.render(true)
      this.skipMode = false
    } else {
      this.player.advanceUntilStop()
      this.render(false)
    }
    if (this.player.state.decision !== null) {
      this.skipMode = false
    }
    if (this.skipMode) setTimeout(this.skip.bind(this), this.SKIP_DELAY)
  }

  public enterSkipMode(): void {
    if (this.skipMode) return
    if (!this.player.isNextCommandSeen() || this.player.state.decision !== null) return
    this.skipMode = true
    setTimeout(this.skip.bind(this), this.SKIP_DELAY)
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
      this.player.goToCommandDirect(this.player.state.commandIndex + 1)
      // up
    } else if (e.deltaY < 0) {
      this.player.goToCommandDirect(this.player.state.commandIndex - 1)
    }

    this.render(false)
  }

  private handleKeyDownEvent(e: KeyboardEvent) {
    if (e.key === "PageUp") {
      e.preventDefault()
      this.undo()
    }
  }

  public loadAssets(): Promise<unknown> {
    const state = this.player.state
    for (const actor in state.actors) {
      const sprites = state.actors[actor].sprites
      if (sprites === undefined) continue
      for (const sprite of sprites) {
        const path = "sprites/" + actor + "/" + sprite

        this.imageLoader.registerAsset(path)
      }
    }
    // load backgrounds ....
    for (const bg of state.backgrounds) {
      const path = "backgrounds/" + bg
      this.imageLoader.registerAsset(path)
    }

    for (const asset of state.audioAssets) {
      const path = "audio/" + asset
      this.audioLoader.registerAsset(path)
    }

    return Promise.all([this.imageLoader.loadAll(), this.audioLoader.loadAll()])
  }
}

// util stuff ...

export type ResolvePromiseFn = (value?: void | PromiseLike<void>) => void

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
export function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t
}
