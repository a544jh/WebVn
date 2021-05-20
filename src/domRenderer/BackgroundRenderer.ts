import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { Background, ViewBox } from "../core/state"
import { createResolvablePromise, DomRenderer, lerp } from "./DomRenderer"
import { transitionFactories } from "./bgTransitions/transitionFactories"
import { Renderable } from "./bgTransitions/Renderable"
import "./bgTransitions/BlindsTransition"
import "./bgTransitions/FadeTransition"

export class BackgroundRenderer {
  private root: HTMLCanvasElement
  private rootContext: CanvasRenderingContext2D
  private readonly sceneWidth: number
  private readonly sceneHeight: number
  public lastTick: number
  private currentRenderable: Renderable
  private needMoreFrames: boolean

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
    this.currentRenderable = new NullRender(0, 0)
    this.needMoreFrames = false

    vnRoot.appendChild(this.root)
  }

  public async render(state: Background, animate: boolean): Promise<void> {
    if (state.shouldTransition) {
      this.lastTick = await new Promise((resolve) => {
        window.requestAnimationFrame((time) => {
          resolve(time)
          window.requestAnimationFrame(this.renderFrame.bind(this))
        })
      })

      if (!animate) {
        const newBg = this.getLastFrame(state)
        newBg.onFinish(() => (this.needMoreFrames = false))
        this.currentRenderable = newBg
        return Promise.resolve()
      }
      const [promise, resolve] = createResolvablePromise()

      const [newTransition, newPan] = this.getTransition(state)
      newTransition.onFinish(() => {
        resolve()
        this.currentRenderable = newPan
      })

      this.currentRenderable = newTransition
      return promise
    }

    // TODO bgPan command

    return Promise.resolve()
  }

  private renderFrame(time: number) {
    this.lastTick = time

    this.rootContext.clearRect(0, 0, this.sceneWidth, this.sceneHeight)
    try {
      this.needMoreFrames = this.currentRenderable.render(this.rootContext, time)
    } catch (e) {
      console.error(e)
    }
    if (this.needMoreFrames) window.requestAnimationFrame(this.renderFrame.bind(this))
  }

  private getTransition(state: Background): [Renderable, Renderable] {
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

    const factory = transitionFactories[state.transition]
    const transition = factory(
      this.currentRenderable,
      newPan,
      this.lastTick,
      state.transitonDuration,
      state.transitionOptions
    )
    return [transition, newPan]
  }

  private getLastFrame(state: Background): Renderable {
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

    const newPan = new BgPan(image, from, to, 0, this.lastTick)
    return newPan
  }
}

class NullRender extends Renderable {
  public renderFrame(): boolean {
    return false
  }
}

class BgPan extends Renderable {
  constructor(
    private image: HTMLImageElement,
    private from: ViewBox,
    private to: ViewBox,
    duration: number,
    startTime: number
  ) {
    super(startTime, duration)
  }

  public renderFrame(target: CanvasRenderingContext2D, completion: number): boolean {
    const x = lerp(this.from.x, this.to.x, completion)
    const y = lerp(this.from.y, this.to.y, completion)
    const w = lerp(this.from.w, this.to.w, completion)
    const h = lerp(this.from.h, this.to.h, completion)

    target.drawImage(this.image, x, y, w, h, 0, 0, target.canvas.width, target.canvas.height)
    return completion < 1
  }
}
