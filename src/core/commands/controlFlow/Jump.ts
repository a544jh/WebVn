import { z, ZodError } from "zod"
import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"
import { BooleanExpression, parseBooleanExpression } from "./booleanExpression"

const JumpCommandSchema = z.union([
  z.string(),
  z.object({
    to: z.string(),
    if: z.unknown(),
  }),
])

export class Jump extends Command {
  constructor(location: SourceLocation, public targetLabel: string, public condition?: BooleanExpression) {
    super(location)
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newState = { ...state }
    if (state.labels[this.targetLabel] === undefined) {
      throw new Error("Target label does not exist.")
    }
    if (this.condition === undefined || this.condition.evaluate(state))
      newState.commandIndex = state.labels[this.targetLabel]
    newState.stopAfterRender = false
    return newState
  }
}

registerCommandHandler("jump", (obj, location) => {
  let cmd
  try {
    cmd = JumpCommandSchema.parse(obj)
  } catch (e) {
    return new ParserError((e as ZodError).message, location, ErrorLevel.WARNING)
  }
  if (typeof cmd === "string") return new Jump(location, cmd)
  const expr = parseBooleanExpression(cmd.if, location)
  if (expr instanceof ParserError) return expr
  return new Jump(location, cmd.to, expr)
})
