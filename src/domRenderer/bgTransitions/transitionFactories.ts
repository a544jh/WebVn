import { registerSchema } from "../../core/commands/backgrounds/Background"
import { ZodTypeAny } from "zod"

export abstract class Renderable {
  abstract render(target: CanvasRenderingContext2D, time: number): void
  private onFinishCallbacks: (() => void)[] = []
  public onFinish(cb: () => void): void {
    this.onFinishCallbacks.push(cb)
  }
  private finished = false

  protected animationFinished(): void {
    if (this.finished) return
    this.finished = true
    for (const cb of this.onFinishCallbacks) {
      cb()
    }
  }
}

export type TransitionFactory = (
  from: Renderable,
  to: Renderable,
  startTime: number,
  duration: number,
  options: unknown
) => Renderable

export const transitionFactories: Record<string, TransitionFactory> = {}

export function registerTransition(name: string, factory: TransitionFactory, optionsSchema: ZodTypeAny): void {
  transitionFactories[name] = factory
  registerSchema(name, optionsSchema)
}
