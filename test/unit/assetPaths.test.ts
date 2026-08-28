import { describe, expect, it } from "vitest"
import {
  audioAssetPath,
  audioFilePath,
  backgroundAssetPath,
  backgroundFilePath,
  spriteAssetPath,
  spriteFilePath,
} from "../../src/domRenderer/assetPaths"
import { Actor, AudioAsset, isBackgroundColor, SpriteInstance } from "../../src/core/state"

// The one place an asset id becomes a path. Both the renderers and DomRenderer.loadAssets go
// through it, so what is preloaded and what is looked up can never drift apart.

const actors: Record<string, Actor> = {
  A1: { sprites: { happy: "a1_happy.png", sad: "a1_sad.png" } },
  A2: {},
}

const audioAssets: Record<string, AudioAsset> = {
  daylight: { file: "bgm/dayl.ogg", title: "Daylight" },
  bigthump: { file: "sfx/bigthump.ogg" },
}

const backgrounds: Record<string, string> = { classroom: "a.png" }

const instance = (actor: string, sprite: string): SpriteInstance => ({
  actor,
  sprite,
  x: 0.5,
  y: 0.5,
  anchorX: 0.5,
  anchorY: 0.5,
})

describe("audioAssetPath", () => {
  it("resolves an id to the file the manifest declared for it", () => {
    expect(audioAssetPath(audioAssets, "daylight")).toBe("audio/bgm/dayl.ogg")
  })

  // Preloading walks the declarations, so it has files rather than ids. Both halves must agree on
  // the directory, which is why one is defined in terms of the other.
  it("agrees with the path preloading registers for the same file", () => {
    expect(audioAssetPath(audioAssets, "daylight")).toBe(audioFilePath("bgm/dayl.ogg"))
  })

  it("yields nothing for an id nothing declares", () => {
    expect(audioAssetPath(audioAssets, "nocturne")).toBeUndefined()
  })
})

describe("backgroundAssetPath", () => {
  it("resolves an id to the file the manifest declared for it", () => {
    expect(backgroundAssetPath(backgrounds, "classroom")).toBe("backgrounds/a.png")
  })

  it("agrees with the path preloading registers for the same file", () => {
    expect(backgroundAssetPath(backgrounds, "classroom")).toBe(backgroundFilePath("a.png"))
  })

  it("yields nothing for an id nothing declares", () => {
    expect(backgroundAssetPath(backgrounds, "hallway")).toBeUndefined()
  })
})

describe("spriteAssetPath", () => {
  it("resolves an actor's declared sprite name to their file", () => {
    expect(spriteAssetPath(actors, instance("A1", "happy"))).toBe("sprites/A1/a1_happy.png")
  })

  it("yields nothing for a name the actor does not declare", () => {
    expect(spriteAssetPath(actors, instance("A1", "furious"))).toBeUndefined()
  })

  it("yields nothing for an actor who declares no sprites at all", () => {
    expect(spriteAssetPath(actors, instance("A2", "happy"))).toBeUndefined()
  })

  it("yields nothing for an actor the manifest never declared", () => {
    expect(spriteAssetPath(actors, instance("A9", "happy"))).toBeUndefined()
  })

  // Two actors may declare the same filename; the actor's own directory is what keeps them apart.
  it("files a sprite under its own actor", () => {
    expect(spriteFilePath("A2", "idle.png")).toBe("sprites/A2/idle.png")
  })

  it("agrees with the path preloading registers for the same file", () => {
    expect(spriteAssetPath(actors, instance("A1", "happy"))).toBe(spriteFilePath("A1", "a1_happy.png"))
  })
})

// The one statement of the id-or-colour split, which the background renderer used to make in three
// places.
describe("isBackgroundColor", () => {
  it.each(["#000000", "#fff"])("reads %s as a colour", (image) => {
    expect(isBackgroundColor(image)).toBe(true)
  })

  it.each(["classroom", "a.png", ""])("reads %s as an asset id", (image) => {
    expect(isBackgroundColor(image)).toBe(false)
  })
})
