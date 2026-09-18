import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createProject, readProjectFile, writeProjectFile } from "../../src/storage/projectStore"
import { clearOpfsStore } from "../helpers/opfs"
import {
  blurEditor,
  editorTab,
  markedLines,
  releaseStoredEditorLock,
  StartedEditor,
  startEditorFromStore,
  typeManifest,
  waitFor,
} from "../helpers/vnHarness"

// Replace gives an asset new bytes under the same id and the same filename; preview opens the file
// in a browser tab.
//
// **Store-backed throughout, and that is the point.** The whole difficulty of replace is a cache:
// `loadAsset` early-returns on a path it already holds, before it ever consults the resolver, and
// `OpfsAssetResolver` mints one object URL per path and never revokes - so nothing but a real
// resolver over real files can tell whether the new bytes reached the screen.

// Named after this suite: `navigator.locks` is origin-wide and knows nothing about scratch roots.
const SCRATCH = "replace-asset-suite"
const PROJECT = "replace-asset-project"

const MANIFEST = `formatVersion: 1
id: replace-asset
title: Replace Asset
backgrounds:
  cliffs: cliffs.png
  storm: storm.png
`

// One line, no music: Chromium's autoplay policy rejects `play()` without a user gesture and
// AudioRenderer does not catch it, so a story that opens on a `bgm` never finishes its first render.
const SCRIPT = "story:\n  - A line.\n"

// A 1x1 PNG of a named colour, so "did the stage change" is answerable by reading a pixel.
const pngOf = async (r: number, g: number, b: number): Promise<Blob> => {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext("2d")
  if (context === null) throw new Error("no 2d context")
  context.fillStyle = `rgb(${r}, ${g}, ${b})`
  context.fillRect(0, 0, 1, 1)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (blob === null) throw new Error("toBlob gave nothing")
  return blob
}

const fileOf = async (name: string, blob: Blob): Promise<File> => new File([await blob.arrayBuffer()], name)

const row = (started: StartedEditor, key: string): HTMLElement =>
  started.panelRoot.querySelector(`.vn-asset-row[data-vn-asset="${key}"]`) as HTMLElement

const replaceControl = (started: StartedEditor, key: string): HTMLButtonElement =>
  row(started, key).querySelector(".vn-asset-replace") as HTMLButtonElement

const previewControl = (started: StartedEditor, key: string): HTMLButtonElement | null =>
  row(started, key).querySelector(".vn-asset-preview")

// The picked file, handed to the row's own hidden input the way the platform would.
const pickInto = (started: StartedEditor, key: string, file: File): void => {
  const input = row(started, key).querySelector(".vn-asset-replace-input") as HTMLInputElement
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
  input.dispatchEvent(new Event("change"))
}

// What the sub-renderer is actually holding for a path, read back off the loader - the nearest thing
// to "what the stage is drawing" that does not involve sampling a canvas the background renderer
// paints over several frames.
const loadedSrc = (started: StartedEditor, path: string): string | undefined => {
  const assets = (started.renderer as unknown as { imageLoader: { assets: Record<string, HTMLImageElement | null> } })
    .imageLoader.assets
  return assets[path]?.src
}

const pixelOf = async (src: string): Promise<[number, number, number]> => {
  const image = new Image()
  image.src = src
  await image.decode()
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext("2d")
  if (context === null) throw new Error("no 2d context")
  context.drawImage(image, 0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

// window.open would open a tab per test, so it is recorded instead.
let opened: string[]
const realOpen = window.open

beforeEach(async () => {
  await releaseStoredEditorLock()
  await clearOpfsStore(SCRATCH)
  await createProject(PROJECT, { manifestText: MANIFEST, scriptText: SCRIPT })
  // `cliffs` is there and `storm` is not, which is both halves of the row's own state.
  await writeProjectFile(PROJECT, "assets/backgrounds/cliffs.png", await pngOf(255, 0, 0))

  opened = []
  window.open = (url) => {
    opened.push(String(url))
    return null
  }
})

afterEach(() => {
  window.open = realOpen
})

describe("replacing an asset", () => {
  it("writes the new bytes to the same path and leaves the manifest alone", async () => {
    const started = await startEditorFromStore(PROJECT)

    pickInto(started, "backgrounds/cliffs", await fileOf("whatever-they-called-it.png", await pngOf(0, 0, 255)))
    await waitFor(
      "the new bytes to land",
      async () => (await readProjectFile(PROJECT, "assets/backgrounds/cliffs.png")).size > 0
    )

    // The declaration does not change, so there is nothing to ask - and the picked file's own name is
    // ignored.
    expect(started.editor.getManifestText()).toBe(MANIFEST)
    expect(await pixelOf(URL.createObjectURL(await readProjectFile(PROJECT, "assets/backgrounds/cliffs.png")))).toEqual(
      [0, 0, 255]
    )
  })

  // **The regression test for the whole ticket**, and the one that fails if the loader rebuild is
  // dropped: `loadAsset` early-returns on a path it already holds, so without it the decoded element
  // - and the object URL behind it - is still the old file.
  it("shows the new image afterwards", async () => {
    const started = await startEditorFromStore(PROJECT)
    const before = loadedSrc(started, "assets/backgrounds/cliffs.png")
    expect(await pixelOf(before as string)).toEqual([255, 0, 0])

    pickInto(started, "backgrounds/cliffs", await fileOf("cliffs.png", await pngOf(0, 0, 255)))

    await waitFor("the loader to hold the new image", async () => {
      const src = loadedSrc(started, "assets/backgrounds/cliffs.png")
      if (src === undefined || src === before) return false
      const [r, g, b] = await pixelOf(src)
      return r === 0 && g === 0 && b === 255
    })
  })

  it("clears the orange on a row whose file has arrived, and on the manifest gutter", async () => {
    const started = await startEditorFromStore(PROJECT)
    await waitFor("the missing file to be reported", () =>
      row(started, "backgrounds/storm").classList.contains("vn-asset-missing")
    )
    // Switched to, not typed into: `setValue` replaces every line and takes the gutter markers with
    // it, and what this test is about is the marker the boot's own load put there.
    editorTab(started.editorRoot, "manifest").click()
    await waitFor("the gutter to carry the warning", () =>
      markedLines(started.editorRoot).some((line) => line.message.includes("assets/backgrounds/storm.png"))
    )

    pickInto(started, "backgrounds/storm", await fileOf("storm.png", await pngOf(0, 255, 0)))

    await waitFor("the row to clear", () => !row(started, "backgrounds/storm").classList.contains("vn-asset-missing"))
    expect(markedLines(started.editorRoot)).toEqual([])
  })

  it("is disabled while the manifest does not parse, and says why", async () => {
    const started = await startEditorFromStore(PROJECT)
    expect(replaceControl(started, "backgrounds/cliffs").disabled).toBe(false)

    typeManifest(started, "formatVersion: 1\nid: replace-asset\ntitle: [\n")
    await blurEditor(started)

    await waitFor("the control to be gated", () => replaceControl(started, "backgrounds/cliffs").disabled)
    expect(replaceControl(started, "backgrounds/cliffs").title).toContain("manifest.yaml does not parse")
  })
})

describe("previewing an asset", () => {
  it("opens the file the stage is drawing", async () => {
    const started = await startEditorFromStore(PROJECT)

    ;(previewControl(started, "backgrounds/cliffs") as HTMLButtonElement).click()
    await waitFor("a tab to be opened", () => opened.length === 1)

    expect(await pixelOf(opened[0])).toEqual([255, 0, 0])
  })

  // Absent rather than greyed: `resolve` rejects because there is no file, and a control that can
  // never work on this row is not temporarily unavailable. Its replace is how the author supplies
  // the file that was declared, which makes the orange row the one they can fix from here.
  it("is not drawn on a missing asset, whose replace is", async () => {
    const started = await startEditorFromStore(PROJECT)
    await waitFor("the missing file to be reported", () =>
      row(started, "backgrounds/storm").classList.contains("vn-asset-missing")
    )

    expect(previewControl(started, "backgrounds/storm")).toBeNull()
    expect(replaceControl(started, "backgrounds/storm")).not.toBeNull()
    expect(previewControl(started, "backgrounds/cliffs")).not.toBeNull()
  })

  // It writes nothing, so the gate has nothing to say about it.
  it("stays live while the manifest does not parse", async () => {
    const started = await startEditorFromStore(PROJECT)

    typeManifest(started, "formatVersion: 1\nid: replace-asset\ntitle: [\n")
    await blurEditor(started)

    await waitFor("the write controls to be gated", () => replaceControl(started, "backgrounds/cliffs").disabled)
    expect((previewControl(started, "backgrounds/cliffs") as HTMLButtonElement).disabled).toBe(false)
  })
})
