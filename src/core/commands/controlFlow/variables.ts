import { VnPlayerState, VnVariableValue } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"

export class ValueExpression {
  value: VnVariableValue
  constructor(value: VnVariableValue) {
    this.value = value
  }
  public evaluate(state: VnPlayerState): VnVariableValue {
    if (typeof this.value === "string" && this.value.charAt(0) === "$") {
      // escape, $$var => "$var": string
      if (this.value.charAt(1) === "$") {
        return this.value.slice(1)
      }

      const identifier = this.value.slice(1)
      if (state.variables[identifier] === undefined) {
        throw new Error(`VN variable ${identifier} not set.`)
      }
      return state.variables[identifier]
    }
    return this.value
  }
}

class SetVariable extends Command {
  constructor(location: SourceLocation, private identifier: string, private expr: ValueExpression) {
    super(location)
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newState = { ...state }
    const newValue = this.expr.evaluate(state)
    newState.variables = { ...state.variables, [this.identifier]: newValue }
    newState.stopAfterRender = false
    return newState
  }
}

type Operator = (left: VnVariableValue, right: VnVariableValue) => VnVariableValue

const add: Operator = (left, right) => {
  if (typeof left === "string" && typeof right === "string") {
    return left + right
  }
  if (typeof left === "number" && typeof right === "number") {
    return left + right
  }
  throw new Error("Values to be added must be of the same type.")
}

const sub: Operator = (left, right) => {
  if (typeof left === "number" && typeof right === "number") {
    return left - right
  }
  throw new Error("Values to be subtracted must be numbers.")
}

const mul: Operator = (left, right) => {
  if (typeof left === "number" && typeof right === "number") {
    return left * right
  }
  throw new Error("Values to be multiplied must be numbers.")
}

const div: Operator = (left, right) => {
  if (typeof left === "number" && typeof right === "number") {
    return left / right
  }
  throw new Error("Values to be divided must be numbers.")
}

class BinaryOperation extends Command {
  constructor(
    location: SourceLocation,
    private identifier: string,
    private expr: ValueExpression,
    private operator: Operator
  ) {
    super(location)
  }
  public apply(state: VnPlayerState): VnPlayerState {
    const newState = { ...state }
    const leftValue = state.variables[this.identifier]
    if (leftValue === undefined) {
      throw new Error(`VN variable ${this.identifier} not set`)
    }
    const rightValue = this.expr.evaluate(state)
    newState.variables = { ...state.variables, [this.identifier]: this.operator(leftValue, rightValue) }
    newState.stopAfterRender = false
    return newState
  }
}

registerCommandHandler("set", (obj, location) => {
  if (!Array.isArray(obj) || obj.length !== 3)
    return new ParserError(
      "set command must be a seq of format [<identifier>, <operator>, <value>].",
      location,
      ErrorLevel.WARNING
    )
  if (typeof obj[0] !== "string") return new ParserError("Identifier must be a string.", location, ErrorLevel.WARNING)
  if (obj[0].charAt(0) !== "$")
    return new ParserError("Identifier must begin with a dollar sign.", location, ErrorLevel.WARNING)
  const identifier = obj[0].slice(1)
  if (typeof obj[1] !== "string") {
    return new ParserError("Operator must be a string.", location, ErrorLevel.WARNING)
  }
  const operator = obj[1]
  if (!isVnVariableValue(obj[2]))
    return new ParserError("Value must be a string, number or boolean.", location, ErrorLevel.WARNING)
  const expr = new ValueExpression(obj[2])
  switch (operator) {
    case "=":
      return new SetVariable(location, identifier, expr)
    case "+=":
      return new BinaryOperation(location, identifier, expr, add)
    case "-=":
      return new BinaryOperation(location, identifier, expr, sub)
    case "*=":
      return new BinaryOperation(location, identifier, expr, mul)
    case "/=":
      return new BinaryOperation(location, identifier, expr, div)
    default:
      return new ParserError(`${operator} is not a valid operator.`, location, ErrorLevel.WARNING)
  }
})

export const isVnVariableValue = (value: unknown): value is VnVariableValue => {
  return ["string", "number", "boolean"].includes(typeof value)
}
