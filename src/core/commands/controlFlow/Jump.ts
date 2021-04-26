import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation, tsHasOwnProperty } from "../Parser"
import { BooleanExpression, parseBooleanExpression } from "./booleanExpression"

export class Jump extends Command {
  targetLabel: string
  condition: BooleanExpression | undefined

  constructor(location: SourceLocation, targetLabel: string, condition?: BooleanExpression) {
    super(location)
    this.condition = condition
    this.targetLabel = targetLabel
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
  if (typeof obj === "string") return new Jump(location, obj)
  let to
  let expr
  if (typeof obj !== "object" || obj === null)
    return new ParserError("Target label must be a string or map.", location, ErrorLevel.WARNING)
  if (tsHasOwnProperty(obj, "to")) {
    if (typeof obj.to !== "string")
      return new ParserError(`Value of "to" must be a string`, location, ErrorLevel.WARNING)
    to = obj.to
  } else {
    return new ParserError(`map form of jump command must have key "of"`, location, ErrorLevel.WARNING)
  }
  if (tsHasOwnProperty(obj, "if")) {
    expr = parseBooleanExpression(obj.if, location)
    if (expr instanceof ParserError) return expr
  } else {
    return new ParserError(`map form of jump command must have key "if"`, location, ErrorLevel.WARNING)
  }
  return new Jump(location, to, expr)
})
