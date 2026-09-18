import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createProject, readProjectFile, writeProjectFile } from "../../src/storage/projectStore"
import { clearOpfsStore } from "../helpers/opfs"
import {
  blurEditor,
  editorTab,
  liveSprites,
  markedLines,
  releaseStoredEditorLock,
  SCENE_HEIGHT,
  SCENE_WIDTH,
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
actors:
  A1:
    sprites:
      idle: idle.png
`

// **The story paints `cliffs`**, which is what makes "does the stage show the new bytes" a question
// this suite can ask at all: with no `bg` the canvas is the default `#FFFFFF` for ever.
//
// No music in it: Chromium's autoplay policy rejects `play()` without a user gesture and
// AudioRenderer does not catch it, so a story that opens on a `bgm` never finishes its first render.
const SCRIPT = `story:
  - bg:
      image: cliffs
      transition: fade
      duration: 0
  - show:
      actor: A1
      sprite: idle
  - A line.
`

// A scene-sized PNG of one colour, so "what is the stage painted with" is answerable by reading its
// middle pixel. Scene-sized rather than 1x1 because the background renderable draws at the image's
// own size: a tiny one never reaches the middle.
const pngOf = async (r: number, g: number, b: number): Promise<Blob> => {
  const canvas = document.createElement("canvas")
  canvas.width = SCENE_WIDTH
  canvas.height = SCENE_HEIGHT
  const context = canvas.getContext("2d")
  if (context === null) throw new Error("no 2d context")
  context.fillStyle = `rgb(${r}, ${g}, ${b})`
  context.fillRect(0, 0, canvas.width, canvas.height)
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

// **What the stage is actually drawing**, sampled off the background canvas. The loader holding the
// new element is not the same question and was the weaker test: `BackgroundRenderer.render` returns
// without touching its canvas unless the state moved, and a replace moves no state - so the loader
// can hold the new image while the scene still shows the old one.
const stagePixel = (started: StartedEditor): [number, number, number] | null => {
  const canvas = started.root.querySelector("#vn-background-renderer") as HTMLCanvasElement | null
  const context = canvas?.getContext("2d")
  if (canvas === null || context === null || context === undefined) return null
  const [r, g, b] = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
  return [r, g, b]
}

const stageShows = (started: StartedEditor, colour: [number, number, number]): boolean => {
  const pixel = stagePixel(started)
  return pixel !== null && pixel.every((channel, i) => Math.abs(channel - colour[i]) <= 2)
}

// Sampling a URL until it decodes to the colour expected. **A wait rather than a one-shot
// assertion**, and both halves of that are earned: a scene-sized PNG takes a moment to decode under
// a loaded runner, and a file read while its write is still landing comes back partial - Chromium
// writes through a swap file beside the target - which shows up as a decode failure rather than as
// a wrong colour. Both flaked only with the whole browser project running.
const showsColour = async (url: string, colour: [number, number, number]): Promise<boolean> => {
  try {
    const pixel = await pixelOf(url)
    return pixel.every((channel, i) => Math.abs(channel - colour[i]) <= 2)
  } catch (e) {
    return false
  }
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
  await writeProjectFile(PROJECT, "assets/sprites/A1/idle.png", await pngOf(0, 255, 255))

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

    // Under the path the declaration already names, whatever the picked file was called.
    await waitFor("the new bytes to land under the same path", async () => {
      const url = URL.createObjectURL(await readProjectFile(PROJECT, "assets/backgrounds/cliffs.png"))
      const shows = await showsColour(url, [0, 0, 255])
      URL.revokeObjectURL(url)
      return shows
    })
    // The declaration does not change, so there is nothing to ask.
    expect(started.editor.getManifestText()).toBe(MANIFEST)
  })

  // **The regression test for the whole ticket**, and it asserts the stage rather than the loader.
  // Two things have to happen for this to pass, and each fails it on its own: the loaders have to
  // forget what they hold, because `loadAsset` early-returns on a path it already holds before it
  // ever consults the resolver; and the previous frame has to be forgotten too, because a replace
  // changes no state and `BackgroundRenderer.render` returns without touching its canvas unless the
  // state moved.
  it("shows the new image on the stage afterwards", async () => {
    const started = await startEditorFromStore(PROJECT)
    await waitFor("the stage to paint the original", () => stageShows(started, [255, 0, 0]))

    pickInto(started, "backgrounds/cliffs", await fileOf("cliffs.png", await pngOf(0, 0, 255)))

    await waitFor("the stage to paint the replacement", () => stageShows(started, [0, 0, 255]))
  })

  // The other half of the repaint, and it fails on its own without it: a sprite element's `src` is an
  // object URL minted when its bytes were loaded, so the element has to be remade - and `render`
  // only remakes one whose path changed.
  it("shows a replaced sprite's new bytes on the stage", async () => {
    const started = await startEditorFromStore(PROJECT)
    await waitFor("the sprite to be on screen", () => Object.keys(liveSprites(started.root)).length === 1)
    const before = liveSprites(started.root).A1.src
    await waitFor("the sprite to show its original bytes", () => showsColour(before, [0, 255, 255]))

    pickInto(started, "actors/A1/sprites/idle", await fileOf("idle.png", await pngOf(255, 255, 0)))

    await waitFor("the sprite element to be remade with the new bytes", async () => {
      const src = liveSprites(started.root).A1?.src
      return src !== undefined && src !== before && (await showsColour(src, [255, 255, 0]))
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
    await waitFor("the opened file to be the one on the stage", () => showsColour(opened[0], [255, 0, 0]))
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
