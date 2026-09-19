import { describe, expect, it } from "vitest"
import { seedState } from "../../src/core/manifest"
import { declaredGroups, leafKey } from "../../src/editor/declarations"
import { TEST_MANIFEST } from "../helpers/testManifest"

// What a project declares, in the manifest's own shape. The asset panel draws this and
// design-docs/EDITOR.md's completions are meant to read it, so it is pinned here rather than only
// through the DOM the panel builds out of it.

const seeded = (declarations: Partial<typeof TEST_MANIFEST>) => seedState({ ...TEST_MANIFEST, ...declarations })

describe("declaredGroups", () => {
  it("always yields the manifest's three groups, in the order a project is read in", () => {
    expect(declaredGroups(seeded({})).map((group) => group.key)).toEqual(["backgrounds", "audioAssets", "actors"])
  })

  it("carries each background's id, file and path", () => {
    const [backgrounds] = declaredGroups(seeded({ backgrounds: { cliffs: "cliffs.png" } }))
    expect(backgrounds.leaves).toEqual([
      {
        kind: "background",
        id: "cliffs",
        file: "cliffs.png",
        path: "assets/backgrounds/cliffs.png",
        manifestKey: ["backgrounds", "cliffs"],
      },
    ])
  })

  it("carries an audio asset's file out of its entry rather than the entry itself", () => {
    const [, audio] = declaredGroups(seeded({ audioAssets: { waves: { file: "waves.ogg", title: "Waves" } } }))
    expect(audio.leaves).toEqual([
      {
        kind: "audio",
        id: "waves",
        file: "waves.ogg",
        path: "assets/audio/waves.ogg",
        manifestKey: ["audioAssets", "waves"],
      },
    ])
  })

  it("nests an actor's sprites one level under it, and carries whose they are", () => {
    const [, , actors] = declaredGroups(seeded({ actors: { Keeper: { sprites: { idle: "idle.png" } } } }))
    expect(actors.leaves).toEqual([])
    expect(actors.branches).toEqual([
      {
        key: "actors/Keeper",
        name: "Keeper",
        branches: [],
        leaves: [
          {
            kind: "sprite",
            actor: "Keeper",
            id: "idle",
            file: "idle.png",
            path: "assets/sprites/Keeper/idle.png",
            manifestKey: ["actors", "Keeper", "sprites", "idle"],
          },
        ],
      },
    ])
  })

  // seedActors adds both on every boot, so a panel reading the state rather than the manifest would
  // otherwise draw two rows an author never wrote and cannot act on.
  it("leaves out the engine's own two actors when they declare no sprites", () => {
    const [, , actors] = declaredGroups(seeded({ actors: {} }))
    expect(actors.branches).toEqual([])
  })

  // The exception, and it is the manifest's to make: a narrator an author gave sprites to is one
  // they declared.
  it("keeps an engine actor that does declare sprites", () => {
    const [, , actors] = declaredGroups(seeded({ actors: { narrator: { sprites: { idle: "n.png" } } } }))
    expect(actors.branches.map((branch) => branch.name)).toEqual(["narrator"])
  })

  it("keeps a declared actor with no sprites yet, which is where its first one will go", () => {
    const [, , actors] = declaredGroups(seeded({ actors: { Keeper: { textColor: "red" } } }))
    expect(actors.branches.map((branch) => branch.name)).toEqual(["Keeper"])
    expect(actors.branches[0].leaves).toEqual([])
  })

  it("keeps the manifest's own order", () => {
    const [backgrounds] = declaredGroups(seeded({ backgrounds: { b: "b.png", a: "a.png", c: "c.png" } }))
    expect(backgrounds.leaves.map((leaf) => leaf.id)).toEqual(["b", "a", "c"])
  })
})

describe("leafKey", () => {
  // The key a row is found by and a failed load is matched on. Two ids may name one file, so the
  // manifest key rather than the path is what identifies a row.
  it("is the manifest key path", () => {
    expect(leafKey(["actors", "Keeper", "sprites", "idle"])).toBe("actors/Keeper/sprites/idle")
  })
})
