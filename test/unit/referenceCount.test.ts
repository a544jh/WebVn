import { describe, expect, it } from "vitest"
// Every command registers its handler as a side effect of being imported, and `player.ts` is what
// imports them all - without it the parser recognises nothing and every line is a warning.
import "../../src/core/player"
import { referenceCount } from "../../src/core/commands/references"
import { NoOp } from "../../src/core/commands/NoOp"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import { VnManifest } from "../../src/core/manifest"

// How much of the script is about to stop drawing, which is what the remove confirmation says out
// loud. docs/adr/0006: the author decides with the number in front of them rather than after.
//
// **No `bg` in here, and that is not an oversight.** Its schema's `transition` is a `z.enum` over
// whatever `registerTransition` has registered, and the transitions live in
// `src/domRenderer/bgTransitions/` - so in node there are none and every `bg` line is a warning.
// Nothing about this function is per-kind beyond `sameReference`, which `audio` and `sprite`
// exercise between them.

const MANIFEST: VnManifest = {
  id: "reference-count",
  title: "Reference Count",
  actors: { A1: { sprites: { idle: "idle.png", worried: "worried.png" } }, A2: { sprites: { idle: "idle.png" } } },
  backgrounds: { cliffs: "cliffs.png" },
  audioAssets: { waves: { file: "waves.ogg" }, hum: { file: "hum.ogg" } },
}

const storyOf = (script: string) => {
  const [state, errors] = YamlParser.parseStory(script, MANIFEST)
  expect(errors).toEqual([])
  return state
}

describe("referenceCount", () => {
  it("counts the lines that name an audio track", () => {
    const state = storyOf(`
story:
  - bgm: waves
  - A line.
  - bgm: hum
  - bgm: waves
`)
    expect(referenceCount(state.commands, { kind: "audio", id: "waves" })).toBe(2)
    expect(referenceCount(state.commands, { kind: "audio", id: "hum" })).toBe(1)
  })

  it("counts nothing for an id nothing names", () => {
    const state = storyOf("story:\n  - A line.\n")
    expect(referenceCount(state.commands, { kind: "background", id: "cliffs" })).toBe(0)
  })

  // An audio id and a background id may be the same word and mean different assets.
  it("counts only the kind it was asked about", () => {
    const state = storyOf("story:\n  - bgm: waves\n")
    expect(referenceCount(state.commands, { kind: "audio", id: "waves" })).toBe(1)
    expect(referenceCount(state.commands, { kind: "background", id: "waves" })).toBe(0)
  })

  // Two actors may declare the same sprite name, and only one of them is being removed.
  it("counts a sprite against its own actor", () => {
    const state = storyOf(`
story:
  - show:
      actor: A1
      sprite: idle
`)
    expect(referenceCount(state.commands, { kind: "sprite", actor: "A1", id: "idle" })).toBe(1)
    expect(referenceCount(state.commands, { kind: "sprite", actor: "A2", id: "idle" })).toBe(0)
  })

  // What an author counts is places in their script, not commands: a multi-line command that names
  // an id is one line to go and look at.
  it("counts a multi-line command once", () => {
    const state = storyOf(`
story:
  - bgm:
      audio: waves
      loop: false
`)
    expect(referenceCount(state.commands, { kind: "audio", id: "waves" })).toBe(1)
  })

  // A command that also named an id nobody declared was neutralized - and it is still a line that
  // will stop drawing, which is what `NoOp` carrying the command it replaced is for.
  it("counts a neutralized command by what it replaced", () => {
    const [state] = YamlParser.parseStory(
      `
story:
  - show:
      actor: A1
      sprite: nothing-declares-this
`,
      MANIFEST
    )
    expect(state.commands[0]).toBeInstanceOf(NoOp)
    expect(referenceCount(state.commands, { kind: "actor", id: "A1" })).toBe(1)
  })
})
