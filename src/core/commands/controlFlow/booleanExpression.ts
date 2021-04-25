import { VnPlayerState, VnVariableValue } from "../../state"
import { ErrorLevel, ParserError, SourceLocation } from "../Parser"
import { isVnVariableValue } from "./variables"

export abstract class BooleanExpression {
  private location: SourceLocation
  constructor(location: SourceLocation) {
    this.location = location
  }
  abstract evaluate(state: VnPlayerState): boolean
}

class Equals extends BooleanExpression {
  private identifier: string
  private value: VnVariableValue
  constructor(location: SourceLocation, identifier: string, value: VnVariableValue) {
    super(location)
    this.identifier = identifier
    this.value = value
  }

  public evaluate(state: VnPlayerState) {
    if (!state.variables[this.identifier]) {
      throw new Error(`VN variable ${this.identifier} not set.`)
    }
    return state.variables[this.identifier] === this.value
  }
}

export const parseIdentifierValuePair = (
  obj: unknown,
  location: SourceLocation
): [string, VnVariableValue] | ParserError => {
  if (!Array.isArray(obj) || obj.length !== 2)
    return new ParserError(
      "Boolean expression value must be of format [<identifier>, <value>]",
      location,
      ErrorLevel.WARNING
    )
  if (typeof obj[0] !== "string") return new ParserError("Identifier must be a string", location, ErrorLevel.WARNING)
  if (!isVnVariableValue(obj[1]))
    return new ParserError("Value must be a string, number or boolean", location, ErrorLevel.WARNING)
  return [obj[0], obj[1]]
}

export const parseBooleanExpression = (obj: unknown, location: SourceLocation): BooleanExpression | ParserError => {
  if (typeof obj !== "object" || obj === null || Object.keys(obj).length !== 1)
    return new ParserError("Boolean expression must be a single keyed object", location, ErrorLevel.WARNING)
  const key = Object.keys(obj)[0]
  const value = (obj as Record<string, unknown>)[key]
  switch (key) {
    case "eq": {
      const pair = parseIdentifierValuePair(value, location)
      if (pair instanceof ParserError) return pair
      return new Equals(location, ...pair)
    }
    default:
      return new ParserError("Boolean expression type not recognized", location, ErrorLevel.WARNING)
  }
}
