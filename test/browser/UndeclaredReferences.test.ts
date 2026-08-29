import { describe, expect, it } from "vitest"
import { VnManifest } from "../../src/core/manifest"
import { DomRenderer } from "../../src/domRenderer/DomRenderer"
import { advanceVn, SCENE_HEIGHT, SCENE_WIDTH, startVnWithErrors, textBoxText } from "../helpers/vnHarness"

// The regression net for the whole of ticket 03: this exact script threw out of DomRenderer.render
// before the parser started checking the ids a script names. Now the `bg` naming an id nobody
// declared is a no-op, so the background that is up stays up and the story plays on.

const MANIFEST: VnManifest = {
  id: "undeclared-references",
  title: "Undeclared References",
  actors: {},
  backgrounds: { a: "a.png" },
  audioAssets: {},
}

const BG_COLOR = [155, 89, 182]

const script = `
story:
  - Before any background
  - bg:
      image: a
      transition: fade
      duration: 0
  - The declared background is up
  - bg:
      image: forset
      transition: fade
      duration: 0
  - Still playing
`

// The declared file, as a scene-sized rectangle put straight into the renderer's image loader, so
// the background renders without a network fetch.
const registerTestBackground = async (renderer: DomRenderer): Promise<void> => {
  const canvas = document.createElement("canvas")
  canvas.width = SCENE_WIDTH
  canvas.height = SCENE_HEIGHT
  const ctx = canvas.getContext("2d")
  if (ctx === null) throw new Error("No 2d canvas context")
  ctx.fillStyle = `rgb(${BG_COLOR.join(",")})`
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const img = new Image()
  img.src = canvas.toDataURL()
  await img.decode()
  const assets = renderer["imageLoader"]["assets"] as Record<string, HTMLImageElement>
  assets["backgrounds/a.png"] = img
}

// What the scene is actually painted with, read off the canvas the background renderer owns.
const paintedBackground = (root: HTMLDivElement): number[] => {
  const canvas = root.querySelector("#vn-background-renderer") as HTMLCanvasElement
  const ctx = canvas.getContext("2d")
  if (ctx === null) throw new Error("No 2d canvas context")
  const { data } = ctx.getImageData(SCENE_WIDTH / 2, SCENE_HEIGHT / 2, 1, 1)
  return [data[0], data[1], data[2]]
}

describe("a background the manifest does not declare", () => {
  it("is reported, leaves the background that is up alone, and does not stop the story", async () => {
    const started = await startVnWithErrors(script, { manifest: MANIFEST })
    await registerTestBackground(started.renderer)

    expect(started.errors.map((e) => e.message)).toEqual(["No background is declared as forset"])

    await advanceVn(started)
    expect(textBoxText(started.root)).toBe("The declared background is up")
    expect(paintedBackground(started.root)).toEqual(BG_COLOR)

    // Past the undeclared one: the frame is unchanged, the line after it is said, and the render
    // came to rest rather than throwing.
    await advanceVn(started)
    expect(textBoxText(started.root)).toBe("Still playing")
    expect(paintedBackground(started.root)).toEqual(BG_COLOR)
    expect(started.player.state.animatableState.background.image).toBe("a")
  })
})
