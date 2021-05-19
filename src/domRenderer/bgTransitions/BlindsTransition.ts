import { z } from "zod"
import { registeredSchemas } from "../../core/commands/backgrounds/Background"
import { registerTransition, Renderable } from "./transitionFactories"
import { lerp } from "../DomRenderer"

class BlindsTransition implements Renderable {
  constructor(
    private from: Renderable,
    private to: Renderable,
    private startTime: number,
    private duration: number,
    private slices: number,
    private staggerFactor: number
  ) {}

  public render(target: CanvasRenderingContext2D, time: number): void {
    let completion = (time - this.startTime) / this.duration
    if (completion > 1) completion = 1

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
    this.to.render(target, time)
    target.restore()
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
