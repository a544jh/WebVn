import { describe, expect, it } from "vitest"
import { DomRenderer } from "../../src/domRenderer/DomRenderer"
import { VnManifest } from "../../src/core/manifest"
import { liveSprites, nextStop, settle, StartedVn, startVn } from "../helpers/vnHarness"

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

const advance = async (started: StartedVn): Promise<void> => {
  const stop = nextStop(started.renderer, started.player)
  started.renderer.advance()
  await stop
}

// A declared sprite name is checkable against the manifest, unlike an instance id, so an unknown one
// is the manifest and the script disagreeing and is reported rather than swallowed.
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

    await advance(started)
    const both = liveSprites(started.root)
    expect(Object.keys(both).sort()).toEqual(["Jenny", "jenny-twin"])
    // The script names declared sprites; the manifest is what says which file each one is.
    expect(both["Jenny"].dataset.testAsset).toBe("sprites/Jenny/a.png")
    expect(both["jenny-twin"].dataset.testAsset).toBe("sprites/Jenny/b.png")

    await advance(started)
    expect(Object.keys(liveSprites(started.root))).toEqual(["Jenny"])

    await advance(started)
    expect(liveSprites(started.root)).toEqual({})
  })

  it("reports a sprite name the actor does not declare, in place of one that is showing", async () => {
    const started = await startVn(undeclaredScript, { manifest: MANIFEST })
    await registerTestSprites(started.renderer)

    await advance(started)
    expect(Object.keys(liveSprites(started.root))).toEqual(["Jenny"])

    const thrown: string[] = []
    const onError = (e: ErrorEvent) => thrown.push(e.message)
    const onRejection = (e: PromiseRejectionEvent) => thrown.push(String(e.reason))
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)

    // The render throws, so it never comes to rest: a direct call rather than a wait on a stop that
    // will not arrive.
    started.renderer.advance()
    await settle()

    window.removeEventListener("error", onError)
    window.removeEventListener("unhandledrejection", onRejection)
    expect(thrown.join("\n")).toContain("Jenny declares no sprite named furious")
  })
})
