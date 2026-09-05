import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProjectPicker } from "../../src/picker/picker"
import { exists, writeFile } from "../../src/storage/opfs"
import { ProjectLock, takeProjectLock } from "../../src/storage/projectLock"
import {
  createProject,
  listProjects,
  readEditorState,
  readProject,
  recordPendingRename,
  writeEditorState,
} from "../../src/storage/projectStore"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
import { releaseStoredEditorLock, settle } from "../helpers/vnHarness"

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-recover"

// Reaching the picker after a tab was killed mid-rename leaves exactly one valid project, whichever
// moment it died in. Crash states are built directly in the store and then rendered over, which is
// the only way to hold one still - a real rename passes through each of them in milliseconds.
//
// This is what makes the rename's blur trigger safe rather than merely convenient: blur never fires
// on a tab close, so it is the other half of the mechanism rather than a backstop for a rare crash.

const FROM = "old-name"
const TO = "new-name"

const manifestFor = (id: string): string => `formatVersion: 1\nid: ${id}\ntitle: ${id}\n`
const SCRIPT = "story:\n  - A line\n"

let pickerRoot: HTMLDivElement
let taken: ProjectLock[] = []

const holdAsAnotherTab = async (directory: string): Promise<void> => {
  const lock = await takeProjectLock(directory)
  if (lock === null) throw new Error(`${directory} was already locked before the test started`)
  taken.push(lock)
}

// Recovery runs before the picker's list walk, so rendering one is how it is triggered.
const renderPicker = async (): Promise<ProjectPicker> => {
  const picker = new ProjectPicker(pickerRoot, async () => null)
  await picker.render()
  return picker
}

const directories = async (): Promise<string[]> => (await listProjects()).map((p) => p.directory).sort()

const rows = (): string[] =>
  [...pickerRoot.querySelectorAll(".vn-picker-open")].map((row) => (row as HTMLElement).dataset.vnProject ?? "")

// Everything a rename copies except the manifest, which is its commit point.
const halfCopied = async (directory: string): Promise<void> => {
  const root = await storeRoot(SCRATCH)
  await writeFile(root, `projects/${directory}/script.yaml`, SCRIPT)
  await writeFile(root, `projects/${directory}/assets/backgrounds/a.png`, new Blob(["pretend-png"]))
}

const stillThere = async (directory: string): Promise<boolean> =>
  exists(await storeRoot(SCRATCH), `projects/${directory}`)

beforeEach(async () => {
  await releaseStoredEditorLock()
  await clearOpfsStore(SCRATCH)
  document.body.innerHTML = ""
  pickerRoot = document.createElement("div")
  document.body.appendChild(pickerRoot)
})

afterEach(async () => {
  await Promise.all(taken.map((lock) => lock.release()))
  taken = []
})

describe("a rename that was interrupted", () => {
  it("sweeps the destination when the copy never committed, and leaves the source alone", async () => {
    // Killed between the marker and the manifest write. The destination has no manifest, so it is
    // residue by the store's own rule and the source was never touched.
    await createProject(FROM, { manifestText: manifestFor(FROM), scriptText: SCRIPT })
    await halfCopied(TO)
    await recordPendingRename({ from: FROM, to: TO })

    await renderPicker()

    expect(await directories()).toEqual([FROM])
    expect(await stillThere(TO)).toBe(false)
    expect((await readEditorState()).pendingRename).toBeUndefined()
    // Listed, with everything intact, and it opens when chosen.
    expect(rows()).toEqual([FROM])
    expect((await readProject(FROM)).scriptText).toBe(SCRIPT)
  })

  it("deletes the source when the copy committed, and leaves one project under the new id", async () => {
    // Killed after the manifest write, before the delete. Both are valid projects at that moment,
    // which is exactly why the delete below has to take a lock.
    await createProject(FROM, { manifestText: manifestFor(FROM), scriptText: SCRIPT })
    await createProject(TO, { manifestText: manifestFor(TO), scriptText: SCRIPT })
    await writeEditorState({
      created: { [FROM]: "2026-01-01T00:00:00.000Z" },
      pendingRename: { from: FROM, to: TO },
    })

    await renderPicker()

    expect(await directories()).toEqual([TO])
    expect(await stillThere(FROM)).toBe(false)
    const state = await readEditorState()
    expect(state.pendingRename).toBeUndefined()
    // The bookkeeping finishes its journey too, or the renamed project would land in the undated
    // bucket the picker sorts first.
    expect(state.created).toEqual({ [TO]: "2026-01-01T00:00:00.000Z" })
  })

  it("discards a marker naming a destination that never appeared, and deletes nothing", async () => {
    await createProject(FROM, { manifestText: manifestFor(FROM), scriptText: SCRIPT })
    await recordPendingRename({ from: FROM, to: "never-existed" })

    await renderPicker()

    expect(await directories()).toEqual([FROM])
    expect((await readEditorState()).pendingRename).toBeUndefined()
  })

  it("discards a marker naming a source that is already gone, and leaves the destination alone", async () => {
    // The delete finished and only the marker was left. Every step of finishing is safe to repeat,
    // which is what lets this run over a rename that got further than the marker suggests.
    await createProject(TO, { manifestText: manifestFor(TO), scriptText: SCRIPT })
    await recordPendingRename({ from: FROM, to: TO })

    await renderPicker()

    expect(await directories()).toEqual([TO])
    expect((await readEditorState()).pendingRename).toBeUndefined()
    expect((await readProject(TO)).scriptText).toBe(SCRIPT)
  })

  it("does not delete a source another tab holds, and leaves the marker for the next render", async () => {
    // Between the commit and the delete both directories are listed projects, so a second tab can
    // legitimately have opened the source. Deleting it would take a project out from under a live
    // editor.
    await createProject(FROM, { manifestText: manifestFor(FROM), scriptText: SCRIPT })
    await createProject(TO, { manifestText: manifestFor(TO), scriptText: SCRIPT })
    await recordPendingRename({ from: FROM, to: TO })
    await holdAsAnotherTab(FROM)

    await renderPicker()

    expect(await stillThere(FROM)).toBe(true)
    expect((await readEditorState()).pendingRename).toEqual({ from: FROM, to: TO })

    // And the next render with nobody holding it finishes the job - which, running on every picker
    // render, is soon rather than next session.
    await Promise.all(taken.map((lock) => lock.release()))
    taken = []
    await renderPicker()

    expect(await stillThere(FROM)).toBe(false)
    expect((await readEditorState()).pendingRename).toBeUndefined()
  })
})

describe("sweeping what is not a project", () => {
  it("removes a directory with no manifest, whether or not a marker mentions it", async () => {
    await createProject(FROM, { manifestText: manifestFor(FROM), scriptText: SCRIPT })
    await halfCopied("nobody-mentioned-me")

    await renderPicker()

    expect(await stillThere("nobody-mentioned-me")).toBe(false)
    expect(await directories()).toEqual([FROM])
  })

  it("does not sweep a project whose manifest does not parse", async () => {
    // An author's project with a typo in it, not residue - and the library is the one place they
    // would go to open it and fix it.
    await createProject("broken", { manifestText: "formatVersion: 1\nid: [unclosed\n", scriptText: SCRIPT })

    await renderPicker()

    expect(await stillThere("broken")).toBe(true)
    expect(rows()).toEqual(["broken"])
  })

  it("does not sweep a directory another tab holds", async () => {
    // A rename in flight elsewhere holds its destination's lock, and that destination is
    // manifest-less right up until it commits.
    await halfCopied(TO)
    await holdAsAnotherTab(TO)

    await renderPicker()

    expect(await stillThere(TO)).toBe(true)
  })

  it("does not sweep a project that has a manifest but no script", async () => {
    // The most that could be inferred without a marker, and inferring it would be wrong: it is
    // exactly the state createProject passes through between its two writes. A duplicate the author
    // can delete is the price of never making a wrong delete.
    await writeFile(await storeRoot(SCRATCH), `projects/half-made/manifest.yaml`, manifestFor("half-made"))

    await renderPicker()

    expect(await stillThere("half-made")).toBe(true)
  })
})

describe("when the store will not let recovery finish", () => {
  // Found by killing a tab inside a real rename's post-commit window, which the twelve fabricated
  // states above cannot reach: they all build a *clean* crash, and a browser that was interrupted
  // mid-delete is still holding the tree it was deleting. Chromium throws NoModificationAllowedError
  // out of removeEntry then, and that rejection used to travel all the way to the entry point's
  // catch - putting "Something went wrong opening your project" on the page over a perfectly good
  // project sitting on disk.
  //
  // An open writable stream is what makes a directory unremovable, which is exactly the state an
  // interrupted copy leaves behind.
  const holdOpen = async (path: string): Promise<FileSystemWritableFileStream> => {
    const root = await storeRoot(SCRATCH)
    const parts = path.split("/")
    let dir = root
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true })
    const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
    return handle.createWritable()
  }

  it("still lists the library when the source of a committed rename cannot be removed", async () => {
    await createProject(FROM, { manifestText: manifestFor(FROM), scriptText: SCRIPT })
    await createProject(TO, { manifestText: manifestFor(TO), scriptText: SCRIPT })
    await recordPendingRename({ from: FROM, to: TO })
    const held = await holdOpen(`projects/${FROM}/assets/stuck.png`)

    await renderPicker()

    // The tidy-up could not finish, so the marker stands and the next render will try again - but
    // the author can see their projects, which is the whole point of the page.
    expect(rows().sort()).toEqual([FROM, TO].sort())
    expect((await readEditorState()).pendingRename).toEqual({ from: FROM, to: TO })

    // And once the browser lets go, the next render finishes the job.
    await held.close()
    await renderPicker()
    expect(rows()).toEqual([TO])
    expect((await readEditorState()).pendingRename).toBeUndefined()
  })

  it("sweeps the residue it can when one directory will not go", async () => {
    await createProject(FROM, { manifestText: manifestFor(FROM), scriptText: SCRIPT })
    await halfCopied("stuck-residue")
    await halfCopied("removable-residue")
    const held = await holdOpen("projects/stuck-residue/assets/stuck.png")

    await renderPicker()

    expect(await stillThere("removable-residue")).toBe(false)
    expect(await stillThere("stuck-residue")).toBe(true)
    expect(rows()).toEqual([FROM])
    await held.close()
  })
})

describe("with editor.yaml missing or unreadable", () => {
  it("still lists a consistent set: residue swept, nothing valid removed", async () => {
    // The file is defined as losable, so recovery has to degrade to what enumeration alone can
    // prove - and what it can prove is that a directory with no manifest is not a project.
    await createProject(FROM, { manifestText: manifestFor(FROM), scriptText: SCRIPT })
    await createProject(TO, { manifestText: manifestFor(TO), scriptText: SCRIPT })
    await halfCopied("residue")
    await writeFile(await storeRoot(SCRATCH), "editor.yaml", "pendingRename: [unclosed\n")

    await renderPicker()

    expect(await directories()).toEqual([FROM, TO].sort())
    expect(await stillThere("residue")).toBe(false)
  })
})

describe("when recovery runs", () => {
  it("runs before the list walk, so no row is drawn that is about to be removed", async () => {
    // Residue cannot demonstrate this - `listProjects` skips a manifest-less directory whenever the
    // sweep runs. What can is a rename that committed and did not finish: both directories are
    // valid, listed projects at that moment, and recovery removes one of them. Drawn after the walk,
    // the picker would offer the author a row that no longer exists by the time they click it.
    await createProject(FROM, { manifestText: manifestFor(FROM), scriptText: SCRIPT })
    await createProject(TO, { manifestText: manifestFor(TO), scriptText: SCRIPT })
    await recordPendingRename({ from: FROM, to: TO })

    await renderPicker()

    expect(rows()).toEqual([TO])
  })

  it("runs again on a second render, not only on the first", async () => {
    // The picker re-lists on every Back to projects, and an author can now enter and leave the
    // editor repeatedly without a reload - so once per page load would let a crash sit until then.
    const picker = await renderPicker()
    await halfCopied("arrived-later")
    await settle()

    await picker.render()

    expect(await stillThere("arrived-later")).toBe(false)
  })
})
