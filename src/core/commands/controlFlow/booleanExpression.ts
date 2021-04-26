import { VnPlayerState, VnVariableValue } from "../../state"
import { ErrorLevel, ParserError, SourceLocation } from "../Parser"
import { isVnVariableValue } from "./variables"

class ValueExpression {
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
      if (!state.variables[identifier]) {
        throw new Error(`VN variable ${identifier} not set.`)
      }
      return state.variables[identifier]
    }
    return this.value
  }
}

export abstract class BooleanExpression {
  private location: SourceLocation
  constructor(location: SourceLocation) {
    this.location = location
  }
  abstract evaluate(state: VnPlayerState): boolean
}

class BinaryExpression extends BooleanExpression {
  private operator: Operator
  private left: ValueExpression
  private right: ValueExpression
  constructor(location: SourceLocation, operator: Operator, left: ValueExpression, right: ValueExpression) {
    super(location)
    this.operator = operator
    this.left = left
    this.right = right
  }

  public evaluate(state: VnPlayerState) {
    const leftVal = this.left.evaluate(state)
    const rightVal = this.right.evaluate(state)
    return this.operator(leftVal, rightVal)
  }
}

type Operator = (left: VnVariableValue, right: VnVariableValue) => boolean

const equal = (left: VnVariableValue, right: VnVariableValue) => left === right
const notEqual = (left: VnVariableValue, right: VnVariableValue) => left !== right
const lessThan = (left: VnVariableValue, right: VnVariableValue) => left < right
const lessThanEqual = (left: VnVariableValue, right: VnVariableValue) => left <= right
const greaterThan = (left: VnVariableValue, right: VnVariableValue) => left > right
const greaterThanEqual = (left: VnVariableValue, right: VnVariableValue) => left >= right

const operators: Record<string, Operator> = {
  "==": equal,
  eq: equal,
  "!=": notEqual,
  neq: notEqual,
  "<": lessThan,
  lt: lessThan,
  "<=": lessThanEqual,
  lte: lessThanEqual,
  ">": greaterThan,
  gt: greaterThan,
  ">=": greaterThanEqual,
  gte: greaterThanEqual,
}

export const parseBooleanExpression = (obj: unknown, location: SourceLocation): BooleanExpression | ParserError => {
  let left, operator, right
  if (Array.isArray(obj)) {
    if (obj.length !== 3) {
      return new ParserError("Boolean expression seq must have 3 items", location, ErrorLevel.WARNING)
    }
    if (!isVnVariableValue(obj[0])) {
      return new ParserError("Left operand must be a string, number or boolean", location, ErrorLevel.WARNING)
    } else {
      left = new ValueExpression(obj[0])
    }
    if (typeof obj[1] !== "string") {
      return new ParserError("Operator must be a string", location, ErrorLevel.WARNING)
    } else {
      operator = obj[1]
    }
    if (!isVnVariableValue(obj[2])) {
      return new ParserError("Right operand must be a string, number or boolean", location, ErrorLevel.WARNING)
    } else {
      right = new ValueExpression(obj[2])
    }

    if (operator in operators) {
      const operatorFn = operators[operator]
      return new BinaryExpression(location, operatorFn, left, right)
    }
    return new ParserError(`Unrecognized operand ${operator}`, location, ErrorLevel.WARNING)
  }
  return new ParserError("Invalid boolean expression", location, ErrorLevel.WARNING)
}
