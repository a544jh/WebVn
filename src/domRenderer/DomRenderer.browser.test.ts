import { beforeEach, describe, expect, it } from "vitest"
import { initialState, VnPlayer } from "../core/player"
import { YamlParser } from "../yamlParser/YamlParser"
import { DomRenderer } from "./DomRenderer"

const script = `
story:
  - First line
  - Second line
  - Third line
`

// Resolves the next time a render pass finishes with the player stopped (i.e. waiting for input).
const nextStop = (renderer: DomRenderer, player: VnPlayer): Promise<void> =>
  new Promise((resolve) => {
    const callback = () => {
      if (!player.state.stopAfterRender) return
      renderer.onFinishedCallbacks.splice(renderer.onFinishedCallbacks.indexOf(callback), 1)
      resolve()
    }
    renderer.onFinishedCallbacks.push(callback)
  })

const textBoxText = (root: HTMLDivElement): string | null => root.querySelector(".vn-adv-textbox")?.textContent ?? null

describe("DomRenderer smoke test", () => {
  let root: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ""
    root = document.createElement("div")
    root.id = "vn-div"
    root.style.width = "1280px"
    root.style.height = "720px"
    document.body.appendChild(root)
  })

  it("mounts, renders the first line and shows the next ones on advance()", async () => {
    const [state, errors] = YamlParser.updateState(script, initialState)
    expect(errors).toEqual([])

    const player = new VnPlayer(state)
    const renderer = new DomRenderer(root, player)
    const firstStop = nextStop(renderer, player)

    await firstStop
    expect(textBoxText(root)).toBe("First line")

    const secondStop = nextStop(renderer, player)
    renderer.advance()
    await secondStop
    expect(textBoxText(root)).toBe("Second line")

    const thirdStop = nextStop(renderer, player)
    renderer.advance()
    await thirdStop
    expect(textBoxText(root)).toBe("Third line")
  })
})
