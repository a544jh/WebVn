import { beforeEach, describe, expect, it } from "vitest"
import { demoManifest } from "../../src/demoStory"
import { bootEditor, BootedEditor } from "../../src/editorBoot"
import { ProjectPicker } from "../../src/picker/picker"
import { takeProjectLock } from "../../src/storage/projectLock"
import { createProject, listProjects, readEditorState, readProject } from "../../src/storage/projectStore"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
import { createVnRoot, nextStop, releaseStoredEditorLock, settle, sleep, typeCharacter } from "../helpers/vnHarness"
import { writeFile } from "../../src/storage/opfs"

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-project-picker"

// The front door. What it lists, what it opens, and what it does when it cannot open something.

const manifestFor = (id: string, title: string): string => `formatVersion: 1\nid: ${id}\ntitle: ${title}\n`

const SCRIPT = "story:\n  - A line\n"

const make = (id: string, title: string): Promise<void> =>
  createProject(id, { manifestText: manifestFor(id, title), scriptText: SCRIPT })

let pickerRoot: HTMLDivElement
let opened: string[]

// The picker asks a host to open a project and is told whether it worked. These tests mostly stand
// in for that host; the round trip below is the one that uses the real boot.
let refuseWith: string | null = null

const newPicker = (): ProjectPicker =>
  new ProjectPicker(pickerRoot, async (directory) => {
    opened.push(directory)
    await settle()
    return refuseWith
  })

const rows = (): HTMLButtonElement[] => [...pickerRoot.querySelectorAll(".vn-picker-open")] as HTMLButtonElement[]

const rowTitles = (): string[] => rows().map((row) => row.querySelector(".vn-picker-title")?.textContent ?? "")

const rowDirectories = (): string[] => rows().map((row) => row.dataset.vnProject ?? "")

const demoButton = (): HTMLButtonElement | null => pickerRoot.querySelector(".vn-picker-demo")

const refusalText = (): string | null => pickerRoot.querySelector(".vn-picker-refusal")?.textContent ?? null

beforeEach(async () => {
  await releaseStoredEditorLock()
  await clearOpfsStore(SCRATCH)
  document.body.innerHTML = ""
  pickerRoot = document.createElement("div")
  document.body.appendChild(pickerRoot)
  opened = []
  refuseWith = null
})

describe("the picker's list", () => {
  it("lists every project the store enumerates, by title", async () => {
    await make("a-story", "A Story")
    await make("b-story", "B Story")

    await newPicker().render()

    expect(rowTitles()).toEqual(["A Story", "B Story"])
  })

  it("puts the last opened project first", async () => {
    await make("a-story", "A Story")
    await make("b-story", "B Story")
    await make("c-story", "C Story")
    // Written by the boot, not by the picker - but the picker is what it is for.
    const booted = await bootEditor({ vnDiv: createVnRoot(), vnEditorDiv: document.createElement("div") }, "c-story")
    if (booted.kind === "refused") throw new Error(booted.reason)
    await booted.close()
    document.body.appendChild(pickerRoot)

    await newPicker().render()

    expect(rowDirectories()).toEqual(["c-story", "a-story", "b-story"])
  })

  it("lists a project whose manifest does not parse, under its directory name", async () => {
    // The state the store deliberately keeps listable: it is an author's project with a typo in it,
    // and this is the one place they would go to open it and fix it.
    await createProject("broken-story", { manifestText: "formatVersion: 1\nid: [unclosed\n", scriptText: SCRIPT })

    await newPicker().render()

    expect(rowTitles()).toEqual(["broken-story"])
    expect(pickerRoot.querySelector(".vn-picker-unparsed")?.textContent).toContain("does not parse")
    rows()[0].click()
    await settle()
    expect(opened).toEqual(["broken-story"])
  })

  it("walks the store again on every render rather than remembering what it found", async () => {
    // Enumeration is the truth about what exists, and there is no index file, ever.
    const picker = newPicker()
    await picker.render()
    expect(rows()).toHaveLength(0)

    await make("late-story", "Late Story")
    await picker.render()

    expect(rowTitles()).toEqual(["Late Story"])
  })
})

describe("opening a project from the picker", () => {
  it("hands the host the directory that was clicked", async () => {
    await make("a-story", "A Story")
    await newPicker().render()

    rows()[0].click()
    await settle()

    expect(opened).toEqual(["a-story"])
  })

  it("keeps the author on the list when the project is open in another tab, and says which", async () => {
    await make("a-story", "A Story")
    refuseWith = `"a-story" is already open in another tab. Close it and reload this one.`
    await newPicker().render()

    rows()[0].click()
    // The host is asked asynchronously and the banner is drawn by the render that follows it.
    await sleep(300)

    expect(refusalText()).toContain("a-story")
    expect(refusalText()).toContain("another tab")
    // Still a place they can stay: the list is under the banner, and nothing was lost.
    expect(rowTitles()).toEqual(["A Story"])
  })
})

describe("adding the demo", () => {
  it("offers the demo on an empty library and writes it where the author can see it arrive", async () => {
    const picker = newPicker()
    await picker.render()
    expect(pickerRoot.querySelector(".vn-picker-empty")).not.toBe(null)
    expect(demoButton()).not.toBe(null)

    demoButton()?.click()
    await sleep(500)

    expect((await listProjects()).map((project) => project.id)).toEqual([demoManifest.id])
    expect((await readProject(demoManifest.id)).scriptText).toContain("This is WebVn")
    expect(rowTitles()).toEqual([demoManifest.title])
    // It stays on the picker: the row appearing and the button going is the confirmation.
    expect(opened).toEqual([])
    expect(demoButton()).toBe(null)
  })

  it("hides itself while the demo is listed", async () => {
    await make(demoManifest.id, "Already here")

    await newPicker().render()

    expect(demoButton()).toBe(null)
  })

  it("writes nothing while another tab holds the demo", async () => {
    const held = await takeProjectLock(demoManifest.id)
    if (held === null) throw new Error("the demo lock was already held before the test started")
    await newPicker().render()

    demoButton()?.click()
    await sleep(300)

    expect(refusalText()).toContain("another tab")
    expect(await listProjects()).toEqual([])
    await held.release()
  })
})

describe("leaving the picker", () => {
  it("does nothing once it has been stopped", async () => {
    await make("a-story", "A Story")
    const picker = newPicker()
    await picker.render()
    const row = rows()[0]

    picker.stop()
    expect(pickerRoot.children).toHaveLength(0)

    // The element is detached, but a click on it is exactly what a superseded view answering its old
    // listeners looks like.
    row.click()
    await settle()
    expect(opened).toEqual([])

    // And a render that was already in flight paints nothing over whatever replaced it.
    await picker.render()
    expect(pickerRoot.children).toHaveLength(0)
  })
})

describe("what the picker says about storage", () => {
  it("reports what the browser has actually promised", async () => {
    await newPicker().render()

    const line = pickerRoot.querySelector(".vn-picker-storage") as HTMLElement
    expect(line.dataset.vnPersisted).toBe(String(await navigator.storage.persisted()))
  })
})

// The round trip the host performs, with the real boot underneath it: pick, open, type, come back.
describe("picker to editor and back", () => {
  it("opens a project, closes it on the way back, and lists it first", async () => {
    await make("a-story", "A Story")
    await make("b-story", "B Story")

    const vnDiv = createVnRoot()
    const vnEditorDiv = document.createElement("div")
    document.body.append(pickerRoot, vnEditorDiv)

    let session: BootedEditor | null = null
    const picker = new ProjectPicker(pickerRoot, async (directory) => {
      const booted = await bootEditor({ vnDiv, vnEditorDiv }, directory)
      if (booted.kind === "refused") return booted.reason
      session = booted
      const firstStop = nextStop(booted.renderer, booted.player)
      await booted.openProject()
      await firstStop
      return null
    })

    await picker.render()
    rows()[1].click()
    await sleep(300)
    const booted = session as BootedEditor | null
    if (booted === null) throw new Error("the picker did not open a project")
    expect(booted.directory).toBe("b-story")

    // Typed and left straight away, without waiting out the debounce: close is what makes that safe.
    typeCharacter({ editorRoot: vnEditorDiv }, "  - Typed before going back\n")
    picker.stop()
    await booted.close()

    expect((await readProject("b-story")).scriptText).toContain("Typed before going back")
    expect((await readEditorState()).lastOpened).toBe("b-story")
    // The lock is let go on the way out, so the same project can be opened again.
    const again = await takeProjectLock("b-story")
    expect(again).not.toBe(null)
    await again?.release()

    const returning = newPicker()
    await returning.render()
    expect(rowDirectories()).toEqual(["b-story", "a-story"])
  })
})

// A directory with no manifest is not a project, so it is not listed - the sweep that removes one is
// a later ticket's, and until then it is invisible rather than shown as a broken row.
describe("what is not a project", () => {
  it("does not list a directory with no manifest", async () => {
    await make("a-story", "A Story")
    const dir = await storeRoot(SCRATCH)
    await writeFile(dir, "projects/half-a-rename/script.yaml", SCRIPT)

    await newPicker().render()

    expect(rowDirectories()).toEqual(["a-story"])
  })
})
