import { registeredSchemas, registerSchema } from "../../core/commands/backgrounds/Background"
import { AnyZodObject, ZodTypeAny } from "zod"

export interface Renderable {
  render(target: CanvasRenderingContext2D, time: number): void
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
