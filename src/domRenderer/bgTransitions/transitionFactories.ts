import { registerSchema } from "../../core/commands/backgrounds/Background"
import { ZodTypeAny } from "zod"
import { Renderable } from "./Renderable"

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
