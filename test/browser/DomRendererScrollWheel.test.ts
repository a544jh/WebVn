import { beforeEach, describe, expect, it } from "vitest"
import { VnPlayer } from "../../src/core/player"
import { DomRenderer } from "../../src/domRenderer/DomRenderer"
import { pauseMenu } from "../../src/domRenderer/menus/PauseMenu"
import { saveMenu } from "../../src/domRenderer/menus/SaveLoadMenu"
import {
  blurEditor,
  nextStop,
  settle,
  startEditor,
  StartedEditor,
  startVn,
  textBoxText,
  typeScript,
} from "../helpers/vnHarness"

const script = `
story:
  - First line
  - Second line
  - Third line
`

// Returns false when the handler called preventDefault, i.e. when the VN claimed the gesture.
const wheel = (target: Element, deltaY: number, deltaMode = 0): boolean =>
  target.dispatchEvent(new WheelEvent("wheel", { deltaY, deltaMode, bubbles: true, cancelable: true }))

const NOTCH = 100

describe("DomRenderer scroll wheel", () => {
  let root: HTMLDivElement
  let player: VnPlayer
  let renderer: DomRenderer

  beforeEach(async () => {
    ;({ root, player, renderer } = await startVn(script))
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

// The gesture that used to crash: an author breaks the script, the preview reloads onto a story with
// almost nothing left in it, and the wheel is rolled up and down over it. `seenCommands` is carried
// across the reload, so it still holds indices the shortened story does not have, and the skip the
// wheel asks for used to be granted at the end of it. Each grant recorded an advance the story could
// not walk; scrolling back up then replayed one and threw "path does not match the story".
describe("the wheel over a script edited shorter", () => {
  const manifest = `
formatVersion: 1
id: wheel-test
title: A Test Story
`

  const broken = `
story:
  - "First line"
  -- Hello, This is WebVn - A fast visual novel engine for the modern web.
  - "Third line"
`

  // Read to the end, so every command is marked seen, and then broken. The blur is what reparses,
  // and the reload leaves a one-command story with the old story's marks still on it.
  const brokenAfterReading = async (): Promise<StartedEditor> => {
    const vn = await startEditor(manifest, script)
    for (let i = 0; i < 2; i++) {
      const stop = nextStop(vn.renderer, vn.player)
      vn.renderer.advance()
      await stop
    }
    expect(textBoxText(vn.root)).toBe("Third line")

    typeScript(vn, broken)
    await blurEditor(vn)
    expect(vn.player.state.commands).toHaveLength(1)
    expect(vn.player.state.seenCommands.contains(1)).toBe(true)
    return vn
  }

  it("steps nothing forward, however many notches it is given", async () => {
    const vn = await brokenAfterReading()
    const at = vn.player.state.commandIndex

    for (let i = 0; i < 5; i++) {
      wheel(vn.root, NOTCH)
      await settle()
    }

    expect(vn.player.state.commandIndex).toBe(at)
    // and nothing was written down that a replay would then be asked to walk
    expect(vn.player.path.toShorthandPath()).toEqual([0])
  })

  it("scrolls back up over what it scrolled down through", async () => {
    const vn = await brokenAfterReading()

    // Down more than once before coming back up, which is what "rapidly" meant: undo pops one step,
    // so a single stray one was survivable and the second was the one that threw.
    for (let i = 0; i < 3; i++) {
      wheel(vn.root, NOTCH)
      await settle()
    }
    wheel(vn.root, -NOTCH)
    await settle()

    expect(vn.player.path.toShorthandPath()).toEqual([0])
    expect(vn.player.state.commandIndex).toBe(1)
    expect(textBoxText(vn.root)).toBe("First line")
  })
})
