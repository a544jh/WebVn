import { describe, expect, it } from "vitest"
import { Command } from "../../src/core/commands/Command"
import { ParserError } from "../../src/core/commands/Parser"
import { parseCommand } from "../helpers/commands"

function expectAccepted(name: string, obj: unknown): void {
  const result = parseCommand(name, obj)
  expect(result, `${name} should accept ${JSON.stringify(obj)}`).not.toBeInstanceOf(ParserError)
}

function expectRejected(name: string, obj: unknown): void {
  let result: Command | ParserError | undefined
  expect(() => (result = parseCommand(name, obj)), `${name} should not throw on ${JSON.stringify(obj)}`).not.toThrow()
  expect(result, `${name} should reject ${JSON.stringify(obj)}`).toBeInstanceOf(ParserError)
}

describe("hide", () => {
  it("accepts a sprite id", () => expectAccepted("hide", "A1"))
  it("rejects a non-string", () => expectRejected("hide", 1))
})

describe("show", () => {
  it("accepts actor and sprite", () => expectAccepted("show", { actor: "A1", sprite: "idle.png" }))
  it("accepts optional coordinates", () =>
    expectAccepted("show", { actor: "A1", sprite: "idle.png", x: 0.2, y: 0.3, anchorX: 0, anchorY: 1 }))
  it("rejects a missing sprite", () => expectRejected("show", { actor: "A1" }))
  it("rejects a non-numeric coordinate", () => expectRejected("show", { actor: "A1", sprite: "i.png", x: "left" }))
  it("rejects a non-map", () => expectRejected("show", "A1"))
})

describe("label", () => {
  it("accepts a name", () => expectAccepted("label", "loop"))
  it("rejects a non-string", () => expectRejected("label", ["loop"]))
})

describe("textbox", () => {
  it("accepts close", () => expectAccepted("textbox", "close"))
  it("accepts clear", () => expectAccepted("textbox", "clear"))
  it("rejects anything else", () => expectRejected("textbox", "open"))
})

describe("decision", () => {
  it("accepts single-keyed maps with jump labels", () =>
    expectAccepted("decision", [{ left: { jump: "L1" } }, { right: { jump: "L2" } }]))
  it("rejects a non-seq", () => expectRejected("decision", { left: { jump: "L1" } }))
  it("rejects a multi-keyed map", () => expectRejected("decision", [{ left: { jump: "L1" }, right: { jump: "L2" } }]))
  it("rejects a missing jump label", () => expectRejected("decision", [{ left: {} }]))
})

describe("jump", () => {
  it("accepts the string form", () => expectAccepted("jump", "loop"))
  it("accepts the conditional form", () => expectAccepted("jump", { to: "loop", if: ["$a", "==", 1] }))
  // Regression: z.unknown() is optional in zod, so a missing "if" once reached
  // parseBooleanExpression(undefined) and threw a TypeError out of the parser.
  it("rejects the map form without an if", () => expectRejected("jump", { to: "loop" }))
  it("rejects a null if", () => expectRejected("jump", { to: "loop", if: null }))
  it("rejects a missing to", () => expectRejected("jump", { if: ["$a", "==", 1] }))
})

describe("set", () => {
  it.each(["=", "+=", "-=", "*=", "/="])("accepts the %s operator", (op) => expectAccepted("set", ["$a", op, 1]))
  it("accepts string and boolean values", () => {
    expectAccepted("set", ["$a", "=", "text"])
    expectAccepted("set", ["$a", "=", true])
  })
  it("rejects an identifier without a dollar sign", () => expectRejected("set", ["a", "=", 1]))
  it("rejects an unknown operator", () => expectRejected("set", ["$a", "^=", 1]))
  it("rejects a wrong-length seq", () => expectRejected("set", ["$a", "="]))
  it("rejects a non-seq", () => expectRejected("set", "$a = 1"))
})
