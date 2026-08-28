import { describe, expect, it } from "vitest"
import { seedState } from "../../src/core/manifest"
import { TEST_MANIFEST } from "../helpers/testManifest"
import { VnPlayer } from "../../src/core/player"
import { YamlParser } from "../../src/yamlParser/YamlParser"

// Seen marks are global and permanent - across undo, save slots and replays - because they are what
// skip mode reads. Every seedState call mints its own ConsecutiveIntegerSet, so what used to keep
// them alive across a reparse (one shared mutable instance, spread from state to state) is gone and
// VnPlayer carries them by hand. Nothing else covers reloadStory: no test mounts a VnEditor, and the
// demo suite's seen-command assertions go through the constructor's save data instead.

const manifest = { ...TEST_MANIFEST, actors: { A1: { name: "Actor" } } }

const script = `
story:
  - one
  - two
  - three
  - four
`

const parse = (): ReturnType<typeof YamlParser.parseStory>[0] => {
  const [state, errors] = YamlParser.parseStory(script, manifest)
  expect(errors).toEqual([])
  return state
}

// The boot both entry points do: a player seeded from the manifest, handed the parsed story, and
// run to its first stop (the renderer's run, which is not a recorded advance).
const startPlayer = (): VnPlayer => {
  const player = new VnPlayer(seedState(manifest))
  player.loadState(parse())
  while (!player.state.stopAfterRender) player.advance()
  return player
}

// One user press of "advance", plus the automatic run to the next stop.
const press = (player: VnPlayer): void => {
  player.advance()
  while (!player.state.stopAfterRender) player.advance()
}

describe("seen commands", () => {
  it("keeps the marks when the script is reparsed", () => {
    const player = startPlayer()
    press(player)
    press(player)

    player.reloadStory(parse())

    expect(player.state.seenCommands.contains(0)).toBe(true)
    expect(player.state.seenCommands.contains(1)).toBe(true)
    expect(player.state.seenCommands.contains(2)).toBe(true)
    expect(player.state.seenCommands.contains(3)).toBe(false)
  })

  it("keeps marks the reparsed path no longer replays over", () => {
    const player = startPlayer()
    press(player)
    press(player)
    // Undone, so the path replayed on reload no longer reaches these commands. Only a set carried
    // over from the old state still knows they were read.
    player.undo()
    player.undo()
    expect(player.state.commandIndex).toBe(1)

    player.reloadStory(parse())

    expect(player.state.commandIndex).toBe(1)
    expect(player.state.seenCommands.contains(1)).toBe(true)
    expect(player.state.seenCommands.contains(2)).toBe(true)
  })

  it("gives a fresh player on the same manifest an empty set", () => {
    const played = startPlayer()
    press(played)
    press(played)
    expect(played.state.seenCommands.contains(1)).toBe(true)

    const fresh = new VnPlayer(seedState(manifest))

    expect(fresh.state.seenCommands.contains(0)).toBe(false)
    expect(fresh.state.seenCommands.toJSON()).toEqual([])
  })
})
