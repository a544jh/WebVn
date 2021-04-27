import { VnPlayerState, VnVariableValue } from "../../state"
import { ErrorLevel, ParserError, SourceLocation, tsHasOwnProperty } from "../Parser"
import { isVnVariableValue, ValueExpression } from "./variables"

export abstract class BooleanExpression {
  constructor(private location: SourceLocation) {}
  abstract evaluate(state: VnPlayerState): boolean
}

class SingleValueExpression extends BooleanExpression {
  constructor(location: SourceLocation, private value: ValueExpression) {
    super(location)
  }

  public evaluate(state: VnPlayerState): boolean {
    return !!this.value.evaluate(state)
  }
}

class BinaryExpression extends BooleanExpression {
  constructor(
    location: SourceLocation,
    private operator: Operator,
    private left: ValueExpression,
    private right: ValueExpression
  ) {
    super(location)
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
  constructor(location: SourceLocation, private expr: BooleanExpression) {
    super(location)
  }

  public evaluate(state: VnPlayerState) {
    return !this.expr.evaluate(state)
  }
}

class And extends BooleanExpression {
  constructor(location: SourceLocation, private exprs: BooleanExpression[]) {
    super(location)
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
  constructor(location: SourceLocation, private exprs: BooleanExpression[]) {
    super(location)
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
