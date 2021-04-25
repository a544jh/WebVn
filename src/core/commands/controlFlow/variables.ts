import { VnPlayerState, VnVariableValue } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"

class SetVariable extends Command {
  private identifier: string
  private value: VnVariableValue

  constructor(location: SourceLocation, identifier: string, value: VnVariableValue) {
    super(location)
    this.identifier = identifier
    this.value = value
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newState = { ...state }
    newState.variables = { ...state.variables, [this.identifier]: this.value }
    newState.stopAfterRender = false
    return newState
  }
}

registerCommandHandler("set", (obj, location) => {
  if (!Array.isArray(obj) || obj.length !== 2)
    return new ParserError("set command must be a seq of format [<identifier>, <value>]", location, ErrorLevel.WARNING)
  if (typeof obj[0] !== "string") return new ParserError("Identifier must be a string", location, ErrorLevel.WARNING)
  if (!isVnVariableValue(obj[1]))
    return new ParserError("Value must be a string, number or boolean", location, ErrorLevel.WARNING)
  return new SetVariable(location, obj[0], obj[1])
})

export const isVnVariableValue = (value: unknown): value is VnVariableValue => {
  return ["string", "number", "boolean"].includes(typeof value)
}
