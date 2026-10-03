import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  advanceVn,
  clickGutter,
  editorTab,
  markedLines,
  startEditor,
  StartedEditor,
  textBoxText,
  typeScript,
  waitFor,
} from "../helpers/vnHarness"

// A story that loops, met in the editor: the stage shows its Story error and the gutter says where;
// an edit that puts a loop on the author's path no longer throws; and a replay jump the loop keeps
// from its target is refused rather than adopting ten thousand advances. Ticket
// .scratch/stage-dialogs/issues/02.

const manifest = `
formatVersion: 1
id: editor-loops
title: Editor Loops
`

const RED = "rgb(255, 0, 0)"
const ORANGE = "rgb(255, 165, 0)"

beforeEach(() => {
  // the loop guard tells the author in the console too
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

const storyError = (started: StartedEditor): Element | null => started.root.querySelector(".vn-stage-dialog")

const tabLevel = (started: StartedEditor): string | null => {
  const classes = editorTab(started.editorRoot, "script").classList
  if (classes.contains("vn-editor-tab-error")) return "error"
  if (classes.contains("vn-editor-tab-warning")) return "warning"
  return null
}

describe("a loop with nothing to stop on, played in the editor", () => {
  // line 1 is the blank line the template literal opens with
  const looping = `
story:
  - one
  - label: loop
  - jump: loop
`

  it("marks the jump that sends the story round, and turns the script tab red", async () => {
    const started = await startEditor(manifest, looping)
    started.renderer.advance()
    await waitFor("the Story error", () => storyError(started) !== null)

    expect(markedLines(started.editorRoot)).toEqual([
      {
        line: 5,
        message: "This jump goes round a loop with nothing to stop on, so the story cannot continue",
        color: RED,
      },
    ])
    expect(tabLevel(started)).toBe("error")
  })

  it("takes the error and the marker away once the script is fixed", async () => {
    const started = await startEditor(manifest, looping)
    started.renderer.advance()
    await waitFor("the Story error", () => storyError(started) !== null)

    typeScript(started, "\nstory:\n  - one\n  - two\n")
    clickGutter(started, 4)

    expect(storyError(started)).toBeNull()
    expect(markedLines(started.editorRoot)).toEqual([])
    expect(tabLevel(started)).toBeNull()
    expect(textBoxText(started.root)).toBe("two")
  })
})

describe("an edit that puts a loop on the author's path", () => {
  // Reloading replays the path the author has walked against the edited script. That replay used to
  // throw out of the gutter click when the edit put a loop on the way, leaving the editor half-updated.
  it("keeps the author's place up to the loop rather than throwing", async () => {
    const started = await startEditor(manifest, "\nstory:\n  - one\n  - two\n  - three\n")
    await advanceVn(started)
    await advanceVn(started)
    expect(textBoxText(started.root)).toBe("three")

    // "two" becomes a loop; the click lands on "one", the line before it
    typeScript(started, "\nstory:\n  - one\n  - label: loop\n  - jump: loop\n")
    clickGutter(started, 3)

    expect(textBoxText(started.root)).toBe("one")
    expect(storyError(started)).toBeNull()
  })
})

describe("a replay jump the story loops before reaching", () => {
  // Two stops in the loop, so the index alternates and never repeats: the walk used to spin to its
  // cap and return as though it had arrived, with ten thousand advances in the path.
  const script = `
story:
  - label: top
  - one
  - two
  - jump: top
  - never
`

  it("is refused, leaves the player where it was, and says why against the line", async () => {
    const started = await startEditor(manifest, script)
    const [state, path] = [started.player.state, started.player.path]

    clickGutter(started, 7)

    expect(started.player.state).toBe(state)
    expect(started.player.path).toBe(path)
    expect(textBoxText(started.root)).toBe("one")
    expect(markedLines(started.editorRoot)).toEqual([
      {
        line: 7,
        message:
          "A replay never reaches this line: the story goes round a loop on the way. A direct jump still goes here",
        color: ORANGE,
      },
    ])
    expect(tabLevel(started)).toBe("warning")
  })

  it("still goes there as a direct jump, which does not replay", async () => {
    const started = await startEditor(manifest, script)
    started.editor.setJumpMode("direct")

    clickGutter(started, 7)

    expect(textBoxText(started.root)).toBe("never")
    expect(markedLines(started.editorRoot)).toEqual([])
  })
})
