import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { Background, ViewBox } from "../core/state"
import { DomRenderer, lerp } from "./DomRenderer"

import { Renderable, transitionFactories } from "./bgTransitions/transitionFactories"
import "./bgTransitions/BlindsTransition"
import "./bgTransitions/FadeTransition"

export class BackgroundRenderer {
  private root: HTMLCanvasElement
  private rootContext: CanvasRenderingContext2D
  private readonly sceneWidth: number
  private readonly sceneHeight: number
  public lastTick: number
  private currentRenderable: Renderable

  constructor(vnRoot: HTMLDivElement, private renderer: DomRenderer, private assetLoader: ImageAssetLoaderSrc) {
    this.sceneWidth = vnRoot.clientWidth
    this.sceneHeight = vnRoot.clientHeight
    this.root = document.createElement("canvas")
    this.root.id = "vn-background-renderer"
    this.root.width = this.sceneWidth
    this.root.height = this.sceneHeight
    this.lastTick = 0
    const ctx = this.root.getContext("2d")
    if (ctx === null) throw new Error("Counld not create 2d rendering context")
    this.rootContext = ctx
    this.currentRenderable = new NullRender()

    vnRoot.appendChild(this.root)

    window.requestAnimationFrame(this.renderFrame.bind(this))
  }

  public async render(state: Background): Promise<void> {
    const prev = this.renderer.getCommittedState()?.animatableState.background

    // should transition
    if (state.shouldTransition) {
      const newTransition = this.getTransition(state)
      this.currentRenderable = newTransition
    }

    return Promise.resolve()
  }

  // TODO: only render frames when needed ..?
  private renderFrame(time: number) {
    this.lastTick = time

    this.rootContext.clearRect(0, 0, this.sceneWidth, this.sceneHeight)
    try {
      this.currentRenderable.render(this.rootContext, time)
    } catch (e) {
      console.error(e)
    }
    window.requestAnimationFrame(this.renderFrame.bind(this))
  }

  private getTransition(state: Background): Renderable {
    // find the constructor ...
    // transition: string, options -> Renderable

    const factory = transitionFactories[state.transition]

    const image = this.assetLoader.getAsset("backgrounds/" + state.image)
    if (!image) throw new Error(`Could not load ${state.image}`)

    const defaultView: ViewBox = {
      x: 0,
      y: 0,
      w: this.sceneWidth,
      h: this.sceneHeight,
    }

    const from = state.panFrom ?? defaultView
    const to = state.panTo ?? defaultView

    const newPan = new BgPan(image, from, to, state.panDuration, this.lastTick)

    const transition = factory(
      this.currentRenderable,
      newPan,
      this.lastTick,
      state.transitonDuration,
      state.transitionOptions
    )
    return transition
  }
}

class NullRender implements Renderable {
  public render(target: CanvasRenderingContext2D, time: number): void {
    return undefined
  }
}

class BgPan implements Renderable {
  constructor(
    private image: HTMLImageElement,
    private from: ViewBox,
    private to: ViewBox,
    private duration: number,
    private startTime: number
  ) {}

  public render(target: CanvasRenderingContext2D, time: number): void {
    let completion = (time - this.startTime) / this.duration

    if (completion > 1) completion = 1

    const x = lerp(this.from.x, this.to.x, completion)
    const y = lerp(this.from.y, this.to.y, completion)
    const w = lerp(this.from.w, this.to.w, completion)
    const h = lerp(this.from.h, this.to.h, completion)

    target.drawImage(this.image, x, y, w, h, 0, 0, target.canvas.width, target.canvas.height)
  }
}
