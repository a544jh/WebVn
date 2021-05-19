import { z } from "zod"
import { registerTransition, Renderable } from "./transitionFactories"

class FadeTransition extends Renderable {
  constructor(private from: Renderable, private to: Renderable, private startTime: number, private duration: number) {
    super()
  }

  public render(target: CanvasRenderingContext2D, time: number): void {
    let completion = (time - this.startTime) / this.duration
    if (completion > 1) {
      completion = 1
      this.animationFinished()
    }

    target.save()
    this.from.render(target, time)
    target.globalAlpha = completion
    this.to.render(target, time)
    target.restore()
  }
}

const schema = z.undefined()

function fadeFactory(from: Renderable, to: Renderable, startTime: number, duration: number): Renderable {
  return new FadeTransition(from, to, startTime, duration)
}

registerTransition("fade", fadeFactory, schema)
