import { z, ZodError } from "zod"
import { VnPlayerState, VnVariableValue } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"

export class ValueExpression {
  constructor(public value: VnVariableValue) {}
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

const VnVariableValueSchema = z.union([z.string(), z.number(), z.boolean()])

const SetCommandSchema = z.tuple([
  z.string().refine((s) => s.charAt(0) === "$", "Identifier must begin with a dollar sign."),
  z.enum(["=", "+=", "-=", "*=", "/="]),
  VnVariableValueSchema,
])

registerCommandHandler("set", (obj, location) => {
  let cmd
  try {
    cmd = SetCommandSchema.parse(obj)
  } catch (e) {
    return new ParserError((e as ZodError).message, location, ErrorLevel.WARNING)
  }
  const identifier = cmd[0].slice(1)
  const operator = cmd[1]
  const expr = new ValueExpression(cmd[2])
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
  }
})

export const isVnVariableValue = (value: unknown): value is VnVariableValue => {
  return ["string", "number", "boolean"].includes(typeof value)
}
