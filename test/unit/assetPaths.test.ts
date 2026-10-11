import { describe, expect, it } from "vitest"
import {
  audioAssetPath,
  audioFilePath,
  backgroundAssetPath,
  backgroundFilePath,
  belowAssets,
  declaredFilePath,
  locateAsset,
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
    expect(audioAssetPath(audioAssets, "daylight")).toBe("assets/audio/bgm/dayl.ogg")
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
    expect(backgroundAssetPath(backgrounds, "classroom")).toBe("assets/backgrounds/a.png")
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
    expect(spriteAssetPath(actors, instance("A1", "happy"))).toBe("assets/sprites/A1/a1_happy.png")
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
    expect(spriteFilePath("A2", "idle.png")).toBe("assets/sprites/A2/idle.png")
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

// The layout read backwards, which the asset panel's undeclared files sort by.
describe("locateAsset", () => {
  it("reads a background, an audio file and an actor's sprite back off their paths", () => {
    expect(locateAsset("assets/backgrounds/old/a.png")).toEqual({ kind: "background", file: "old/a.png" })
    expect(locateAsset("assets/audio/bgm/dayl.ogg")).toEqual({ kind: "audio", file: "bgm/dayl.ogg" })
    expect(locateAsset("assets/sprites/A1/poses/happy.png")).toEqual({
      kind: "sprite",
      actor: "A1",
      file: "poses/happy.png",
    })
  })

  it("is the inverse of declaredFilePath", () => {
    for (const path of ["assets/backgrounds/a.png", "assets/audio/x.ogg", "assets/sprites/A1/a.png"]) {
      const location = locateAsset(path)
      if (location === null) throw new Error(`${path} should locate`)
      expect(declaredFilePath({ ...location, id: "any" })).toBe(path)
    }
  })

  it("locates nothing outside the three folders, or straight under sprites/", () => {
    expect(locateAsset("assets/notes.txt")).toBeNull()
    expect(locateAsset("assets/sprites/a.png")).toBeNull()
    expect(locateAsset("assets/drafts/a.png")).toBeNull()
    expect(locateAsset("manifest.yaml")).toBeNull()
  })
})

describe("belowAssets", () => {
  it("is the path below assets/, or null above it", () => {
    expect(belowAssets("assets/notes.txt")).toBe("notes.txt")
    expect(belowAssets("script.yaml")).toBeNull()
    expect(belowAssets("assets/")).toBeNull()
  })
})
