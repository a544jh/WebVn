import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AppShell } from "../../src/AppShell"
import { SCENE_HEIGHT, SCENE_WIDTH, clearSaves, releaseStoredEditorLock, settle, waitFor } from "../helpers/vnHarness"
import { createProject } from "../../src/storage/projectStore"
import { takeProjectLock } from "../../src/storage/projectLock"
import { clearOpfsStore } from "../helpers/opfs"
import { fakeNavigation, FakeNavigation } from "../helpers/navigation"

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
  // This suite's own id, not everything: localStorage is origin-wide and a blanket clear takes out
  // the saves of whatever suite is running beside this one.
  clearSaves(DIRECTORY)
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

// The address bar the shell in the test is driving. A fake rather than the real one: this suite runs
// in a page whose URL belongs to vitest, and pushing onto it would be writing into the runner's own.
let navigation: FakeNavigation

const newShell = (url: string | null = null): AppShell => {
  navigation = fakeNavigation(url)
  shell = new AppShell(elements, { onOpen: () => undefined, onClose: () => undefined, navigation })
  return shell
}

const backgroundCanvas = (): HTMLCanvasElement | null => elements.vnDiv.querySelector("#vn-background-renderer")

// A session is set on the shell *before* its buffers are filled, so "getSession() !== null" is not
// the same question as "the project is open" - a test that advances the story or reads the stage has
// to wait for the story itself.
const storyLoaded = (shell: AppShell): boolean => (shell.getSession()?.player.state.commandIndex ?? 0) > 0

// The centre pixel as RGBA. **Alpha is the one that says whether anything was drawn**: an untouched
// canvas reads as fully transparent [0,0,0,0], which is not white and is easy to mistake for a
// painted black.
const pixel = (): number[] => {
  const canvas = backgroundCanvas()
  if (canvas === null) return [0, 0, 0, 0]
  const ctx = canvas.getContext("2d")
  if (ctx === null) throw new Error("no 2d context")
  return [...ctx.getImageData(SCENE_WIDTH / 2, SCENE_HEIGHT / 2, 1, 1).data]
}

const pickerRows = (): HTMLButtonElement[] =>
  [...elements.pickerDiv.querySelectorAll(".vn-picker-open")] as HTMLButtonElement[]

const refusalText = (): string | null => elements.pickerDiv.querySelector(".vn-picker-refusal")?.textContent ?? null

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
  // **Before the close, and before the next `beforeEach` clears the store.** A rename keeps working
  // after the test that started it returns - the test waits for the part it asserts on, and the copy
  // and the delete come after - so the tree is not cleared out from under work still moving files
  // in it. Correct ordering on its own terms, not a fix for anything: see the same note in
  // RenameProject.test.ts.
  await shell?.settled()
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
    await shell.start()

    pickerRows()[0].click()
    await waitFor("the story to be loaded", () => storyLoaded(shell))

    expect(backgroundCanvas()?.width).toBe(SCENE_WIDTH)
    expect(backgroundCanvas()?.height).toBe(SCENE_HEIGHT)
  })

  it("paints the background it was given", async () => {
    // The same thing said end to end, because a canvas of the right size is not yet a painted one.
    const shell = newShell()
    await shell.start()

    pickerRows()[0].click()
    // Waiting for the canvas to stop being blank rather than for a length of time. An unanimated
    // background render reports finished before it paints - ROUGH_EDGES.md has that, and it is not
    // this suite's - so there is no earlier signal to take. Not circular: this waits for *any* paint
    // and then asserts which colour, so a background painted wrong still fails.
    // Waiting for the colour itself, because there is no honest signal that arrives before it: an
    // unanimated background render reports finished before it paints (ROUGH_EDGES.md, and not this
    // suite's), an untouched canvas reads transparent, and a canvas mid-render reads white. A wrong
    // colour still fails - as a timeout naming the one it wanted - and the assertion below is what
    // says so when it is right.
    await waitFor("the background to be painted #123456", () => pixel().join() === [0x12, 0x34, 0x56, 255].join())

    expect(pixel().slice(0, 3)).toEqual([0x12, 0x34, 0x56])
  })

  it("lays the stage out again on a second open, not only the first", async () => {
    const shell = newShell()
    await shell.start()
    pickerRows()[0].click()
    await waitFor("the story to be loaded", () => storyLoaded(shell))

    await shell.backToProjects()
    expect(elements.sessionDiv.hidden).toBe(true)
    pickerRows()[0].click()
    await waitFor("the story to be loaded", () => storyLoaded(shell))

    expect(backgroundCanvas()?.width).toBe(SCENE_WIDTH)
  })

  it("shows the session while a project is open and the picker when it is not", async () => {
    const shell = newShell()
    await shell.start()
    expect(elements.pickerDiv.hidden).toBe(false)
    expect(elements.sessionDiv.hidden).toBe(true)

    pickerRows()[0].click()
    await waitFor("the story to be loaded", () => storyLoaded(shell))
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
    await shell.start()
    pickerRows()[0].click()
    // The banner, not `pickerDiv.hidden`: the picker is already showing when the click lands, and
    // the session is only revealed for the instant the boot takes to be refused - so that flag is
    // true again before a poll can see it, and waiting on it waits for nothing.
    await waitFor("the refusal banner", () => elements.pickerDiv.querySelector(".vn-picker-refusal") !== null)

    expect(elements.pickerDiv.hidden).toBe(false)
    expect(elements.sessionDiv.hidden).toBe(true)
    expect(elements.pickerDiv.querySelector(".vn-picker-refusal")?.textContent).toContain("another tab")
    expect(shell.getSession()).toBe(null)
    await held.release()
  })

  it("does nothing on a Back to projects with no project open", async () => {
    const shell = newShell()
    await shell.start()

    await shell.backToProjects()
    await settle()

    expect(elements.pickerDiv.hidden).toBe(false)
  })
})

// `?project=<directory>`, and the three ways a directory arrives: the first load reads it, the
// picker writes it, and back and forward move it. The address bar itself is a fake - see
// test/helpers/navigation.ts for why - so what is covered here is every decision the shell makes
// about it, and not `browserNavigation`, which has none.
describe("the picker's own work takes a turn in the queue", () => {
  it("holds a navigation until the work is done, rather than swapping the view out from under it", async () => {
    // The property the picker's import, export and delete all rest on. Without it an import outlives
    // the view that started it: a Back closes the picker mid-write, the picker rebuilt on the way
    // back knows nothing about it, and the result is reported to a stopped view - and opening the row
    // the import is rewriting refuses the author with "already open in another tab", about their own
    // tab.
    const shell = newShell()
    await shell.start()

    let release = (): void => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    let finished = false
    void shell.inTurn(async () => {
      await held
      finished = true
    })

    navigation.go(DIRECTORY)
    await settle()

    expect(shell.getSession()).toBeNull()
    expect(elements.pickerDiv.hidden).toBe(false)

    release()
    await waitFor("the navigation to take its turn", () => shell.getSession() !== null)
    expect(finished).toBe(true)
  })
})

describe("the open project in the URL", () => {
  it("opens what the URL names, without the author picking it", async () => {
    // The whole point of the ticket: a reload lands back in the project rather than at the front
    // door. `start()` is what src/index.ts calls, so this is the boot that ships.
    const shell = newShell(DIRECTORY)
    await shell.start()
    await waitFor("the story to be loaded", () => storyLoaded(shell))

    expect(shell.getSession()?.directory).toBe(DIRECTORY)
    expect(elements.sessionDiv.hidden).toBe(false)
    // The stage was laid out, which is the hazard this whole suite exists for: a boot that skips the
    // picker still has to reveal the session before the renderer measures it.
    expect(backgroundCanvas()?.width).toBe(SCENE_WIDTH)
  })

  it("enters the picker on a bare URL, which is still the front door", async () => {
    const shell = newShell()
    await shell.start()

    expect(shell.getSession()).toBe(null)
    expect(elements.pickerDiv.hidden).toBe(false)
    expect(pickerRows().length).toBe(1)
  })

  it("records the project the author opened, and the picker they went back to", async () => {
    const shell = newShell()
    await shell.start()

    pickerRows()[0].click()
    await waitFor("the story to be loaded", () => storyLoaded(shell))
    expect(navigation.current()).toBe(DIRECTORY)

    await shell.backToProjects()
    expect(navigation.current()).toBe(null)
    // Two entries, so Back walks the views the author walked rather than leaving the app.
    expect(navigation.pushed).toEqual([DIRECTORY, null])
  })

  it("puts the project down when the browser goes back to the picker", async () => {
    const shell = newShell()
    await shell.start()
    pickerRows()[0].click()
    await waitFor("the story to be loaded", () => storyLoaded(shell))

    navigation.go(null)
    await waitFor("the picker", () => shell.getSession() === null && elements.pickerDiv.hidden === false)

    expect(elements.sessionDiv.hidden).toBe(true)
    // Closed, not merely hidden: the lock is the thing a second tab is waiting on, and a session
    // that only stopped being drawn would hold it forever.
    const lock = await takeProjectLock(DIRECTORY)
    expect(lock).not.toBe(null)
    await lock?.release()
  })

  it("does not push an entry for a navigation it is reacting to", async () => {
    // The reason the author's own gestures and `goTo` are separate methods. A push from inside the
    // popstate handler would mint an entry for the move the browser just made, and Back would need
    // pressing twice to get anywhere.
    const shell = newShell()
    await shell.start()
    pickerRows()[0].click()
    await waitFor("the story to be loaded", () => storyLoaded(shell))

    navigation.go(null)
    await waitFor("the picker", () => shell.getSession() === null)

    expect(navigation.pushed).toEqual([DIRECTORY])
  })

  it("opens the project again when the browser goes forward to it", async () => {
    const shell = newShell()
    await shell.start()
    pickerRows()[0].click()
    await waitFor("the story to be loaded", () => storyLoaded(shell))
    navigation.go(null)
    await waitFor("the picker", () => shell.getSession() === null && pickerRows().length === 1)

    navigation.go(DIRECTORY)
    await waitFor("the story to be loaded again", () => storyLoaded(shell))

    expect(shell.getSession()?.directory).toBe(DIRECTORY)
    expect(backgroundCanvas()?.width).toBe(SCENE_WIDTH)
  })

  it("collapses a back-and-forward burst instead of closing and reopening", async () => {
    // Held Back, or Back and Forward in one gesture. Each queued swap reads the address bar when
    // its turn comes rather than what it said when it fired, so both of these read the same final
    // URL: the first finds the session already matches and the second has nothing left to do. The
    // author's project is never torn down for a round trip they undid before it started.
    const shell = newShell()
    await shell.start()
    pickerRows()[0].click()
    await waitFor("the story to be loaded", () => storyLoaded(shell))
    const before = shell.getSession()

    navigation.go(null)
    navigation.go(DIRECTORY)
    await settle()

    // The same session, not a rebuilt one - and the stage it was already showing.
    expect(shell.getSession()).toBe(before)
    expect(elements.sessionDiv.hidden).toBe(false)
    expect(backgroundCanvas()?.width).toBe(SCENE_WIDTH)
    expect(navigation.current()).toBe(DIRECTORY)
  })

  it("says so and clears the URL when the link names no project", async () => {
    // A bookmark to a project that has since been deleted. Without the boot's own check this threw
    // out of `readProject` and the entry point said "Something went wrong opening your project".
    const shell = newShell("a-project-that-was-deleted")
    await shell.start()
    await waitFor("the refusal banner", () => refusalText() !== null)

    expect(refusalText()).toContain("a-project-that-was-deleted")
    expect(shell.getSession()).toBe(null)
    expect(elements.pickerDiv.hidden).toBe(false)
    // Replaced with the bare URL, so the view and the address bar agree and a reload does not repeat
    // the failure. Replaced rather than pushed: the author did not navigate anywhere.
    expect(navigation.current()).toBe(null)
    expect(navigation.pushed).toEqual([])
  })

  it("says so and clears the URL when the link names a project another tab holds", async () => {
    const held = await takeProjectLock(DIRECTORY)
    if (held === null) throw new Error("the lock was already held before the test started")

    const shell = newShell(DIRECTORY)
    await shell.start()
    await waitFor("the refusal banner", () => refusalText() !== null)

    expect(refusalText()).toContain("another tab")
    expect(shell.getSession()).toBe(null)
    expect(navigation.current()).toBe(null)
    await held.release()
  })

  it("leaves a project that would not open holding nothing", async () => {
    // The boot takes the lock before it can know whether the directory is a project at all, so a
    // refusal on that count has to give it back - or the next tab, and the next boot in this one,
    // waits on a lock nobody is using.
    const shell = newShell("a-project-that-was-deleted")
    await shell.start()
    await waitFor("the refusal banner", () => refusalText() !== null)

    const lock = await takeProjectLock("a-project-that-was-deleted")
    expect(lock).not.toBe(null)
    await lock?.release()
  })
})
