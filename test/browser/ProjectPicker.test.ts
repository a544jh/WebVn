import { beforeEach, describe, expect, it } from "vitest"
import { demoManifest } from "../../src/demoStory"
import { bootEditor, BootedEditor } from "../../src/editorBoot"
import { ProjectPicker, RefusalNotice } from "../../src/picker/ProjectPicker"
import { takeProjectLock } from "../../src/storage/projectLock"
import {
  createProject,
  listProjects,
  readEditorState,
  readProject,
  writeEditorState,
} from "../../src/storage/projectStore"
import { manifestNaming } from "../helpers/testManifest"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
import {
  createVnRoot,
  nextStop,
  releaseStoredEditorLock,
  settle,
  sleep,
  typeCharacter,
  waitFor,
} from "../helpers/vnHarness"
import { writeFile } from "../../src/storage/opfs"

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-project-picker"

// The front door. What it lists, what it opens, and what it does when it cannot open something.

const SCRIPT = "story:\n  - A line\n"

const make = (id: string, title: string): Promise<void> =>
  createProject(id, { manifestText: manifestNaming(id, title), scriptText: SCRIPT })

let pickerRoot: HTMLDivElement
let opened: string[]

// The picker asks a host to open a project and is told whether it worked. These tests mostly stand
// in for that host; the round trip below is the one that uses the real boot.
let refuseWith: RefusalNotice | null = null

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

const rowIds = (): string[] => [...pickerRoot.querySelectorAll(".vn-picker-id")].map((elem) => elem.textContent ?? "")

const openedLabels = (): string[] =>
  [...pickerRoot.querySelectorAll(".vn-picker-opened")].map((elem) => elem.textContent ?? "")

const daysAgo = (days: number): string => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

const newButton = (): HTMLButtonElement | null => pickerRoot.querySelector(".vn-picker-new")

const deleteButton = (directory: string): HTMLButtonElement =>
  pickerRoot.querySelector(`.vn-picker-delete[data-vn-project="${directory}"]`) as HTMLButtonElement

// The dialogs are src/chrome/'s, not window.confirm or window.prompt - which is what makes them
// reachable from a test at all, and is most of the reason they exist.
const dialog = (): HTMLDialogElement | null => document.querySelector("dialog.vn-dialog")

const dialogText = (): string =>
  [...(dialog()?.querySelectorAll(".vn-dialog-title, .vn-dialog-body") ?? [])].map((elem) => elem.textContent).join(" ")

// A field's own note, once it is wearing a problem rather than its hint. On the field it belongs to,
// which is the whole argument against window.prompt.
const dialogProblem = (): string | null =>
  (dialog()?.querySelector(".vn-dialog-hint-problem") as HTMLElement | null)?.textContent ?? null

const field = (label: string): HTMLInputElement => {
  const row = [...(dialog()?.querySelectorAll(".vn-dialog-field") ?? [])].find(
    (candidate) => candidate.querySelector(".vn-dialog-label")?.textContent === label
  )
  if (row === undefined) throw new Error(`the dialog has no "${label}" field`)
  return row.querySelector("input") as HTMLInputElement
}

// Typing, rather than assigning: the id field tracks the title through `input` events, and that is
// the behaviour under test.
const typeInto = (input: HTMLInputElement, text: string): void => {
  input.value = text
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

const pressConfirm = (): void => (dialog()?.querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()

const pressCancel = (): void => (dialog()?.querySelector(".vn-dialog-cancel") as HTMLButtonElement).click()

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
  it("lists every project the store enumerates, by title, with the id under it", async () => {
    await make("a-story", "A Story")
    await make("b-story", "B Story")

    await newPicker().render()

    expect(rowTitles()).toEqual(["A Story", "B Story"])
    // What the project is addressed by, as opposed to what it is called: its folder, its save key
    // and its export filename. Two projects may be called the same and only one can be `a-story`.
    expect(rowIds()).toEqual(["a-story", "b-story"])
  })

  it("orders by when each project was created, oldest first", async () => {
    // Creation order rather than recency, so the list does not reorder itself under the author.
    // OPFS cannot supply it - measured 2026-09-05, it enumerates by name with no insertion
    // component - so the date is recorded as each project is created.
    await make("a-story", "A Story")
    await make("b-story", "B Story")
    await make("c-story", "C Story")
    await writeEditorState({
      created: { "a-story": daysAgo(5), "b-story": daysAgo(0.5), "c-story": daysAgo(2) },
    })

    await newPicker().render()

    expect(rowDirectories()).toEqual(["a-story", "c-story", "b-story"])
  })

  it("does not move a row when its project is opened", async () => {
    // The whole point of ordering by creation. Under recency ordering every trip back from a project
    // reshuffled the list, and the spatial memory of where each row sits is worth more than having
    // the likeliest one on top.
    await make("a-story", "A Story")
    await make("b-story", "B Story")
    await make("c-story", "C Story")
    const picker = newPicker()
    await picker.render()
    const before = rowDirectories()

    const booted = await bootEditor({ vnDiv: createVnRoot(), vnEditorDiv: document.createElement("div") }, "c-story")
    if (booted.kind === "refused") throw new Error(booted.reason)
    await booted.close()
    document.body.appendChild(pickerRoot)
    await picker.render()

    expect(rowDirectories()).toEqual(before)
  })

  it("appends a new project at the end, leaving every existing row where it was", async () => {
    await make("a-story", "A Story")
    await make("b-story", "B Story")
    await newPicker().render()
    const before = rowDirectories()

    newButton()?.click()
    await settle()
    typeInto(field("Title"), "Zebra")
    pressConfirm()
    await sleep(300)

    const returning = newPicker()
    await returning.render()
    expect(rowDirectories()).toEqual([...before, "zebra"])
  })

  it("puts a project it has no creation date for above the ones it has", async () => {
    // Everything that predates this file recording a date - an author's existing library - is older
    // than everything that has one, and sorts among its own kind by the name it is addressed under.
    await make("newer-story", "Newer")
    await make("older-story", "Older")
    await writeEditorState({ created: { "newer-story": daysAgo(1) } })

    await newPicker().render()

    expect(rowDirectories()).toEqual(["older-story", "newer-story"])
  })

  it("says when each project was last opened, and says so when one never has been", async () => {
    // Rows in creation order - `opened-story` first, because it was made first - each carrying its
    // own last-opened line.
    await make("opened-story", "Opened")
    await make("fresh-story", "Fresh")
    await writeEditorState({
      created: { "opened-story": daysAgo(9), "fresh-story": daysAgo(8) },
      lastOpened: { "opened-story": daysAgo(2) },
    })

    await newPicker().render()

    expect(rowDirectories()).toEqual(["opened-story", "fresh-story"])
    expect(openedLabels()).toEqual(["opened 2 days ago", "not opened yet"])
  })

  it("records the moment a project is opened, and says so on its row", async () => {
    // Written by the boot, not by the picker - but the picker is what it is for. It is the row's
    // line rather than the sort: recency survives as information without moving anything.
    await make("a-story", "A Story")
    await make("z-story", "Z Story")
    const booted = await bootEditor({ vnDiv: createVnRoot(), vnEditorDiv: document.createElement("div") }, "z-story")
    if (booted.kind === "refused") throw new Error(booted.reason)
    await booted.close()
    document.body.appendChild(pickerRoot)

    await newPicker().render()

    expect(rowDirectories()).toEqual(["a-story", "z-story"])
    expect(openedLabels()).toEqual(["not opened yet", "opened just now"])
  })

  it("lists a project whose manifest does not parse, under its directory name", async () => {
    // The state the store deliberately keeps listable: it is an author's project with a typo in it,
    // and this is the one place they would go to open it and fix it.
    await createProject("broken-story", { manifestText: "formatVersion: 1\nid: [unclosed\n", scriptText: SCRIPT })

    await newPicker().render()

    expect(rowTitles()).toEqual(["broken-story"])
    // And no id line: none has been declared, and the title is already the directory - the two
    // would be the same word twice.
    expect(rowIds()).toEqual([])
    expect(pickerRoot.querySelector(".vn-picker-unparsed")?.textContent).toContain("does not parse")
    // A directory name is an identifier rather than a name, so the row says which kind of word it is
    // by wearing the face the script does.
    expect(pickerRoot.querySelector(".vn-picker-title")?.classList.contains("vn-picker-identifier")).toBe(true)
    rows()[0].click()
    await settle()
    expect(opened).toEqual(["broken-story"])
  })

  it("puts both actions in the panel's own bar, above the rows", async () => {
    await make("a-story", "A Story")

    await newPicker().render()

    const bar = pickerRoot.querySelector(".vn-picker-bar") as HTMLElement
    expect(bar.querySelector(".vn-picker-caption")?.textContent).toBe("Projects")
    expect(bar.contains(newButton())).toBe(true)
    expect(bar.contains(demoButton())).toBe(true)
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
    refuseWith = {
      lead: `"a-story" is already open in another tab.`,
      detail: "Close it there, or pick a different project.",
    }
    await newPicker().render()

    rows()[0].click()
    // The host is asked asynchronously and the banner is drawn by the render that follows it.
    await waitFor("the refusal banner", () => refusalText() !== null)

    expect(refusalText()).toContain("a-story")
    expect(refusalText()).toContain("another tab")
    // Inside the panel and above the rows, because it is news about this list - the row it names is
    // directly under it.
    const panel = pickerRoot.querySelector(".vn-picker-panel") as HTMLElement
    expect(panel.contains(pickerRoot.querySelector(".vn-picker-refusal"))).toBe(true)
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
    await waitFor("the demo to be listed", () => rowTitles().includes(demoManifest.title))

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
    await waitFor("the refusal banner", () => refusalText() !== null)

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
      if (booted.kind === "refused") return { lead: booted.reason, detail: booted.advice }
      session = booted
      const firstStop = nextStop(booted.renderer, booted.player)
      await booted.openProject()
      await firstStop
      return null
    })

    await picker.render()
    rows()[1].click()
    await waitFor("the project to open", () => session !== null)
    const booted = session as BootedEditor | null
    if (booted === null) throw new Error("the picker did not open a project")
    expect(booted.directory).toBe("b-story")

    // Typed and left straight away, without waiting out the debounce: close is what makes that safe.
    typeCharacter({ editorRoot: vnEditorDiv }, "  - Typed before going back\n")
    picker.stop()
    await booted.close()

    expect((await readProject("b-story")).scriptText).toContain("Typed before going back")
    expect(Object.keys((await readEditorState()).lastOpened ?? {})).toEqual(["b-story"])
    // And the order the picker comes back to is the one it left, because opening moves nothing.
    expect((await readEditorState()).created).toHaveProperty("a-story")
    // The lock is let go on the way out, so the same project can be opened again.
    const again = await takeProjectLock("b-story")
    expect(again).not.toBe(null)
    await again?.release()

    const returning = newPicker()
    await returning.render()
    expect(rowDirectories()).toEqual(["a-story", "b-story"])
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

describe("making a project", () => {
  it("takes a title, derives an id from it, and opens what it made", async () => {
    await newPicker().render()

    newButton()?.click()
    await settle()
    typeInto(field("Title"), "The Lighthouse Keeper")
    expect(field("Id").value).toBe("the-lighthouse-keeper")
    pressConfirm()
    await waitFor("the project to be opened", () => opened.length > 0)

    expect((await listProjects()).map((project) => project.directory)).toEqual(["the-lighthouse-keeper"])
    // Unlike Add demo project, this one opens what it made: populating the library and starting work
    // are different intents.
    expect(opened).toEqual(["the-lighthouse-keeper"])
  })

  it("stops deriving the id once the author edits it", async () => {
    await newPicker().render()

    newButton()?.click()
    await settle()
    typeInto(field("Title"), "The Lighthouse")
    typeInto(field("Id"), "lighthouse")
    typeInto(field("Title"), "The Lighthouse Keeper")

    expect(field("Id").value).toBe("lighthouse")
    pressConfirm()
    await waitFor("the project to be opened", () => opened.length > 0)
    expect((await listProjects()).map((project) => project.directory)).toEqual(["lighthouse"])
  })

  it("shows the title the author typed, not the id", async () => {
    await newPicker().render()
    newButton()?.click()
    await settle()
    typeInto(field("Title"), "The Lighthouse Keeper")
    pressConfirm()
    await waitFor("the project to be opened", () => opened.length > 0)

    const returning = newPicker()
    await returning.render()
    expect(rowTitles()).toEqual(["The Lighthouse Keeper"])
  })

  it("leaves the id empty when the title slugifies to nothing, and invents none", async () => {
    // A project called `project-1` because the slugifier gave up is worse than being asked.
    await newPicker().render()
    newButton()?.click()
    await settle()

    typeInto(field("Title"), "...!!!...")
    expect(field("Id").value).toBe("")
    pressConfirm()
    await settle()

    expect(dialogProblem()).toContain("Give the project an id")
    expect(await listProjects()).toEqual([])
    pressCancel()
  })

  it("refuses a blank title, which would mint a manifest that does not parse", async () => {
    // The schema has `title: z.string().min(1)`, so a blank one reaches the author as a red gutter
    // on their brand-new project - the exact first impression minting exists to avoid, arrived at
    // from the other side.
    await newPicker().render()
    newButton()?.click()
    await settle()

    typeInto(field("Id"), "hand-typed")
    pressConfirm()
    await settle()

    expect(dialogProblem()).toContain("title")
    expect(await listProjects()).toEqual([])
    pressCancel()
  })

  it("refuses an id the manifest schema rejects, in the schema's own words", async () => {
    await newPicker().render()
    newButton()?.click()
    await settle()

    typeInto(field("Title"), "My Story")
    typeInto(field("Id"), "My Story")
    pressConfirm()
    await settle()

    // The one rule, from the one place that states it - not a second copy that can drift from the
    // directory name, the export filename and the save key it also has to hold for.
    expect(dialogProblem()).toContain("a-z")
    // And the field itself is marked, so which one is wrong reads before the sentence does.
    expect(field("Id").classList.contains("vn-dialog-input-problem")).toBe(true)
    expect(await listProjects()).toEqual([])
    pressCancel()
  })

  it("refuses an id that already names a project rather than writing over it", async () => {
    await make("taken-story", "Taken")
    await newPicker().render()
    newButton()?.click()
    await settle()

    typeInto(field("Title"), "Taken Story")
    expect(field("Id").value).toBe("taken-story")
    pressConfirm()
    await settle()

    expect(dialogProblem()).toBe("A project with this id already exists.")
    expect((await readProject("taken-story")).manifestText).toContain("Taken")
    pressCancel()
  })

  it("creates the project but leaves the author on the picker when the lock is refused", async () => {
    // Another tab can hold projects/<id>/ if that id was just deleted and re-made, or if two tabs
    // race the same new id.
    refuseWith = {
      lead: `"new-story" is already open in another tab.`,
      detail: "Close it there, or pick a different project.",
    }
    await newPicker().render()
    newButton()?.click()
    await settle()
    typeInto(field("Title"), "New Story")
    pressConfirm()
    await waitFor("the refusal banner", () => refusalText() !== null)

    expect(refusalText()).toContain("another tab")
    expect(rowDirectories()).toEqual(["new-story"])
  })

  it("writes nothing when the dialog is dismissed", async () => {
    await newPicker().render()
    newButton()?.click()
    await settle()
    typeInto(field("Title"), "Never Made")

    pressCancel()
    await settle()

    expect(await listProjects()).toEqual([])
    expect(dialog()).toBe(null)
  })
})

describe("deleting a project", () => {
  it("asks first, says the project cannot be recovered, and then removes the tree", async () => {
    await make("doomed", "Doomed")
    await make("kept", "Kept")
    await newPicker().render()

    deleteButton("doomed").click()
    await settle()
    expect(dialogText()).toContain("Doomed")
    expect(dialogText()).toContain("cannot be recovered")

    pressConfirm()
    await waitFor("the row to go", () => !rowDirectories().includes("doomed"))

    expect(rowDirectories()).toEqual(["kept"])
    expect(await listProjects()).toHaveLength(1)
    // Still on the picker: auto-opening something because you deleted something else is not a thing
    // to want.
    expect(opened).toEqual([])
  })

  it("drops the project's saves with it, so a reused id inherits nothing", async () => {
    // The same rule as the creation date: an id is reusable, and a save left behind under one is a
    // save the next project to claim that id opens on - paths through a story it does not have.
    await make("doomed", "Doomed")
    localStorage.setItem("vn-save-doomed", JSON.stringify({ seenCommands: [[0, 5]], saves: [] }))
    await newPicker().render()

    deleteButton("doomed").click()
    await settle()
    pressConfirm()
    await waitFor("the row to go", () => rows().length === 0)

    expect(localStorage.getItem("vn-save-doomed")).toBe(null)
  })

  it("removes nothing when the confirmation is declined", async () => {
    await make("doomed", "Doomed")
    await newPicker().render()

    deleteButton("doomed").click()
    await settle()
    pressCancel()
    await settle()

    expect(await listProjects()).toHaveLength(1)
  })

  it("refuses to delete a project another tab holds, and removes nothing", async () => {
    // A tree another tab is writing into must not be removed underneath it. The same policy the
    // recovery sweep needs, taken here rather than invented twice.
    await make("held-story", "Held")
    const held = await takeProjectLock("held-story")
    if (held === null) throw new Error("the lock was already held before the test started")
    await newPicker().render()

    deleteButton("held-story").click()
    await settle()
    pressConfirm()
    await waitFor("the refusal banner", () => refusalText() !== null)

    expect(refusalText()).toContain("another tab")
    expect(await listProjects()).toHaveLength(1)
    expect(rowDirectories()).toEqual(["held-story"])
    await held.release()
  })

  it("leaves an empty picker offering both New project and Add demo project", async () => {
    // Nothing re-seeds: since the picker there is no automatic seed at all, only the button, which
    // comes back the moment the demo is gone. An author who deleted everything on purpose can get
    // the story back.
    await make(demoManifest.id, "The demo")
    await newPicker().render()

    deleteButton(demoManifest.id).click()
    await settle()
    pressConfirm()
    await waitFor("an empty library", () => rows().length === 0)

    expect(rows()).toHaveLength(0)
    expect(pickerRoot.querySelector(".vn-picker-empty")).not.toBe(null)
    expect(newButton()).not.toBe(null)
    expect(demoButton()).not.toBe(null)
  })
})
