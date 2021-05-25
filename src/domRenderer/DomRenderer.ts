import { Renderer } from "../Renderer"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { TextBoxRenderer } from "./TextBoxRenderer"

import "./animations.css"
import "./defaultTheme.css"
import { DecisionRenderer } from "./DecisionRenderer"
import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { SpriteRenderer } from "./SpriteRenderer"
import { BackgroundRenderer } from "./BackgroundRenderer"
import { AudioAssetLoaderSrc } from "../assetLoaders/AudioAssetLoaderSrc"
import { AudioRenderer } from "./AudioRenderer"

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

    this.root.addEventListener("click", this.advance.bind(this))
    this.root.addEventListener("wheel", this.handleScrollWheelEvent.bind(this))
    document.addEventListener("keydown", this.handleKeyDownEvent.bind(this))

    this.imageLoader = new ImageAssetLoaderSrc()
    this.audioLoader = new AudioAssetLoaderSrc()

    this.textBoxRenderer = new TextBoxRenderer(this.root)
    this.decisionRenderer = new DecisionRenderer(this.root, this)
    this.spriteRenderer = new SpriteRenderer(this.root, this, this.imageLoader)
    this.backgroundRenderer = new BackgroundRenderer(this.root, this, this.imageLoader)
    this.audioRenderer = new AudioRenderer(this, this.audioLoader)

    this.arrow = document.createElement("div")
    this.arrow.classList.add("vn-arrow")
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
      this.finished = true
      this.onFinishedCallbacks.forEach((cb) => cb())
      if (!this.player.state.stopAfterRender) {
        this.player.advance()
        this.render(animate)
      }
    })
  }

  public advance(): void {
    if (this.ignoreInputs) return
    if (this.finished) {
      this.player.advance()
      this.render(true)
    } else {
      this.render(false)
    }
  }

  public makeDecision(id: number): void {
    this.player.makeDecision(id)
    this.render(true)
  }

  public undo(): void {
    this.player.undo()
    this.render(false)
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
