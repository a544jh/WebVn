import { z } from "zod"
import { Renderable } from "./Renderable"
import { registerTransition } from "./transitionFactories"

class FadeTransition extends Renderable {
  constructor(private from: Renderable, private to: Renderable, startTime: number, duration: number) {
    super(startTime, duration)
  }

  public renderFrame(target: CanvasRenderingContext2D, completion: number, time: number): boolean {
    target.save()
    this.from.render(target, time)
    target.globalAlpha = completion
    const toNeedsFrames = this.to.render(target, time)
    target.restore()
    return completion < 1 || toNeedsFrames
  }
}

const schema = z.undefined()

function fadeFactory(from: Renderable, to: Renderable, startTime: number, duration: number): Renderable {
  return new FadeTransition(from, to, startTime, duration)
}

registerTransition("fade", fadeFactory, schema)
