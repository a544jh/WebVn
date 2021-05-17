import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { Background, ViewBox } from "../core/state"
import { DomRenderer } from "./DomRenderer"

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
    const prev = this.renderer.getCommittedState()

    // TESTING
    const from: ViewBox = { x: 0, y: 0, w: 563, h: 422 }
    const to: ViewBox = { x: 330, y: 248, w: 710, h: 532 }
    const asset = new Image()
    asset.src = "backgrounds/a.png"
    await asset.decode() // TODO use asset loader...

    const asset2 = new Image()
    asset2.src = "backgrounds/b.png"
    await asset2.decode()

    const pan1 = new BgPan(asset, from, to, 10000, this.lastTick)
    const pan2 = new BgPan(asset2, from, { x: 440, y: 400, w: 400, h: 400 }, 10000, this.lastTick)
    const transition = new BlindsTransition(pan1, pan2, 2000, this.lastTick)
    this.currentRenderable = transition

    return Promise.resolve()
  }

  // TODO: only render frames when needed ..?
  private renderFrame(time: number) {
    this.lastTick = time

    this.currentRenderable.render(this.rootContext, time)

    window.requestAnimationFrame(this.renderFrame.bind(this))
  }
}

interface Renderable {
  render(target: CanvasRenderingContext2D, time: number): void
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

class FadeTransition implements Renderable {
  constructor(private from: Renderable, private to: Renderable, private duration: number, private startTime: number) {}

  public render(target: CanvasRenderingContext2D, time: number): void {
    let completion = (time - this.startTime) / this.duration
    if (completion > 1) completion = 1

    target.save()
    this.from.render(target, time)
    target.globalAlpha = completion
    this.to.render(target, time)
    target.restore()
  }
}

function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t
}

class BlindsTransition implements Renderable {
  constructor(private from: Renderable, private to: Renderable, private duration: number, private startTime: number) {}

  public render(target: CanvasRenderingContext2D, time: number): void {
    let completion = (time - this.startTime) / this.duration
    if (completion > 1) completion = 1

    this.from.render(target, time)

    const slices = 12
    const staggerFactor = 0.5
    const sliceWidth = target.canvas.width / slices

    target.save()
    target.beginPath()
    for (let i = 0; i < slices; i++) {
      const startC = lerp(0, i / slices, staggerFactor)
      const endC = lerp(1, (i + 1) / slices, staggerFactor)

      let sliceCompletion = (completion - startC) / (endC - startC)
      if (sliceCompletion > 1) sliceCompletion = 1
      if (sliceCompletion < 0) sliceCompletion = 0

      const width = sliceWidth * sliceCompletion
      target.rect(i * sliceWidth, 0, width, target.canvas.height)
    }
    target.clip()
    this.to.render(target, time)
    target.restore()
  }
}
