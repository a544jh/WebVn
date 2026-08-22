import { beforeEach, describe, expect, it } from "vitest"
import { initialState, VnPlayer } from "../core/player"
import { YamlParser } from "../yamlParser/YamlParser"
import { DomRenderer } from "./DomRenderer"
import { saveMenu } from "./menus/SaveLoadMenu"

const script = `
story:
  - First line
  - Second line
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

// Returns false when the handler called preventDefault, i.e. when the VN claimed the click and
// the browser's own context menu stays away.
const rightClick = (target: Element): boolean =>
  target.dispatchEvent(new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true }))

const pauseMenuIsUp = (root: HTMLDivElement): boolean => root.querySelector(".vn-pause-menu-container") !== null

// Long enough for a render that should not happen to have happened.
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe("DomRenderer right click", () => {
  let root: HTMLDivElement
  let player: VnPlayer
  let renderer: DomRenderer

  beforeEach(async () => {
    localStorage.clear()
    document.body.innerHTML = ""
    root = document.createElement("div")
    root.id = "vn-div"
    root.style.width = "1280px"
    root.style.height = "720px"
    document.body.appendChild(root)

    const [state, errors] = YamlParser.updateState(script, initialState)
    expect(errors).toEqual([])
    player = new VnPlayer(state)
    renderer = new DomRenderer(root, player)
    await nextStop(renderer, player)
  })

  it("opens the pause menu instead of the browser's context menu", async () => {
    expect(rightClick(root)).toBe(false)

    expect(renderer.isMenuOpen()).toBe(true)
    expect(pauseMenuIsUp(root)).toBe(true)
  })

  it("does not advance the story", async () => {
    rightClick(root)
    await settle()

    expect(textBoxText(root)).toBe("First line")
    expect(player.state.commandIndex).toBe(1)
  })

  it("closes whichever menu is open, and stays off the browser's context menu there too", async () => {
    renderer.showMenu(saveMenu)

    expect(rightClick(root.querySelector(".vn-menu-container") as Element)).toBe(false)
    expect(renderer.isMenuOpen()).toBe(false)

    // and opens it again from the top, not back at the save menu
    rightClick(root)
    expect(pauseMenuIsUp(root)).toBe(true)
  })

  it("takes over from skip mode, like the menu button does", async () => {
    // skip mode only runs through text that has been seen, so read ahead and come back
    const stop = nextStop(renderer, player)
    renderer.advance()
    await stop
    const undone = nextStop(renderer, player)
    renderer.undo()
    await undone
    expect(textBoxText(root)).toBe("First line")

    renderer.enterSkipMode()
    expect(renderer.skipMode).toBe(true)

    rightClick(root)
    expect(renderer.skipMode).toBe(false)

    // nothing is skipped behind the open menu
    const line = textBoxText(root)
    await settle()
    expect(textBoxText(root)).toBe(line)
  })
})
