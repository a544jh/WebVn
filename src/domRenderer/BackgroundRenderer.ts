import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { undeclaredMessage } from "../core/manifest"
import { Background, isBackgroundColor, ViewBox } from "../core/state"
import { backgroundAssetPath } from "./assetPaths"
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

  // `state.image` is a background id after the manifest became a symbol table - or a colour, which
  // is the one thing it can be that no manifest declares - so the declarations come with it.
  public async render(state: Background, backgrounds: Record<string, string>, animate: boolean): Promise<void> {
    const prev = this.renderer.getCommittedState()?.animatableState.background
    if (state.shouldTransition || state.panTo !== prev?.panTo) {
      this.lastTick = await new Promise((resolve) => {
        window.requestAnimationFrame((time) => {
          resolve(time)
          window.requestAnimationFrame(this.renderFrame.bind(this))
        })
      })

      if (!animate) {
        const newBg = this.makeRenderable(state, backgrounds, 0)
        newBg.onFinish(() => (this.needMoreFrames = false))
        this.currentRenderable = newBg
        return Promise.resolve()
      }

      if (state.shouldTransition) {
        const [promise, resolve] = createResolvablePromise()

        const [newTransition, newPan] = this.getTransition(state, backgrounds)

        newTransition.onFinish(() => {
          this.currentRenderable = newPan
        })

        if (state.waitForPan) {
          newPan.onFinish(resolve)
        } else {
          newTransition.onFinish(resolve)
        }

        this.currentRenderable = newTransition
        return promise
      } else {
        // bgPan

        const newPan = this.makeRenderable(state, backgrounds, state.panDuration)

        this.currentRenderable = newPan

        if (state.waitForPan) {
          const [promise, resolve] = createResolvablePromise()
          newPan.onFinish(resolve)
          return promise
        }

        return Promise.resolve()
      }
    }

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

  private getTransition(state: Background, backgrounds: Record<string, string>): [Renderable, Renderable] {
    const newRenderable = this.makeRenderable(state, backgrounds, state.panDuration)

    const factory = transitionFactories[state.transition]
    const transition = factory(
      this.currentRenderable,
      newRenderable,
      this.lastTick,
      state.transitionDuration,
      state.transitionOptions
    )
    return [transition, newRenderable]
  }

  // What the background is, as something that can paint itself: a flat colour, or the declared
  // image panning between its two viewboxes. The three callers differ only in how long it takes -
  // a transition and a pan run for the authored duration, an unanimated render lands on the last
  // frame immediately - so this is also the single statement of the id-or-colour split that used
  // to be made three times.
  private makeRenderable(state: Background, backgrounds: Record<string, string>, duration: number): Renderable {
    if (isBackgroundColor(state.image)) {
      return new StaticColor(state.image, duration, this.lastTick)
    }

    const path = backgroundAssetPath(backgrounds, state.image)
    if (path === undefined) throw new Error(undeclaredMessage({ kind: "background", id: state.image }))
    const image = this.assetLoader.getAsset(path)
    if (!image) throw new Error(`Could not load ${state.image}`)

    const defaultView: ViewBox = {
      x: 0,
      y: 0,
      w: this.sceneWidth,
      h: this.sceneHeight,
    }

    return new BgPan(image, state.panFrom ?? defaultView, state.panTo ?? defaultView, duration, this.lastTick)
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

class StaticColor extends Renderable {
  constructor(private color: string, duration: number, startTime: number) {
    super(startTime, duration)
  }

  public renderFrame(target: CanvasRenderingContext2D, completion: number): boolean {
    target.save()
    target.fillStyle = this.color
    target.fillRect(0, 0, target.canvas.width, target.canvas.height)
    target.restore()
    return completion < 1
  }
}
