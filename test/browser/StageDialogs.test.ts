import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadSaveData } from "../../src/core/save"
import { loadMenu, saveMenu } from "../../src/domRenderer/menus/SaveLoadMenu"
import { TEST_MANIFEST } from "../helpers/testManifest"
import { advanceVn, startVn, StartedVn, textBoxText } from "../helpers/vnHarness"
import { YamlParser } from "../../src/yamlParser/YamlParser"

// The Save and Load menus ask their questions on the stage, and a save that will not load says so.
// .scratch/stage-dialogs/issues/01, drawn on the design canvas's Stage page.

const script = `
story:
  - s1
  - s2
  - s3
  - s4
`

// Fifty advances into a four-line story: a save made against a longer script than this one.
const INCOMPATIBLE = { timestamp: Date.UTC(2026, 9, 1, 21, 17, 5), path: [50] }

// Every browser dialog the menus used to ask through, made to fail loudly if anything still does.
const realConfirm = window.confirm
const realAlert = window.alert
beforeEach(() => {
  window.confirm = () => {
    throw new Error("window.confirm was called - the stage asks its own questions")
  }
  window.alert = () => {
    throw new Error("window.alert was called - the stage shows its own errors")
  }
})
afterEach(() => {
  window.confirm = realConfirm
  window.alert = realAlert
})

const rows = (root: HTMLDivElement): HTMLDivElement[] => [
  ...root.querySelectorAll<HTMLDivElement>(".vn-saves-container .vn-save-item:not(.vn-save-new)"),
]
const dialog = (root: HTMLDivElement): HTMLDivElement | null => root.querySelector(".vn-stage-dialog")
const dialogTitle = (root: HTMLDivElement): string | null =>
  root.querySelector(".vn-stage-dialog-title")?.textContent ?? null
const dialogText = (root: HTMLDivElement): string => root.querySelector(".vn-stage-dialog-text")?.textContent ?? ""

// Answers resolve through a promise, so what an answer does lands a microtask after the click.
const answer = async (root: HTMLDivElement, label: string): Promise<void> => {
  const button = [...root.querySelectorAll<HTMLDivElement>(".vn-stage-dialog-answer")].find(
    (elem) => elem.textContent === label
  )
  if (button === undefined) throw new Error(`no answer called ${label}`)
  button.click()
  await Promise.resolve()
}

const rightClick = (target: Element): boolean =>
  target.dispatchEvent(new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true }))

// Plays to s3, saves it in slot 0, and goes back to s1, so loading slot 0 is a visible move.
const savedOnS3 = async (): Promise<StartedVn> => {
  const started = await startVn(script)
  await advanceVn(started)
  await advanceVn(started)
  started.renderer.saveToSlot(0)
  started.renderer.undo()
  started.renderer.undo()
  expect(textBoxText(started.root)).toBe("s1")
  return started
}

describe("the Load menu", () => {
  it("draws a save that will not load inert, with a note saying why", async () => {
    const started = await savedOnS3()
    started.player.saves.push(INCOMPATIBLE)
    started.renderer.showMenu(loadMenu)

    const [fits, dead] = rows(started.root)
    expect(fits.classList.contains("vn-save-item-incompatible")).toBe(false)
    expect(fits.querySelector(".vn-save-note")).toBeNull()
    expect(dead.classList.contains("vn-save-item-inert")).toBe(true)
    // not a button at all, rather than a disabled one, which would disable its live delete with it
    expect(dead.getAttribute("role")).toBeNull()
    expect(dead.querySelector(".vn-save-del")?.getAttribute("role")).toBe("button")
    // innerText rather than textContent: the line break is a <br>, which textContent drops
    expect(dead.querySelector<HTMLDivElement>(".vn-save-note")?.innerText).toBe(
      "The story has changed since this save.\nIt cannot be loaded."
    )

    dead.click()
    await Promise.resolve()
    expect(dialog(started.root)).toBeNull()
  })

  it("keeps the delete live on a save that will not load", async () => {
    const started = await savedOnS3()
    started.player.saves.push(INCOMPATIBLE)
    started.renderer.showMenu(loadMenu)

    rows(started.root)[1].querySelector<HTMLDivElement>(".vn-save-del")?.click()
    expect(dialogTitle(started.root)).toBe("Delete this save?")
    // the slot is repeated with its note, since its row is hidden behind the question
    expect(dialogText(started.root)).toContain("It cannot be loaded.")

    await answer(started.root, "Delete")
    expect(started.player.saves).toHaveLength(1)
    expect(rows(started.root)).toHaveLength(1)
  })

  it("loads on Load", async () => {
    const started = await savedOnS3()
    started.renderer.showMenu(loadMenu)

    rows(started.root)[0].click()
    expect(dialogTitle(started.root)).toBe("Load this save?")
    expect(dialogText(started.root)).toContain("Unsaved progress will be lost.")

    await answer(started.root, "Load")
    expect(started.renderer.isMenuOpen()).toBe(false)
    expect(textBoxText(started.root)).toBe("s3")
  })

  it("does nothing on Cancel, and comes back to the list", async () => {
    const started = await savedOnS3()
    started.renderer.showMenu(loadMenu)
    const menu = started.root.querySelector(".vn-menu-container") as HTMLDivElement

    rows(started.root)[0].click()
    // the list is hidden rather than removed while the question is up, so it keeps its place
    expect(menu.classList.contains("vn-menu-with-dialog")).toBe(true)
    expect(rows(started.root)).toHaveLength(1)

    await answer(started.root, "Cancel")
    expect(dialog(started.root)).toBeNull()
    expect(menu.classList.contains("vn-menu-with-dialog")).toBe(false)
    expect(started.renderer.isMenuOpen()).toBe(true)
    expect(textBoxText(started.root)).toBe("s1")
  })

  // The answer a row was drawn with can go stale: in the editor, adopting the manifest and a gutter
  // click both reload the story under an open menu.
  it("marks a row whose save stopped fitting after the menu was drawn, and keeps the menu up", async () => {
    const started = await savedOnS3()
    started.renderer.showMenu(loadMenu)
    expect(rows(started.root)[0].classList.contains("vn-save-item-inert")).toBe(false)

    const [shorter] = YamlParser.parseStory("story:\n  - s1\n  - s2\n", TEST_MANIFEST)
    started.player.reloadStory(shorter)
    const [state, path] = [started.player.state, started.player.path]

    rows(started.root)[0].click()
    await answer(started.root, "Load")

    expect(started.renderer.isMenuOpen()).toBe(true)
    expect(rows(started.root)[0].classList.contains("vn-save-item-inert")).toBe(true)
    expect(started.player.state).toBe(state)
    expect(started.player.path).toBe(path)
  })

  it("backs out of the question on a right-click, then out of the menu on the next", async () => {
    const started = await savedOnS3()
    started.renderer.showMenu(loadMenu)
    rows(started.root)[0].click()

    expect(rightClick(started.root)).toBe(false)
    expect(dialog(started.root)).toBeNull()
    expect(started.renderer.isMenuOpen()).toBe(true)

    rightClick(started.root)
    expect(started.renderer.isMenuOpen()).toBe(false)
    expect(textBoxText(started.root)).toBe("s1")
  })
})

describe("the Save menu", () => {
  it("keeps a save that will not load live, with its note", async () => {
    const started = await savedOnS3()
    started.player.saves.push(INCOMPATIBLE)
    started.renderer.showMenu(saveMenu)

    const dead = rows(started.root)[1]
    expect(dead.classList.contains("vn-save-item-incompatible")).toBe(true)
    expect(dead.classList.contains("vn-save-item-inert")).toBe(false)
    expect(dead.querySelector(".vn-save-note")).not.toBeNull()

    dead.click()
    expect(dialogTitle(started.root)).toBe("Overwrite this save?")
    expect(dialogText(started.root)).toContain("It cannot be loaded.")
  })

  it("overwrites on Overwrite, and keeps the old save on Cancel", async () => {
    const started = await savedOnS3()
    const before = started.player.saves[0]
    started.renderer.showMenu(saveMenu)

    rows(started.root)[0].click()
    await answer(started.root, "Cancel")
    expect(started.player.saves[0]).toBe(before)

    rows(started.root)[0].click()
    await answer(started.root, "Overwrite")
    expect(started.renderer.isMenuOpen()).toBe(false)
    expect(started.player.saves[0]).not.toBe(before)
    expect(started.renderer.canLoadFromSlot(0)).toBe(true)
  })
})

describe("deleting a save", () => {
  // It used to wait for the next advance to reach localStorage, so a reader who deleted a slot and
  // closed the tab found it back.
  it("is stored at once, without an advance after it", async () => {
    const started = await savedOnS3()
    started.renderer.saveToSlot(1)
    expect(loadSaveData(TEST_MANIFEST.id)?.saves).toHaveLength(2)

    started.renderer.showMenu(loadMenu)
    rows(started.root)[0].querySelector<HTMLDivElement>(".vn-save-del")?.click()
    await answer(started.root, "Delete")

    expect(loadSaveData(TEST_MANIFEST.id)?.saves).toHaveLength(1)
  })

  it("keeps the save on Cancel", async () => {
    const started = await savedOnS3()
    started.renderer.showMenu(loadMenu)
    rows(started.root)[0].querySelector<HTMLDivElement>(".vn-save-del")?.click()
    await answer(started.root, "Cancel")

    expect(started.player.saves).toHaveLength(1)
    expect(rows(started.root)).toHaveLength(1)
  })
})
