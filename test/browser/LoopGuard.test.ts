import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TEST_MANIFEST } from "../helpers/testManifest"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import {
  advanceVn,
  createVnRoot,
  mountVn,
  settle,
  startVn,
  StartedVn,
  textBoxText,
  waitFor,
} from "../helpers/vnHarness"

// The loop guard: a story that goes round a `label`/`jump` pair with nothing to stop on. It used to
// `alert()` - which leaves fullscreen - and throw; it is now the stage's own "Story error", with a way
// out. .scratch/stage-dialogs/issues/01, drawn on the design canvas's Stage page.

const script = `
story:
  - one
  - two
  - label: loop
  - jump: loop
`

const realAlert = window.alert
beforeEach(() => {
  window.alert = () => {
    throw new Error("window.alert was called - the stage shows its own errors")
  }
  // the guard also tells the author, in the console, where the story went round
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  window.alert = realAlert
  vi.restoreAllMocks()
})

const storyError = (root: HTMLDivElement): HTMLDivElement | null =>
  [...root.querySelectorAll<HTMLDivElement>(".vn-stage-dialog")].find(
    (dialog) => dialog.querySelector(".vn-stage-dialog-title")?.textContent === "Story error"
  ) ?? null

const answerButton = (root: HTMLDivElement, label: string): HTMLDivElement => {
  const button = [...root.querySelectorAll<HTMLDivElement>(".vn-stage-dialog-answer")].find(
    (elem) => elem.textContent === label
  )
  if (button === undefined) throw new Error(`no answer called ${label}`)
  return button
}

const rightClick = (target: Element): boolean =>
  target.dispatchEvent(new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true }))

// Plays to "two" and advances into the loop.
const intoTheLoop = async (): Promise<StartedVn> => {
  const started = await startVn(script, { actions: true })
  // to the stop rather than to the text: an advance while "two" is still typing out only finishes it
  await advanceVn(started)
  expect(textBoxText(started.root)).toBe("two")
  started.renderer.advance()
  await waitFor("the Story error", () => storyError(started.root) !== null)
  return started
}

describe("the loop guard", () => {
  it("shows a Story error on the stage, saying the story cannot continue", async () => {
    const started = await intoTheLoop()
    const error = storyError(started.root) as HTMLDivElement

    expect(error.querySelector(".vn-stage-dialog-line")?.textContent).toBe(
      "The script loops endlessly here, so the story cannot continue."
    )
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/loops endlessly.*on line \d+ of the script/))
  })

  // A tap would run the same loop another ten thousand times.
  it("takes no taps on the stage while it is up", async () => {
    const started = await intoTheLoop()
    const [state, path] = [started.player.state, started.player.path]

    // whatever a finger on the textbox would land on - under the error, that is the menu's dim
    const box = started.root.getBoundingClientRect()
    const tapped = document.elementFromPoint(box.left + 640, box.top + 640) as HTMLElement
    expect(started.root.contains(tapped)).toBe(true)
    tapped.click()
    await settle()

    expect(storyError(started.root)).not.toBeNull()
    expect(started.player.state).toBe(state)
    expect(started.player.path).toBe(path)
  })

  // Closing it would leave a stage that cannot move.
  it("is not closed by a right-click", async () => {
    const started = await intoTheLoop()
    expect(rightClick(started.root)).toBe(false)
    expect(storyError(started.root)).not.toBeNull()
  })

  it("goes back to the line last read on Go back", async () => {
    const started = await intoTheLoop()

    answerButton(started.root, "Go back").click()
    await waitFor("the error to close", () => storyError(started.root) === null)

    expect(started.renderer.isMenuOpen()).toBe(false)
    expect(textBoxText(started.root)).toBe("two")
    expect(started.player.state.stopAfterRender).toBe(true)
  })

  it("plays the story from the top on Start over", async () => {
    const started = await intoTheLoop()

    answerButton(started.root, "Start over").click()
    await waitFor("the story to start over", () => textBoxText(started.root) === "one")

    expect(storyError(started.root)).toBeNull()
    expect(started.player.path.getActions()).toEqual([])
  })

  // Go back marks nothing new, but the loop's commands were all applied on the way round, so the line
  // after "two" counts as read and Skip lights up - the likeliest next tap.
  it("is shown the same way when skip mode walks into the loop", async () => {
    const started = await intoTheLoop()
    answerButton(started.root, "Go back").click()
    await waitFor("the error to close", () => storyError(started.root) === null)

    started.renderer.enterSkipMode()
    await waitFor("the Story error from skip mode", () => storyError(started.root) !== null)
    expect(started.renderer.skipMode).toBe(false)

    // the walk that gave up never moved the player, so Go back has nowhere further to go
    answerButton(started.root, "Go back").click()
    await waitFor("the error to close", () => storyError(started.root) === null)
    expect(textBoxText(started.root)).toBe("two")
  })

  it("is shown the same way when the scroll wheel walks into the loop", async () => {
    const started = await intoTheLoop()
    answerButton(started.root, "Go back").click()
    await waitFor("the error to close", () => storyError(started.root) === null)

    started.root.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }))
    await waitFor("the Story error from the wheel", () => storyError(started.root) !== null)
  })

  // Undoing an empty path replays from the top, which is the loop again.
  it("greys out Go back when the loop comes before the first stop", async () => {
    const root = createVnRoot({ actions: true })
    const [state] = YamlParser.parseStory("story:\n  - label: loop\n  - jump: loop\n  - never\n", TEST_MANIFEST)
    const mounted = mountVn(root, state)
    await waitFor("the Story error", () => storyError(root) !== null)

    const goBack = answerButton(root, "Go back")
    expect(goBack.getAttribute("aria-disabled")).toBe("true")
    goBack.click()
    await settle()
    expect(storyError(root)).not.toBeNull()
    expect(mounted.player.path.getActions()).toEqual([])
  })

  // The editor reloads the story when the author fixes the script, and that reload renders.
  it("goes when anything renders a new frame", async () => {
    const started = await intoTheLoop()
    const [fixed] = YamlParser.parseStory("story:\n  - one\n  - two\n  - three\n", TEST_MANIFEST)

    started.player.reloadStory(fixed)
    started.renderer.render(false)

    expect(storyError(started.root)).toBeNull()
    expect(started.renderer.isMenuOpen()).toBe(false)
  })
})
