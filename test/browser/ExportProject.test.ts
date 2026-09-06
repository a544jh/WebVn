import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js/lib/zip-core-custom.js"
import { beforeEach, describe, expect, it } from "vitest"
import { ProjectPicker } from "../../src/picker/ProjectPicker"
import { exportProject, importArchive } from "../../src/storage/archive"
import { writeFile } from "../../src/storage/opfs"
import {
  createProject,
  deleteProject,
  forgetProject,
  readEditorState,
  renameProject,
  writeProjectFile,
} from "../../src/storage/projectStore"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
import { manifestNaming } from "../helpers/testManifest"
import { releaseStoredEditorLock, startEditorFromStore, typeScript, waitFor } from "../helpers/vnHarness"

// Export against real OPFS and real zip.js, and the round trip through import that is the whole point
// of the format. The README's text, the store-mode list and the filename are settled in
// `test/unit/archive.test.ts`; what is here is what only a real tree and a live storer can show.

// A scratch directory no other suite uses, and project directories named after the suite - locks are
// origin-wide, whatever root the store is pointed at. See test/helpers/opfs.ts.
const SCRATCH = "test-scratch-export-project"
const EXPORTED = "export-subject"
const BROKEN = "export-unparseable"
const RENAMED = "export-subject-renamed"

const SCRIPT = "story:\n  - A line\n"
const PNG = "not really a png, but bytes are bytes"

const held = async (blob: Blob): Promise<Record<string, string>> => {
  const reader = new ZipReader(new BlobReader(blob))
  const contents: Record<string, string> = {}
  for (const entry of await reader.getEntries()) {
    if (entry.directory) continue
    contents[entry.filename] = await entry.getData<Blob>(new BlobWriter()).then((data) => data.text())
  }
  await reader.close()
  return contents
}

// What an export produced, or a failure naming why - so a test that means to succeed says so in one
// line rather than narrowing a union in three.
const archiveOf = async (directory: string): Promise<Record<string, string>> => {
  const result = await exportProject(directory)
  if (result.kind === "refused") throw new Error(`expected an archive: ${result.problem}`)
  return held(result.blob)
}

const makeProject = async (directory: string): Promise<void> => {
  await createProject(directory, { manifestText: manifestNaming(directory, "A Story"), scriptText: SCRIPT })
  await writeProjectFile(directory, "assets/backgrounds/room.png", PNG)
}

beforeEach(async () => {
  await releaseStoredEditorLock()
  await clearOpfsStore(SCRATCH)
  document.body.innerHTML = ""
})

describe("exporting a project", () => {
  it("holds the whole tree, unwrapped at the archive root", async () => {
    await makeProject(EXPORTED)

    const contents = await archiveOf(EXPORTED)

    expect(Object.keys(contents).sort()).toEqual([
      "README.txt",
      "assets/backgrounds/room.png",
      "manifest.yaml",
      "script.yaml",
    ])
    expect(contents["script.yaml"]).toEqual(SCRIPT)
  })

  it("names the file after the manifest's id, which the gate guarantees exists", async () => {
    await makeProject(EXPORTED)

    const result = await exportProject(EXPORTED)

    expect(result).toMatchObject({ kind: "exported", filename: `${EXPORTED}.webvn.zip` })
  })

  it("holds files the manifest never declared, because it is a tree copy rather than a preload list", async () => {
    await makeProject(EXPORTED)
    await writeProjectFile(EXPORTED, "notes/outline.md", "act one")

    expect(Object.keys(await archiveOf(EXPORTED))).toContain("notes/outline.md")
  })

  it("leaves editor.yaml out of it, because that is the editor's rather than the project's", async () => {
    await makeProject(EXPORTED)

    expect(Object.keys(await archiveOf(EXPORTED))).not.toContain("editor.yaml")
  })

  it("gives way to the generated README when the project keeps one of its own at the root", async () => {
    // Not a preference: `ZipWriter.add` throws on a duplicate name, so without this an author who put
    // a readme beside their manifest could not export at all.
    await makeProject(EXPORTED)
    await writeProjectFile(EXPORTED, "README.txt", "the author's own")
    await writeProjectFile(EXPORTED, "assets/README.txt", "this one is inside the project")

    const contents = await archiveOf(EXPORTED)

    expect(contents["README.txt"]).toContain("This is a WebVn project")
    expect(contents["assets/README.txt"]).toEqual("this one is inside the project")
  })

  it("refuses a project whose manifest does not parse, which is the invariant at the format boundary", async () => {
    await createProject(BROKEN, { manifestText: manifestNaming(BROKEN), scriptText: SCRIPT })
    await writeFile(await storeRoot(SCRATCH), `projects/${BROKEN}/manifest.yaml`, "formatVersion: 1\nid: [\n")

    const result = await exportProject(BROKEN)

    expect(result).toMatchObject({ kind: "refused", problem: "its manifest.yaml does not parse" })
    // The parser's own words, once - said by an export that says nothing was exported, rather than by
    // one that says nothing was written and then says it again.
    if (result.kind !== "refused") throw new Error("expected a refusal")
    expect(result.advice).toMatch(/^Nothing was exported\. Line \d+: /)
    expect(result.advice).not.toContain("Nothing was written")
  })

  it("refuses a project with no script, which nothing else would ever catch", async () => {
    await makeProject(EXPORTED)
    await storeRoot(SCRATCH).then((root) =>
      root
        .getDirectoryHandle("projects")
        .then((projects) => projects.getDirectoryHandle(EXPORTED))
        .then((project) => project.removeEntry("script.yaml"))
    )

    expect(await exportProject(EXPORTED)).toMatchObject({ kind: "refused" })
  })
})

describe("the round trip", () => {
  it("imports back into a project that holds exactly what was exported", async () => {
    await makeProject(EXPORTED)
    const result = await exportProject(EXPORTED)
    if (result.kind === "refused") throw new Error(result.problem)
    await deleteProject(EXPORTED)

    const imported = await importArchive(result.blob, {
      confirmOverwrite: () => Promise.reject(new Error("nothing should be there to overwrite")),
    })

    expect(imported).toMatchObject({ kind: "imported", directory: EXPORTED })
    const again = await archiveOf(EXPORTED)
    expect(again["script.yaml"]).toEqual(SCRIPT)
    expect(again["assets/backgrounds/room.png"]).toEqual(PNG)
  })
})

describe("exporting the project that is open", () => {
  // The one thing only a live storer can demonstrate. The debounce is 2000ms, so an export taken
  // straight after typing ships an archive missing the author's last sentence unless the caller
  // flushes first - which is the worst possible bug in a backup feature.
  it("holds what the author has typed, once the storer has been flushed", async () => {
    await makeProject(EXPORTED)
    const started = await startEditorFromStore(EXPORTED)
    typeScript(started, "story:\n  - The line they just wrote\n")

    await started.storing.flush()
    const contents = await archiveOf(EXPORTED)

    expect(contents["script.yaml"]).toContain("The line they just wrote")
  })

  it("holds the stored text without one, which is why the flush is the caller's first step", async () => {
    await makeProject(EXPORTED)
    const started = await startEditorFromStore(EXPORTED)
    typeScript(started, "story:\n  - The line they just wrote\n")

    const contents = await archiveOf(EXPORTED)

    expect(contents["script.yaml"]).toEqual(SCRIPT)
  })
})

describe("when a project was last exported", () => {
  it("is recorded where the archive is built, so both surfaces date it", async () => {
    await makeProject(EXPORTED)

    await exportProject(EXPORTED)

    expect((await readEditorState()).exported?.[EXPORTED]).toBeDefined()
  })

  it("travels with a rename, so a renamed project is not told to back up what it already has", async () => {
    await makeProject(EXPORTED)
    await exportProject(EXPORTED)

    await renameProject(EXPORTED, RENAMED, manifestNaming(RENAMED, "A Story"))

    const state = await readEditorState()
    expect(state.exported?.[RENAMED]).toBeDefined()
    expect(state.exported?.[EXPORTED]).toBeUndefined()
  })

  it("goes with the project when it is deleted, so the next one to claim the name does not inherit it", async () => {
    await makeProject(EXPORTED)
    await exportProject(EXPORTED)

    await deleteProject(EXPORTED)
    await forgetProject(EXPORTED)

    expect((await readEditorState()).exported?.[EXPORTED]).toBeUndefined()
  })
})

describe("the picker's export control", () => {
  const newPicker = (): ProjectPicker => {
    const root = document.createElement("div")
    document.body.appendChild(root)
    return new ProjectPicker(root, () => Promise.resolve(null))
  }

  const exportButton = (directory: string): HTMLButtonElement =>
    document.querySelector(`.vn-picker-export[data-vn-project="${directory}"]`) as HTMLButtonElement

  const metaLine = (): string => (document.querySelector(".vn-picker-opened") as HTMLElement).textContent ?? ""

  it("says a project has never been exported, as a statement rather than a warning", async () => {
    await makeProject(EXPORTED)

    await newPicker().render()

    expect(metaLine()).toContain("never exported")
    expect(document.querySelector(".vn-picker-opened")?.className).toEqual("vn-picker-opened")
  })

  it("says when it last was, once it has been", async () => {
    await makeProject(EXPORTED)
    await exportProject(EXPORTED)

    await newPicker().render()

    expect(metaLine()).toContain("exported just now")
  })

  it("is disabled on a project whose manifest does not parse, with the reason on the row", async () => {
    await createProject(BROKEN, { manifestText: manifestNaming(BROKEN), scriptText: SCRIPT })
    await writeFile(await storeRoot(SCRATCH), `projects/${BROKEN}/manifest.yaml`, "formatVersion: 1\nid: [\n")

    await newPicker().render()

    expect(exportButton(BROKEN).disabled).toBe(true)
    expect(document.querySelector(".vn-picker-unparsed")?.textContent).toContain("cannot be exported until it does")
    // No export fact on that row: it says nothing about a thing it cannot do.
    expect(metaLine()).not.toContain("exported")
  })

  // Waited for rather than slept past: building a zip and walking a tree takes as long as it takes,
  // and the whole browser project runs its files in parallel.
  const pressExport = async (directory: string): Promise<void> => {
    exportButton(directory).click()
    await waitFor("the export to report", () => document.querySelector(".vn-picker-result") !== null)
  }

  it("says an archive was written, rather than leaving it to a date among the dates", async () => {
    await makeProject(EXPORTED)
    await newPicker().render()

    await pressExport(EXPORTED)

    expect(document.querySelector(".vn-picker-result")?.textContent).toContain(`${EXPORTED}.webvn.zip`)
  })

  it("exports the row it was pressed on, and redraws the library with the date on it", async () => {
    await makeProject(EXPORTED)
    await newPicker().render()

    await pressExport(EXPORTED)

    expect((await readEditorState()).exported?.[EXPORTED]).toBeDefined()
    expect(metaLine()).toContain("exported just now")
  })
})
