import { beforeEach, describe, expect, it } from "vitest"
import { initialState, VnPlayer } from "../core/player"
import { YamlParser } from "../yamlParser/YamlParser"
import { DomRenderer } from "./DomRenderer"
import { pauseMenu } from "./menus/PauseMenu"

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
const wheel = (root: HTMLDivElement, deltaY: number, deltaMode = 0): boolean =>
  root.dispatchEvent(new WheelEvent("wheel", { deltaY, deltaMode, bubbles: true, cancelable: true }))

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

  it("is disabled while a menu is open, leaving the wheel to the menu", async () => {
    const stop = nextStop(renderer, player)
    renderer.advance()
    await stop
    expect(textBoxText(root)).toBe("Second line")

    renderer.showMenu(pauseMenu)
    // not cancelled: the save list scrolls with the wheel, so the menu must keep the default
    expect(wheel(root, -NOTCH)).toBe(true)
    expect(wheel(root, NOTCH)).toBe(true)
    await settle()
    expect(textBoxText(root)).toBe("Second line")

    renderer.closeMenu()
    const undone = nextStop(renderer, player)
    wheel(root, -NOTCH)
    await undone
    expect(textBoxText(root)).toBe("First line")
  })
})
