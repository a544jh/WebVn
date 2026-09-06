import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js/lib/zip-core-custom.js"
import { beforeEach, describe, expect, it } from "vitest"
import { loadFromLocalStorage, saveToLocalStorage } from "../../src/core/save"
import { ProjectPicker } from "../../src/picker/ProjectPicker"
import { ArchiveEntry, importArchive, importProject } from "../../src/storage/archive"
import { exists, readText } from "../../src/storage/opfs"
import { takeProjectLock } from "../../src/storage/projectLock"
import {
  createProject,
  isProject,
  listProjects,
  readEditorState,
  writeEditorState,
  writeProjectFile,
} from "../../src/storage/projectStore"
import { recoverProjects } from "../../src/storage/recoverProjects"
import { immediately } from "../helpers/picker"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
import { manifestNaming } from "../helpers/testManifest"
import { settle, waitFor } from "../helpers/vnHarness"

// Import against real OPFS and real zip.js: the writing, which is what the unit suite deliberately
// cannot reach. What an archive is refused for is settled over a listing in `test/unit/archive.test.ts`.

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-import-project"

// **Named after the suite, and that is not decoration.** `navigator.locks` is origin-wide and knows
// nothing about scratch roots, so two suites using one directory name contend for one
// `vn-project-<directory>` lock even though their files are nowhere near each other. `RecoverProjects`
// and `RenameProject` both used `old-name`/`new-name` and cost a week to it.
const IMPORTED = "import-arrival"
const OTHER = "import-bystander"

const SCRIPT = "story:\n  - A line\n"
const PNG = "not really a png, but bytes are bytes"

// Built with the same library the app reads with, because the interop case that matters is an
// archive some *other* tool wrote and a self-round-trip can never exercise one.
const zipOf = async (files: Record<string, string>): Promise<Blob> => {
  const writer = new ZipWriter<Blob>(new BlobWriter("application/zip"))
  for (const [path, text] of Object.entries(files)) await writer.add(path, new TextReader(text))
  return writer.close()
}

const archiveOf = (id: string, prefix = ""): Record<string, string> => ({
  [`${prefix}manifest.yaml`]: manifestNaming(id, "An Imported Story"),
  [`${prefix}script.yaml`]: SCRIPT,
  [`${prefix}assets/backgrounds/room.png`]: PNG,
})

// Nothing to decide unless a test says so: an import that reached the dialog when it was not supposed
// to fails here rather than quietly overwriting.
const neverAsked = { confirmOverwrite: () => Promise.reject(new Error("the overwrite dialog was not expected")) }

const allow = { confirmOverwrite: () => Promise.resolve(true) }
const refuse = { confirmOverwrite: () => Promise.resolve(false) }

const readImported = (path: string): Promise<string> =>
  storeRoot(SCRATCH).then((root) => readText(root, `projects/${IMPORTED}/${path}`))

beforeEach(async () => {
  await clearOpfsStore(SCRATCH)
  window.localStorage.removeItem(`vn-save-${IMPORTED}`)
})

describe("importing an archive", () => {
  it("writes the whole tree, under the directory the manifest's id names", async () => {
    const result = await importArchive(await zipOf(archiveOf(IMPORTED)), neverAsked)

    expect(result.kind).toEqual("imported")
    expect(await listProjects()).toEqual([{ directory: IMPORTED, id: IMPORTED, title: "An Imported Story" }])
    expect(await readImported("script.yaml")).toEqual(SCRIPT)
    expect(await readImported("assets/backgrounds/room.png")).toEqual(PNG)
  })

  it("takes the identity from the manifest rather than from a wrapping directory", async () => {
    // What macOS right-click Compress and Windows "Send to compressed folder" produce: the folder,
    // wrapped, under whatever name it had on the author's disk.
    await importArchive(await zipOf(archiveOf(IMPORTED, "some-other-folder/")), neverAsked)

    expect(await readImported("assets/backgrounds/room.png")).toEqual(PNG)
  })

  it("leaves the generated README out of the project it writes", async () => {
    await importArchive(await zipOf({ ...archiveOf(IMPORTED), "README.txt": "generated" }), neverAsked)

    expect(await exists(await storeRoot(SCRATCH), `projects/${IMPORTED}/README.txt`)).toBe(false)
  })

  it("refuses anything that is not a zip, by its bytes rather than by its name", async () => {
    const result = await importArchive(new Blob(["formatVersion: 1\n"]), neverAsked)

    expect(result).toMatchObject({ kind: "refused" })
    expect(await listProjects()).toEqual([])
  })

  it("refuses a hostile archive whole, rather than skipping the entry that escapes", async () => {
    const hostile = { ...archiveOf(IMPORTED), "../elsewhere/stolen.txt": "hello" }

    const result = await importArchive(await zipOf(hostile), neverAsked)

    expect(result).toMatchObject({ kind: "refused" })
    // Not a partial landing: the entries that *were* fine are not there either.
    expect(await listProjects()).toEqual([])
  })

  it("dates a project as it arrives, so the picker can place it in the library", async () => {
    await importArchive(await zipOf(archiveOf(IMPORTED)), neverAsked)

    expect((await readEditorState()).created?.[IMPORTED]).toBeDefined()
  })
})

describe("importing onto a project that is already there", () => {
  beforeEach(async () => {
    await createProject(IMPORTED, {
      manifestText: manifestNaming(IMPORTED, "The One Already Here"),
      scriptText: SCRIPT,
    })
    await writeProjectFile(IMPORTED, "assets/audio/theme.mp3", "old audio")
  })

  it("asks first, and writes nothing when the answer is no", async () => {
    const result = await importArchive(await zipOf(archiveOf(IMPORTED)), refuse)

    expect(result).toEqual({ kind: "cancelled" })
    expect(await listProjects()).toEqual([{ directory: IMPORTED, id: IMPORTED, title: "The One Already Here" }])
  })

  it("replaces the project whole, rather than writing over it file by file", async () => {
    await importArchive(await zipOf(archiveOf(IMPORTED)), allow)

    expect(await readImported("assets/backgrounds/room.png")).toEqual(PNG)
    // The project that was here is gone, which is what the author agreed to - not merged with the
    // one that arrived.
    expect(await exists(await storeRoot(SCRATCH), `projects/${IMPORTED}/assets/audio/theme.mp3`)).toBe(false)
  })

  it("drops the destination's saves, because they describe a story it no longer has", async () => {
    saveToLocalStorage(IMPORTED, { seenCommands: [], saves: [{ timestamp: 1, path: [3] }] })

    await importArchive(await zipOf(archiveOf(IMPORTED)), allow)

    expect(() => loadFromLocalStorage(IMPORTED)).toThrow()
  })

  it("keeps the creation date it found, so the row does not move under the author", async () => {
    const created = "2026-08-01T09:00:00.000Z"
    await writeEditorState({ created: { [IMPORTED]: created }, exported: { [IMPORTED]: created } })

    await importArchive(await zipOf(archiveOf(IMPORTED)), allow)

    const state = await readEditorState()
    expect(state.created?.[IMPORTED]).toEqual(created)
    // The export date goes the other way: it described an archive of the project that was just
    // destroyed, not of the one that replaced it.
    expect(state.exported?.[IMPORTED]).toBeUndefined()
  })

  it("refuses while another tab holds the destination, without asking about it first", async () => {
    // The lock before the question: an author must not agree to destroy a project and only then be
    // told the import could not have happened anyway. `neverAsked` is what pins that ordering.
    const lock = await takeProjectLock(IMPORTED)

    const result = await importArchive(await zipOf(archiveOf(IMPORTED)), neverAsked)

    expect(result).toMatchObject({ kind: "refused" })
    expect(await readImported("script.yaml")).toEqual(SCRIPT)
    await lock?.release()
  })
})

describe("an import that never finished", () => {
  // Stopped between step 3 and step 4 - files written, manifest not - which is the only crash state
  // the ordering can leave behind, and the one the sweep already knows how to remove.
  const holding = (text: string) => (destination: WritableStream<Uint8Array>) =>
    new Blob([text]).stream().pipeTo(destination)

  const crashing = (id: string): ArchiveEntry[] => [
    { path: "manifest.yaml", size: 40, writeTo: holding(manifestNaming(id, "Half Written")) },
    { path: "script.yaml", size: SCRIPT.length, writeTo: holding(SCRIPT) },
    {
      path: "assets/backgrounds/room.png",
      size: 4,
      writeTo: () => Promise.reject(new Error("the archive was truncated")),
    },
  ]

  it("leaves a directory with no manifest, which is not a project", async () => {
    await expect(importProject(crashing(IMPORTED), neverAsked)).rejects.toThrow()

    expect(await isProject(IMPORTED)).toBe(false)
    expect(await listProjects()).toEqual([])
  })

  it("gives the lock back, so the sweep that removes it can take it", async () => {
    await createProject(OTHER, { manifestText: manifestNaming(OTHER), scriptText: SCRIPT })
    await expect(importProject(crashing(IMPORTED), neverAsked)).rejects.toThrow()

    await recoverProjects()

    expect(await exists(await storeRoot(SCRATCH), `projects/${IMPORTED}`)).toBe(false)
    // And nothing else was taken with it.
    expect(await listProjects()).toEqual([{ directory: OTHER, id: OTHER, title: OTHER }])
  })
})

describe("the picker's import surface", () => {
  let pickerRoot: HTMLDivElement
  let picker: ProjectPicker
  // A real queue rather than `immediately`, because half of what is under test here is that the
  // picker's work takes its turn in one.
  let turns: (() => Promise<unknown>)[]
  let tail: Promise<unknown>

  const inTurn = <T>(job: () => Promise<T>): Promise<T> => {
    turns.push(job)
    const next = tail.then(job, job)
    tail = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  const newPicker = (): ProjectPicker => {
    pickerRoot = document.createElement("div")
    document.body.appendChild(pickerRoot)
    picker = new ProjectPicker(pickerRoot, () => Promise.resolve(null), inTurn)
    return picker
  }

  // An import that will not finish until the test says so, so that "while it is running" is a state a
  // test can stand in rather than a race it has to win.
  //
  // `release` waits for the picker to go idle again, and every test that holds one must await it: an
  // import still writing when the test ends runs into the next test's `clearOpfsStore`, which removes
  // the tree underneath it.
  const holdUntilAsked = (): { release: () => Promise<void> } => {
    let open = (): void => undefined
    const held = new Promise<void>((resolve) => (open = resolve))
    const real = ProjectPicker.prototype["readArchive" as keyof ProjectPicker] as unknown
    Object.defineProperty(picker, "readArchive", {
      configurable: true,
      value: async function (this: ProjectPicker, file: File) {
        await held
        return (real as (f: File) => Promise<void>).call(this, file)
      },
    })
    return {
      release: async () => {
        open()
        await waitFor("the picker to go idle", () => importButton().disabled === false)
      },
    }
  }

  const importButton = (): HTMLButtonElement => pickerRoot.querySelector(".vn-picker-import") as HTMLButtonElement

  const row = (directory: string): HTMLButtonElement =>
    pickerRoot.querySelector(`.vn-picker-open[data-vn-project="${directory}"]`) as HTMLButtonElement

  const make = (directory: string): Promise<void> =>
    createProject(directory, { manifestText: manifestNaming(directory), scriptText: SCRIPT })

  const panel = (): HTMLElement => pickerRoot.querySelector(".vn-picker-panel") as HTMLElement

  const refusalText = (): string => pickerRoot.querySelector(".vn-picker-refusal")?.textContent ?? ""

  const dialogText = (): string =>
    [...document.querySelectorAll("dialog.vn-dialog .vn-dialog-title, dialog.vn-dialog .vn-dialog-body")]
      .map((elem) => elem.textContent)
      .join(" ")

  const carrying = (...files: File[]): DataTransfer => {
    const data = new DataTransfer()
    for (const file of files) data.items.add(file)
    return data
  }

  const drag = (type: string, data: DataTransfer): void => {
    pickerRoot.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }))
  }

  const archiveFile = async (name: string): Promise<File> =>
    new File([await zipOf(archiveOf(IMPORTED))], name, { type: "application/zip" })

  beforeEach(() => {
    document.body.innerHTML = ""
    turns = []
    tail = Promise.resolve()
  })

  it("offers Import project beside New project", async () => {
    await newPicker().render()

    expect(pickerRoot.querySelector(".vn-picker-import")?.textContent).toEqual("Import project")
  })

  it("says what a drop would do while an archive is over the page", async () => {
    await newPicker().render()

    drag("dragenter", carrying(await archiveFile("story.webvn.zip")))

    expect(panel().classList.contains("vn-picker-dropping")).toBe(true)
    expect(pickerRoot.querySelector(".vn-picker-drop")?.textContent).toContain("Drop a")
  })

  it("stops saying so when the drag leaves again", async () => {
    await newPicker().render()
    const carried = carrying(await archiveFile("story.webvn.zip"))

    drag("dragenter", carried)
    drag("dragleave", carried)

    expect(panel().classList.contains("vn-picker-dropping")).toBe(false)
  })

  it("imports a dropped archive and leaves the author on the list, with the row on it", async () => {
    await newPicker().render()

    drag("drop", carrying(await archiveFile("story.webvn.zip")))
    await waitFor("the imported row", () => pickerRoot.querySelectorAll(".vn-picker-project").length === 1)

    expect(pickerRoot.querySelector(".vn-picker-title")?.textContent).toEqual("An Imported Story")
    expect(panel().classList.contains("vn-picker-dropping")).toBe(false)
    // Nothing to announce: the row arriving is the confirmation, exactly as Add demo project.
    expect(refusalText()).toEqual("")
  })

  it("says an import landed, because on an overwrite no new row arrives to say it", async () => {
    await createProject(IMPORTED, {
      manifestText: manifestNaming(IMPORTED, "The One Already Here"),
      scriptText: SCRIPT,
    })
    await newPicker().render()

    drag("drop", carrying(await archiveFile("story.webvn.zip")))
    await waitFor("the overwrite dialog", () => document.querySelector("dialog.vn-dialog") !== null)
    ;(document.querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()
    await waitFor("the result", () => pickerRoot.querySelector(".vn-picker-result") !== null)

    const said = pickerRoot.querySelector(".vn-picker-result")?.textContent ?? ""
    expect(said).toContain("story.webvn.zip was imported")
    expect(said).toContain("replaced what was filed under")
    // News, not a status: none of the three status colours is spent on it.
    expect(pickerRoot.querySelector(".vn-picker-refusal")).toBeNull()
  })

  it("says which file it is importing, on the button and with the page inert under it", async () => {
    // Held rather than poked at a live control: the state is a field the draw reads, so the next
    // render keeps it. Every button goes inert, not only the one that was pressed.
    await make(OTHER)
    await newPicker().render()
    const held = holdUntilAsked()

    drag("drop", carrying(await archiveFile("held.webvn.zip")))
    await waitFor("the import to say so", () => importButton().textContent?.includes("Importing") === true)

    expect(importButton().textContent).toContain("held.webvn.zip")
    expect(importButton().disabled).toBe(true)
    expect(row(OTHER).disabled).toBe(true)
    await held.release()
  })

  it("keeps saying so across a render it does not control", async () => {
    await newPicker().render()
    const held = holdUntilAsked()
    drag("drop", carrying(await archiveFile("held.webvn.zip")))
    await waitFor("the import to say so", () => importButton().textContent?.includes("Importing") === true)

    await picker.render()

    expect(importButton().textContent).toContain("Importing")
    await held.release()
  })

  it("runs in the host's turn, so nothing can swap the picker out from under it", async () => {
    // The bug this closes: an import outliving the view that started it. With the work in the queue
    // a Back cannot take its turn until the write is done, so there is no window to be torn down in.
    await newPicker().render()
    const held = holdUntilAsked()
    drag("drop", carrying(await archiveFile("held.webvn.zip")))
    await waitFor("the import to start", () => turns.length === 1)

    let swapped = false
    void inTurn(async () => {
      swapped = true
    })
    await settle()
    expect(swapped).toBe(false)

    await held.release()
    expect(swapped).toBe(true)
  })

  it("names the file that was refused, in the banner the rest of the picker refuses in", async () => {
    await newPicker().render()

    drag("drop", carrying(new File(["not a zip"], "notes.txt")))
    await waitFor("the refusal", () => refusalText() !== "")

    expect(refusalText()).toContain("notes.txt was not imported")
    expect(refusalText()).toContain("Nothing was written.")
  })

  it("refuses a multi-file drop rather than silently picking one of them", async () => {
    await newPicker().render()

    drag("drop", carrying(await archiveFile("one.webvn.zip"), await archiveFile("two.webvn.zip")))
    await waitFor("the refusal", () => refusalText() !== "")

    expect(refusalText()).toContain("2 files were dropped")
    expect(await listProjects()).toEqual([])
  })

  it("asks about a taken id in the words a rename already asks in, and offers the way to keep both", async () => {
    await createProject(IMPORTED, {
      manifestText: manifestNaming(IMPORTED, "The One Already Here"),
      scriptText: SCRIPT,
    })
    await newPicker().render()

    drag("drop", carrying(await archiveFile("story.webvn.zip")))
    await waitFor("the overwrite dialog", () => document.querySelector("dialog.vn-dialog") !== null)

    expect(dialogText()).toContain(`Overwrite "${IMPORTED}"?`)
    expect(dialogText()).toContain("importing onto it destroys that project")
    expect(dialogText()).toContain("rename the project you have, and import again")
    ;(document.querySelector(".vn-dialog-cancel") as HTMLButtonElement).click()
    await settle()
  })
})
