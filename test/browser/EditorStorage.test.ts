import { beforeEach, describe, expect, it } from "vitest"
import { demoManifest } from "../../src/demoStory"
import { backgroundFilePath } from "../../src/domRenderer/assetPaths"
import { STORE_DEBOUNCE_MS } from "../../src/storage/projectStoring"
import {
  createProject,
  listProjects,
  readProject,
  writeEditorState,
  writeProjectFile,
} from "../../src/storage/projectStore"
import { clearOpfsStore } from "../helpers/opfs"
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  advanceVn,
  blurEditor,
  sleep,
  startEditorFromStore,
  storeStateOf,
  textBoxText,
  typeCharacter,
  typeManifest,
} from "../helpers/vnHarness"

// The editor booting out of the project store, storing back into it, and saying whether it has -
// the ticket an author would notice, because what they type survives a reload.

const MANIFEST = `formatVersion: 1
id: my-story
title: My Story
backgrounds:
  classroom: a.png
`

const SCRIPT = `story:
  - The stored first line
  - The stored second line
`

// Past the debounce, plus room for the write itself to resolve.
const pastDebounce = (): Promise<void> => sleep(STORE_DEBOUNCE_MS + 300)

const storeMyStory = async (manifestText = MANIFEST, scriptText = SCRIPT): Promise<void> => {
  await createProject("my-story", { manifestText, scriptText })
  await writeEditorState({ lastOpened: "my-story" })
}

beforeEach(async () => {
  await clearOpfsStore()
})

describe("the editor over the project store", () => {
  it("mounts the story that was in the store, not one compiled into the bundle", async () => {
    await storeMyStory()

    const started = await startEditorFromStore()

    expect(started.directory).toBe("my-story")
    expect(textBoxText(started.root)).toBe("The stored first line")
    await advanceVn(started)
    expect(textBoxText(started.root)).toBe("The stored second line")
  })

  it("writes an edited script buffer back to the store", async () => {
    await storeMyStory()
    const started = await startEditorFromStore()

    typeCharacter(started, "  - A line typed by the author\n")
    await pastDebounce()

    expect((await readProject("my-story")).scriptText).toContain("A line typed by the author")
  })

  it("does not write back the project it just read", async () => {
    // setValue fires `change` exactly like a keystroke, so an unguarded handler stores everything it
    // just read on every boot - which would also report unstored for two seconds after every load.
    await storeMyStory()
    const started = await startEditorFromStore()

    expect(storeStateOf(started.editorRoot)).toBe("stored")
    await pastDebounce()
    expect((await readProject("my-story")).scriptText).toBe(SCRIPT)
  })

  it("stores a manifest that does not parse, rather than gating the write on the parse", async () => {
    // Still the author's work. Reloading gives them the broken manifest back with the gutter marked,
    // which is what ADR 0002 already does in-session; gating on a successful parse would mean the
    // one edit an author most wants back after a crash is the one that was not written.
    await storeMyStory()
    const started = await startEditorFromStore()

    typeManifest(started, "formatVersion: 1\nid: [unclosed\n")
    await pastDebounce()

    expect((await readProject("my-story")).manifestText).toBe("formatVersion: 1\nid: [unclosed\n")
  })

  it("opens a project whose stored manifest does not parse", async () => {
    // The state the store deliberately keeps listable. Refusing here would make the editor the one
    // place an author cannot go to fix it.
    await storeMyStory("formatVersion: 1\nid: [unclosed\n")

    const started = await startEditorFromStore()

    expect(textBoxText(started.root)).toBe("The stored first line")
    expect(started.editor.isManifestValid()).toBe(true)
  })

  it("seeds the demo when the library is empty, and opens it", async () => {
    const started = await startEditorFromStore()

    expect(started.directory).toBe(demoManifest.id)
    expect((await listProjects()).map((p) => p.id)).toEqual([demoManifest.id])
    expect((await readProject(demoManifest.id)).scriptText).toContain("This is WebVn")
  })

  it("goes unstored on a keystroke and stored once the write resolves", async () => {
    await storeMyStory()
    const started = await startEditorFromStore()
    expect(storeStateOf(started.editorRoot)).toBe("stored")

    typeCharacter(started, "  - One more line\n")
    expect(storeStateOf(started.editorRoot)).toBe("unstored")

    await pastDebounce()
    expect(storeStateOf(started.editorRoot)).toBe("stored")
  })

  it("flushes what is pending when the editor loses focus", async () => {
    // The debounce is the guarantee and every flush is a bonus, but blur is the one an author feels:
    // they click the preview and their work is down.
    await storeMyStory()
    const started = await startEditorFromStore()

    typeCharacter(started, "  - Typed then blurred\n")
    await blurEditor(started)
    await sleep(100)

    expect((await readProject("my-story")).scriptText).toContain("Typed then blurred")
    expect(storeStateOf(started.editorRoot)).toBe("stored")
  })

  it("paints a background whose bytes come out of the store and not off the network", async () => {
    // The one that proves the seam end to end: this path is served by nothing, so a render that
    // paints it can only have got the bytes through OpfsAssetResolver.
    const bgColor = [155, 89, 182]
    const script = "story:\n  - bg:\n      image: classroom\n      transition: fade\n      duration: 0\n  - Painted\n"
    await storeMyStory(MANIFEST, script)
    await writeProjectFile("my-story", backgroundFilePath("a.png"), await solidPng(bgColor))

    const started = await startEditorFromStore()

    expect(textBoxText(started.root)).toBe("Painted")
    // Not on the first frame: `getAsset` hands out a `cloneNode()`, a clone re-fetches its `src`,
    // and a `blob:` re-fetch does not complete before the unanimated first draw - where a relative
    // path is usually served out of the HTTP memory cache in time. The rAF loop repaints and the
    // scene corrects itself within a frame or two, so this is a white flash rather than a missing
    // background. ROUGH_EDGES.md carries it; the fix is in the loader, not here.
    await sleep(200)
    expect(paintedBackground(started.root)).toEqual(bgColor)
  })
})

// A one-colour png as a Blob, which is the shape the store holds an asset in.
const solidPng = async (color: number[]): Promise<Blob> => {
  const canvas = document.createElement("canvas")
  canvas.width = SCENE_WIDTH
  canvas.height = SCENE_HEIGHT
  const ctx = canvas.getContext("2d")
  if (ctx === null) throw new Error("No 2d canvas context")
  ctx.fillStyle = `rgb(${color.join(",")})`
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob === null ? reject(new Error("no blob")) : resolve(blob)))
  )
}

// What the scene is actually painted with, read off the canvas the background renderer owns.
const paintedBackground = (root: HTMLDivElement): number[] => {
  const canvas = root.querySelector("#vn-background-renderer") as HTMLCanvasElement
  const ctx = canvas.getContext("2d")
  if (ctx === null) throw new Error("No 2d canvas context")
  return [...ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data].slice(0, 3)
}
