import { z } from "zod"
import { registeredSchemas } from "../../core/commands/backgrounds/Background"
import { registerTransition } from "./transitionFactories"
import { lerp } from "../DomRenderer"
import { Renderable } from "./Renderable"

class BlindsTransition extends Renderable {
  constructor(
    private from: Renderable,
    private to: Renderable,
    startTime: number,
    duration: number,
    private slices: number,
    private staggerFactor: number
  ) {
    super(startTime, duration)
  }

  public renderFrame(target: CanvasRenderingContext2D, completion: number, time: number): boolean {
    this.from.render(target, time)

    const sliceWidth = target.canvas.width / this.slices

    target.save()
    target.beginPath()
    for (let i = 0; i < this.slices; i++) {
      const startC = lerp(0, i / this.slices, this.staggerFactor)
      const endC = lerp(1, (i + 1) / this.slices, this.staggerFactor)

      let sliceCompletion = (completion - startC) / (endC - startC)
      if (sliceCompletion > 1) sliceCompletion = 1
      if (sliceCompletion < 0) sliceCompletion = 0

      const width = sliceWidth * sliceCompletion
      target.rect(i * sliceWidth, 0, width, target.canvas.height)
    }
    target.clip()
    const toNeedsFrames = this.to.render(target, time)
    target.restore()

    return completion < 1 || toNeedsFrames
  }
}

function blindsFactory(
  from: Renderable,
  to: Renderable,
  startTime: number,
  duration: number,
  options: unknown
): Renderable {
  const Schema = registeredSchemas["blinds"].optional()
  const blindsOptions = Schema.parse(options) as z.infer<typeof Schema>

  const slices = blindsOptions?.slices ?? 16
  const stagger = blindsOptions?.staggerFactor ?? 0.5

  return new BlindsTransition(from, to, startTime, duration, slices, stagger)
}

const BlindsOptionsSchema = z.object({
  slices: z.number().optional(),
  staggerFactor: z.number().optional(),
})

registerTransition("blinds", blindsFactory, BlindsOptionsSchema)
