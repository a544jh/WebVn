import { describe, expect, it } from "vitest"
import { DomRenderer } from "../../src/domRenderer/DomRenderer"
import { VnManifest } from "../../src/core/manifest"
import { advanceVn, liveSprites, startVn, startVnWithErrors, textBoxText } from "../helpers/vnHarness"

// A sprite instance's id is what a `show` writes to and a `hide` takes back, and it defaults to the
// actor. Two ids for one actor put that actor on screen twice - which the sprite map, keyed by
// actor, made impossible before.

const MANIFEST: VnManifest = {
  id: "sprite-ids",
  title: "Sprite Ids",
  actors: { Jenny: { sprites: { happy: "a.png", sad: "b.png" } } },
  backgrounds: {},
  audioAssets: {},
}

const SPRITE_COLORS: Record<string, string> = { "sprites/Jenny/a.png": "#9b59b6", "sprites/Jenny/b.png": "#2980b9" }

// A coloured rectangle per declared file, put straight into the renderer's image loader so the
// sprites render without a network fetch. dataset.testAsset survives cloneNode.
const registerTestSprites = async (renderer: DomRenderer): Promise<void> => {
  const assets = renderer["imageLoader"]["assets"] as Record<string, HTMLImageElement>
  for (const path in SPRITE_COLORS) {
    const canvas = document.createElement("canvas")
    canvas.width = 220
    canvas.height = 480
    const ctx = canvas.getContext("2d")
    if (ctx === null) throw new Error("No 2d canvas context")
    ctx.fillStyle = SPRITE_COLORS[path]
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const img = new Image()
    img.src = canvas.toDataURL()
    img.dataset.testAsset = path
    await img.decode()
    assets[path] = img
  }
}

const script = `
story:
  - Before anyone is shown
  - show:
      actor: Jenny
      sprite: happy
  - show:
      id: jenny-twin
      actor: Jenny
      sprite: sad
      x: 0.2
  - Two of her
  - hide: jenny-twin
  - Just the one again
  - hide: Jenny
  - Nobody
`

// A declared sprite name is checkable against the manifest, unlike an instance id, so an unknown one
// is the manifest and the script disagreeing - reported at parse time, and the `show` that named it
// neutralized, rather than swallowed or thrown several scenes later.
const undeclaredScript = `
story:
  - Before anyone is shown
  - show:
      actor: Jenny
      sprite: happy
  - She changes
  - show:
      actor: Jenny
      sprite: furious
  - Still here
`

describe("sprite ids", () => {
  it("shows one actor twice, hides each instance by its own id, and resolves declared names", async () => {
    const started = await startVn(script, { manifest: MANIFEST })
    await registerTestSprites(started.renderer)

    await advanceVn(started)
    const both = liveSprites(started.root)
    expect(Object.keys(both).sort()).toEqual(["Jenny", "jenny-twin"])
    // The script names declared sprites; the manifest is what says which file each one is.
    expect(both["Jenny"].dataset.testAsset).toBe("sprites/Jenny/a.png")
    expect(both["jenny-twin"].dataset.testAsset).toBe("sprites/Jenny/b.png")

    await advanceVn(started)
    expect(Object.keys(liveSprites(started.root))).toEqual(["Jenny"])

    await advanceVn(started)
    expect(liveSprites(started.root)).toEqual({})
  })

  it("reports a sprite name the actor does not declare, and leaves the one that is showing", async () => {
    const started = await startVnWithErrors(undeclaredScript, { manifest: MANIFEST })
    await registerTestSprites(started.renderer)

    expect(started.errors.map((e) => e.message)).toEqual(["Actor Jenny declares no sprite named furious"])

    await advanceVn(started)
    expect(liveSprites(started.root)["Jenny"].dataset.testAsset).toBe("sprites/Jenny/a.png")

    // Past the undeclared name. A render that throws never comes to rest, so the stop advanceVn
    // waits for is also the proof that this one did not - which is what it did before the parser
    // started checking the ids a script names.
    await advanceVn(started)
    expect(textBoxText(started.root)).toBe("Still here")
    expect(liveSprites(started.root)["Jenny"].dataset.testAsset).toBe("sprites/Jenny/a.png")
  })
})
