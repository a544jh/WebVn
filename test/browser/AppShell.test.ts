import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AppShell } from "../../src/appShell"
import { SCENE_HEIGHT, SCENE_WIDTH, releaseStoredEditorLock, settle, sleep } from "../helpers/vnHarness"
import { createProject } from "../../src/storage/projectStore"
import { takeProjectLock } from "../../src/storage/projectLock"
import { clearOpfsStore } from "../helpers/opfs"

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-app-shell"

// The swap between the picker and a project's session, over the markup src/index.html actually
// ships - **including its `hidden`**, which is the whole reason this suite exists.
//
// Nothing tested this before: the swap lived in src/index.ts, which self-boots on import and looks
// its elements up by id, so no suite could reach it. That gap shipped a stage with no background and
// every sprite in the wrong place, because the renderer was built into a hidden subtree and measured
// zero. Every other browser suite mounts through `createVnRoot`, straight onto a visible body, so
// none of them can see it.

const DIRECTORY = "shell-test-story"

const MANIFEST = `formatVersion: 1
id: ${DIRECTORY}
title: Shell Test
`

// A colour rather than a file: `#rrggbb` is an engine-level reserved form the manifest never
// declares, so this needs no asset written and still exercises the whole background path onto the
// canvas - which is the element that comes out 0x0 when the stage is measured while hidden.
const SCRIPT = `story:
  - bg:
      image: "#123456"
      transition: fade
      duration: 0
  - A line
`

let elements: {
  pickerDiv: HTMLDivElement
  sessionDiv: HTMLDivElement
  vnDiv: HTMLDivElement
  vnEditorDiv: HTMLDivElement
}

// The shape src/index.html has: a picker div, and a session div that starts `hidden` with the stage
// and the editor inside it.
const mountPage = (): void => {
  localStorage.clear()
  document.body.innerHTML = ""

  const pickerDiv = document.createElement("div")
  const sessionDiv = document.createElement("div")
  sessionDiv.hidden = true

  const vnDiv = document.createElement("div")
  vnDiv.id = "vn-div"
  vnDiv.style.width = `${SCENE_WIDTH}px`
  vnDiv.style.height = `${SCENE_HEIGHT}px`

  const vnEditorDiv = document.createElement("div")
  sessionDiv.append(vnDiv, vnEditorDiv)
  document.body.append(pickerDiv, sessionDiv)

  elements = { pickerDiv, sessionDiv, vnDiv, vnEditorDiv }
}

const newShell = (): AppShell => {
  shell = new AppShell(elements, { onOpen: () => undefined, onClose: () => undefined })
  return shell
}

const backgroundCanvas = (): HTMLCanvasElement =>
  elements.vnDiv.querySelector("#vn-background-renderer") as HTMLCanvasElement

const pickerRows = (): HTMLButtonElement[] =>
  [...elements.pickerDiv.querySelectorAll(".vn-picker-open")] as HTMLButtonElement[]

// The shell each test built, so a failing assertion cannot leave a project locked and take every
// test after it down with it.
let shell: AppShell | null = null

beforeEach(async () => {
  await releaseStoredEditorLock()
  await clearOpfsStore(SCRATCH)
  await createProject(DIRECTORY, { manifestText: MANIFEST, scriptText: SCRIPT })
  mountPage()
})

afterEach(async () => {
  await shell?.getSession()?.close()
  shell = null
})

describe("swapping between the picker and a project", () => {
  it("builds the renderer into a laid-out stage, so the scene has a size", async () => {
    // The regression. A renderer constructed inside a `hidden` subtree reads zero for every
    // measurement its sub-renderers take in their constructors: the background canvas comes out 0x0
    // and never paints, and the scene size sprites and freeform text are positioned against is zero.
    // Nothing throws and nothing is logged - it is only visible on screen.
    const shell = newShell()
    await shell.showPicker()

    pickerRows()[0].click()
    await sleep(400)

    expect(backgroundCanvas().width).toBe(SCENE_WIDTH)
    expect(backgroundCanvas().height).toBe(SCENE_HEIGHT)
  })

  it("paints the background it was given", async () => {
    // The same thing said end to end, because a canvas of the right size is not yet a painted one.
    const shell = newShell()
    await shell.showPicker()

    pickerRows()[0].click()
    await sleep(400)

    const ctx = backgroundCanvas().getContext("2d")
    if (ctx === null) throw new Error("no 2d context")
    const painted = [...ctx.getImageData(SCENE_WIDTH / 2, SCENE_HEIGHT / 2, 1, 1).data].slice(0, 3)
    expect(painted).toEqual([0x12, 0x34, 0x56])
  })

  it("lays the stage out again on a second open, not only the first", async () => {
    const shell = newShell()
    await shell.showPicker()
    pickerRows()[0].click()
    await sleep(400)

    await shell.backToProjects()
    expect(elements.sessionDiv.hidden).toBe(true)
    pickerRows()[0].click()
    await sleep(400)

    expect(backgroundCanvas().width).toBe(SCENE_WIDTH)
  })

  it("shows the session while a project is open and the picker when it is not", async () => {
    const shell = newShell()
    await shell.showPicker()
    expect(elements.pickerDiv.hidden).toBe(false)
    expect(elements.sessionDiv.hidden).toBe(true)

    pickerRows()[0].click()
    await sleep(400)
    expect(elements.pickerDiv.hidden).toBe(true)
    expect(elements.sessionDiv.hidden).toBe(false)

    await shell.backToProjects()
    expect(elements.pickerDiv.hidden).toBe(false)
    expect(elements.sessionDiv.hidden).toBe(true)
  })

  it("puts the author back on the picker when the project is open in another tab", async () => {
    // Revealing before the boot means a refusal has to put the page back, which is a thing that can
    // be got wrong on its own.
    const held = await takeProjectLock(DIRECTORY)
    if (held === null) throw new Error("the lock was already held before the test started")

    const shell = newShell()
    await shell.showPicker()
    pickerRows()[0].click()
    await sleep(300)

    expect(elements.pickerDiv.hidden).toBe(false)
    expect(elements.sessionDiv.hidden).toBe(true)
    expect(elements.pickerDiv.querySelector(".vn-picker-refusal")?.textContent).toContain("another tab")
    expect(shell.getSession()).toBe(null)
    await held.release()
  })

  it("does nothing on a Back to projects with no project open", async () => {
    const shell = newShell()
    await shell.showPicker()

    await shell.backToProjects()
    await settle()

    expect(elements.pickerDiv.hidden).toBe(false)
  })
})
