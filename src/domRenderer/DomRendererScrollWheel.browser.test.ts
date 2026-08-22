import { beforeEach, describe, expect, it } from "vitest"
import { initialState, VnPlayer } from "../core/player"
import { YamlParser } from "../yamlParser/YamlParser"
import { DomRenderer } from "./DomRenderer"
import { pauseMenu } from "./menus/PauseMenu"
import { saveMenu } from "./menus/SaveLoadMenu"

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

// Returns false when the handler called preventDefault, i.e. when the VN claimed the gesture.
const wheel = (target: Element, deltaY: number, deltaMode = 0): boolean =>
  target.dispatchEvent(new WheelEvent("wheel", { deltaY, deltaMode, bubbles: true, cancelable: true }))

const NOTCH = 100

// Long enough for a render that should not happen to have happened.
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe("DomRenderer scroll wheel", () => {
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

  it("does not scroll forward into text that has not been seen yet", async () => {
    // still cancelled: the VN owns the wheel even when it has nowhere to go, so a page
    // hosting it (the editor) does not scroll out from under the reader
    expect(wheel(root, NOTCH)).toBe(false)
    await settle()

    expect(textBoxText(root)).toBe("First line")
    expect(player.state.commandIndex).toBe(1)
  })

  it("scrolls back with undo and forward again through seen text", async () => {
    for (const line of ["Second line", "Third line"]) {
      const stop = nextStop(renderer, player)
      renderer.advance()
      await stop
      expect(textBoxText(root)).toBe(line)
    }

    for (const line of ["Second line", "First line"]) {
      const stop = nextStop(renderer, player)
      wheel(root, -NOTCH)
      await stop
      expect(textBoxText(root)).toBe(line)
    }

    for (const line of ["Second line", "Third line"]) {
      const stop = nextStop(renderer, player)
      wheel(root, NOTCH)
      await stop
      expect(textBoxText(root)).toBe(line)
    }

    // the end of the story is the edge of what has been seen
    wheel(root, NOTCH)
    await settle()
    expect(textBoxText(root)).toBe("Third line")
  })

  it("takes a burst of small trackpad deltas as one step, and resets on a direction change", async () => {
    const stop = nextStop(renderer, player)
    renderer.advance()
    await stop
    expect(textBoxText(root)).toBe("Second line")

    // a quarter of a notch at a time - nothing until they add up
    for (let i = 0; i < 3; i++) {
      wheel(root, -NOTCH / 4)
    }
    await settle()
    expect(textBoxText(root)).toBe("Second line")

    const undone = nextStop(renderer, player)
    wheel(root, -NOTCH / 4)
    await undone
    expect(textBoxText(root)).toBe("First line")

    // deltas left over from a gesture in the other direction do not count towards this one
    wheel(root, -NOTCH / 2)
    const forward = nextStop(renderer, player)
    wheel(root, NOTCH)
    await forward
    expect(textBoxText(root)).toBe("Second line")
  })

  it("takes one line-mode event as a whole step regardless of its magnitude", async () => {
    const stop = nextStop(renderer, player)
    renderer.advance()
    await stop

    const undone = nextStop(renderer, player)
    wheel(root, -3, WheelEvent.DOM_DELTA_LINE)
    await undone
    expect(textBoxText(root)).toBe("First line")
  })

  it("steps no story while a menu is open, and still swallows the wheel", async () => {
    const stop = nextStop(renderer, player)
    renderer.advance()
    await stop
    expect(textBoxText(root)).toBe("Second line")

    renderer.showMenu(pauseMenu)
    // cancelled even though the VN does nothing with it: nothing in the pause menu scrolls,
    // and the page hosting the VN must not scroll out from under the menu either
    expect(wheel(root, -NOTCH)).toBe(false)
    expect(wheel(root, NOTCH)).toBe(false)
    await settle()
    expect(textBoxText(root)).toBe("Second line")

    renderer.closeMenu()
    const undone = nextStop(renderer, player)
    wheel(root, -NOTCH)
    await undone
    expect(textBoxText(root)).toBe("First line")
  })

  it("leaves the wheel to a save list that can still scroll, and swallows it at either end", async () => {
    for (let slot = 0; slot < 10; slot++) {
      renderer.saveToSlot(slot)
    }
    renderer.showMenu(saveMenu)

    const list = root.querySelector(".vn-saves-container") as HTMLDivElement
    const scrollableHeight = list.scrollHeight - list.clientHeight
    expect(scrollableHeight).toBeGreaterThan(0)

    // at the top of the list only the downward gesture is the list's to use
    expect(wheel(list, -NOTCH)).toBe(false)
    expect(wheel(list, NOTCH)).toBe(true)

    list.scrollTop = scrollableHeight
    expect(wheel(list, NOTCH)).toBe(false)
    expect(wheel(list, -NOTCH)).toBe(true)

    // the wheel over the rest of the menu is swallowed wherever the list happens to sit
    expect(wheel(root.querySelector(".vn-save-return") as HTMLDivElement, -NOTCH)).toBe(false)
  })
})
