import { describe, expect, it } from "vitest"
import { z } from "zod"
import { registerSchema } from "../../src/core/commands/backgrounds/Background"
import { Command } from "../../src/core/commands/Command"
import { NoOp } from "../../src/core/commands/NoOp"
import { ErrorLevel, ParserError } from "../../src/core/commands/Parser"
import { Say } from "../../src/core/commands/text/Say"
import { VnManifest } from "../../src/core/manifest"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import "../../src/core/player"

// An id the manifest does not answer is checkable by reading the two documents, so the parser
// reports it and replaces the command that named it with a no-op the story advances straight
// through - docs/adr/0004-an-undeclared-reference-neutralizes-its-command.md. The load-bearing
// property is that the command list keeps its length: every save is a path of indices into it.

// A `bg` does not parse until some transition is registered, and the transitions live in the
// renderer, which a node suite never loads. This is the call FadeTransition makes at import.
registerSchema("fade", z.unknown())

const MANIFEST: VnManifest = {
  id: "references",
  title: "References",
  actors: { A1: { name: "Actor", sprites: { idle: "idle.png" } } },
  backgrounds: { a: "a.png" },
  audioAssets: { theme: { file: "theme.ogg" } },
}

const parse = (script: string): [Command[], ParserError[]] => {
  const [state, errors] = YamlParser.parseStory(script, MANIFEST)
  return [state.commands, errors]
}

// Where a command's SourceLocation starts, which for a map is the line its key is on.
const lineOf = (script: string, needle: string): number =>
  script.split("\n").findIndex((line) => line.includes(needle)) + 1

const reported = (errors: ParserError[]): string[] => errors.map((e) => `L${e.location.startLine}: ${e.message}`)

describe("undeclared references", () => {
  const script = `
story:
  - A narrator line
  - bg:
      image: forset
      transition: fade
      duration: 0
  - bgm: anthem
  - sfx: thunk
  - show:
      actor: A1
      sprite: furious
  - Ghost: "who am I"
`

  it("reports each kind against the line that named it, at WARNING", () => {
    const [, errors] = parse(script)

    expect(reported(errors)).toEqual([
      `L${lineOf(script, "- bg:")}: No background is declared as forset`,
      `L${lineOf(script, "bgm: anthem")}: No audio asset is declared as anthem`,
      `L${lineOf(script, "sfx: thunk")}: No audio asset is declared as thunk`,
      `L${lineOf(script, "- show:")}: Actor A1 declares no sprite named furious`,
      `L${lineOf(script, "Ghost:")}: No actor is declared as Ghost`,
    ])
    expect(errors.every((e) => e.level === ErrorLevel.WARNING)).toBe(true)
  })

  it("replaces the command it warned about, keeping every later index where it was", () => {
    const [commands] = parse(script)

    expect(commands.length).toBe(6)
    expect(commands.map((c) => c instanceof NoOp)).toEqual([false, true, true, true, true, false])
  })

  it("still says a line spoken by an undeclared actor, since its text does not need the actor", () => {
    const [commands] = parse(script)

    expect(commands[5]).toBeInstanceOf(Say)
  })

  it("carries the command it replaced, so a stack trace still names it", () => {
    const [commands] = parse(script)

    expect((commands[1] as NoOp).replaced.getSourceLocation().startLine).toBe(lineOf(script, "- bg:"))
  })

  it("says only that the actor is undeclared, not that an actor nobody declared declares no sprites", () => {
    const [commands, errors] = parse(`
story:
  - show:
      actor: Ghost
      sprite: idle
`)

    expect(reported(errors)).toEqual(["L3: No actor is declared as Ghost"])
    expect(commands[0]).toBeInstanceOf(NoOp)
  })
})

describe("references the engine answers itself", () => {
  it("leaves a story naming only declared ids alone", () => {
    const [commands, errors] = parse(`
story:
  - A narrator line
  - bg:
      image: a
      transition: fade
      duration: 0
  - bgm: theme
  - sfx: theme
  - show:
      actor: A1
      sprite: idle
  - A1: "a line"
`)

    expect(errors).toEqual([])
    expect(commands.some((c) => c instanceof NoOp)).toBe(false)
  })

  it("does not read a colour as a background id, or `stop` as a track", () => {
    const [commands, errors] = parse(`
story:
  - bg:
      image: "#000000"
      transition: fade
      duration: 0
  - bgm: stop
  - bgm:
      audio: stop
      loop: false
`)

    expect(errors).toEqual([])
    expect(commands.some((c) => c instanceof NoOp)).toBe(false)
  })

  // The one spelling guaranteed not to work is not the one spelling that never warns: no manifest
  // can declare an audio asset as `stop`, and `sfx` has no stop handling the way `bgm` does.
  it("warns about `sfx: stop`, in the ordinary wording", () => {
    const [commands, errors] = parse(`
story:
  - sfx: stop
`)

    expect(reported(errors)).toEqual(["L3: No audio asset is declared as stop"])
    expect(commands[0]).toBeInstanceOf(NoOp)
  })
})
