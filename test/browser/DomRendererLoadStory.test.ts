import { describe, expect, it } from "vitest"
import { VnPlayer } from "../../src/core/player"
import { DomRenderer } from "../../src/domRenderer/DomRenderer"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import { createVnRoot, freshState, nextStop, settle, textBoxText } from "../helpers/vnHarness"

const parse = (script: string) => {
  const [state, errors] = YamlParser.updateState(script, freshState())
  expect(errors).toEqual([])
  return state
}

const first = `
story:
  - First story, first line
  - First story, second line
`

const second = `
story:
  - Second story, first line
  - Second story, second line
`

describe("DomRenderer.loadStory", () => {
  it("plays nothing until it is handed a story, even when the player already holds one", async () => {
    const root = createVnRoot()
    // The player is built around the story here, which is the one arrangement where a renderer that
    // booted itself would look correct. It still must not: an entry point that loads its script
    // asynchronously puts the story in afterwards, and a boot already in flight then walks a story
    // it was never given, stepping commands nobody asked for.
    const player = new VnPlayer(parse(first))
    new DomRenderer(root, player)
    await settle()

    expect(player.state.commandIndex).toBe(0)
    expect(textBoxText(root)).toBe(null)
  })

  it("plays a story handed over after the renderer was built", async () => {
    const root = createVnRoot()
    const player = new VnPlayer(freshState())
    const renderer = new DomRenderer(root, player)

    // The standalone player gunzips the script out of the URL first, so its story lands a few
    // microtasks after the renderer exists rather than before it.
    await settle()
    const stop = nextStop(renderer, player)
    renderer.loadStory(parse(first), false)
    await stop

    expect(textBoxText(root)).toBe("First story, first line")
  })

  it("lets a second story supersede a boot that is still running", async () => {
    const root = createVnRoot()
    const player = new VnPlayer(freshState())
    const renderer = new DomRenderer(root, player)

    renderer.loadStory(parse(first), true)
    const stop = nextStop(renderer, player)
    renderer.loadStory(parse(second), false)
    await stop
    await settle()

    // The superseded boot must not advance the story that replaced it.
    expect(textBoxText(root)).toBe("Second story, first line")
    expect(player.state.commandIndex).toBe(1)
  })
})

// The reason the boot renders every frame instead of jumping to the first stop: an animated boot is
// what plays an intro. The player wants that, the editor does not - reloading a script while writing
// should land on the first stop, not replay the opening every time.
describe("loadStory animate flag", () => {
  const intro = `
story:
  - A line long enough that typing it out takes a visible moment
`

  it("plays the boot out when animating", async () => {
    const root = createVnRoot()
    const player = new VnPlayer(freshState())
    const renderer = new DomRenderer(root, player)

    const stop = nextStop(renderer, player)
    renderer.loadStory(parse(intro), true)

    await settle()
    expect(textBoxText(root)).not.toBe("A line long enough that typing it out takes a visible moment")

    await stop
    expect(textBoxText(root)).toBe("A line long enough that typing it out takes a visible moment")
  })

  it("lands on the first stop immediately when not animating", async () => {
    const root = createVnRoot()
    const player = new VnPlayer(freshState())
    const renderer = new DomRenderer(root, player)

    renderer.loadStory(parse(intro), false)

    await settle()
    expect(textBoxText(root)).toBe("A line long enough that typing it out takes a visible moment")
  })
})
