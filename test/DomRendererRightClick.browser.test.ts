import { beforeEach, describe, expect, it } from "vitest"
import { VnPlayer } from "../src/core/player"
import { DomRenderer } from "../src/domRenderer/DomRenderer"
import { saveMenu } from "../src/domRenderer/menus/SaveLoadMenu"
import { nextStop, settle, startVn, textBoxText } from "./helpers/vnHarness"

const script = `
story:
  - First line
  - Second line
`

// Returns false when the handler called preventDefault, i.e. when the VN claimed the click and
// the browser's own context menu stays away.
const rightClick = (target: Element): boolean =>
  target.dispatchEvent(new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true }))

// What a long press looks like: a pointerdown, then the contextmenu it turns into half a
// second later. Chromium gives that event a pointerType of its own; not every browser does,
// hence both halves.
const longPress = (target: Element, pointerType: string): boolean => {
  target.dispatchEvent(new PointerEvent("pointerdown", { pointerType, bubbles: true, cancelable: true }))
  return target.dispatchEvent(new PointerEvent("contextmenu", { pointerType, bubbles: true, cancelable: true }))
}

const pauseMenuIsUp = (root: HTMLDivElement): boolean => root.querySelector(".vn-pause-menu-container") !== null

describe("DomRenderer right click", () => {
  let root: HTMLDivElement
  let player: VnPlayer
  let renderer: DomRenderer

  beforeEach(async () => {
    ;({ root, player, renderer } = await startVn(script))
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

  it("leaves a long press on a touchscreen to the platform", async () => {
    // not cancelled either: on touch the VN is not in this gesture at all
    expect(longPress(root, "touch")).toBe(true)

    expect(renderer.isMenuOpen()).toBe(false)
    await settle()
    expect(textBoxText(root)).toBe("First line")
  })

  it("still opens on a mouse, and on a contextmenu event carrying no pointer type of its own", async () => {
    // a touch that came before must not disarm the mouse
    longPress(root, "touch")

    root.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", button: 2, bubbles: true }))
    expect(rightClick(root)).toBe(false)
    expect(pauseMenuIsUp(root)).toBe(true)
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
