import { VnPlayerState, VnVariableValue } from "../../state"
import { ErrorLevel, ParserError, SourceLocation, tsHasOwnProperty } from "../Parser"
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
      if (state.variables[identifier] === undefined) {
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

class SingleValueExpression extends BooleanExpression {
  private value: ValueExpression
  constructor(location: SourceLocation, value: ValueExpression) {
    super(location)
    this.value = value
  }

  public evaluate(state: VnPlayerState): boolean {
    return !!this.value.evaluate(state)
  }
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

class Not extends BooleanExpression {
  private expr: BooleanExpression
  constructor(location: SourceLocation, expr: BooleanExpression) {
    super(location)
    this.expr = expr
  }

  public evaluate(state: VnPlayerState) {
    return !this.expr.evaluate(state)
  }
}

class And extends BooleanExpression {
  private exprs: BooleanExpression[]
  constructor(location: SourceLocation, exprs: BooleanExpression[]) {
    super(location)
    this.exprs = exprs
  }

  public evaluate(state: VnPlayerState) {
    for (const expr of this.exprs) {
      if (expr.evaluate(state) === false) {
        return false
      }
    }
    return true
  }
}

class Or extends BooleanExpression {
  private exprs: BooleanExpression[]
  constructor(location: SourceLocation, exprs: BooleanExpression[]) {
    super(location)
    this.exprs = exprs
  }

  public evaluate(state: VnPlayerState) {
    for (const expr of this.exprs) {
      if (expr.evaluate(state) === true) {
        return true
      }
    }
    return false
  }
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

  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    return new SingleValueExpression(location, new ValueExpression(obj))
  }

  let val = getSingleKeyedObjValue(obj, "not")
  if (val !== null) {
    const res = parseBooleanExpression(val, location)
    if (res instanceof ParserError) return res
    return new Not(location, res)
  }
  val = getSingleKeyedObjValue(obj, "and")
  if (val !== null) {
    const res = getBoolExprList(val, location)
    if (res instanceof ParserError) return res
    return new And(location, res)
  }
  val = getSingleKeyedObjValue(obj, "or")
  if (val !== null) {
    const res = getBoolExprList(val, location)
    if (res instanceof ParserError) return res
    return new Or(location, res)
  }

  return new ParserError("Invalid boolean expression", location, ErrorLevel.WARNING)
}

function getSingleKeyedObjValue(obj: unknown, key: string): unknown | null {
  if (tsHasOwnProperty(obj, key)) {
    return obj[key]
  }
  return null
}

function getBoolExprList(obj: unknown, location: SourceLocation): BooleanExpression[] | ParserError {
  const list: BooleanExpression[] = []
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = parseBooleanExpression(item, location)
      if (result instanceof ParserError) return result
      list.push(result)
    }
  }
  return list
}
