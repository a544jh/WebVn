import { describe, expect, it } from "vitest"
import { seedState } from "../../src/core/manifest"
import { declaredGroups, declaredLeaf, declaresActor, leafKey } from "../../src/editor/declarations"
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

// The one rule for whether the manifest declares an actor: the cast the walk draws, the undeclared
// sprite folders drawn beside it, and whether Declare says it is declaring the actor too.
describe("declaresActor", () => {
  it("is true for an actor the manifest declares, sprites or not", () => {
    expect(declaresActor(seeded({ actors: { Keeper: { textColor: "red" } } }), "Keeper")).toBe(true)
  })

  it("is false for an actor nobody declared", () => {
    expect(declaresActor(seeded({}), "Ghost")).toBe(false)
  })

  // `seedActors` puts both into every state; the manifest declares them only by declaring a sprite.
  it("counts the engine's own two only once they declare sprites", () => {
    expect(declaresActor(seeded({}), "narrator")).toBe(false)
    expect(declaresActor(seeded({}), "default")).toBe(false)
    expect(declaresActor(seeded({ actors: { narrator: { sprites: { idle: "n.png" } } } }), "narrator")).toBe(true)
  })
})

describe("declaredLeaf", () => {
  const state = seeded({
    backgrounds: { cliffs: "cliffs.png" },
    audioAssets: { waves: { file: "waves.ogg" } },
    actors: { Keeper: { sprites: { idle: "idle.png" } } },
  })

  it("finds the row declaring an id in its own group, with its file and key", () => {
    expect(declaredLeaf(state, { kind: "background", id: "cliffs", file: "x.png" })).toMatchObject({
      file: "cliffs.png",
      manifestKey: ["backgrounds", "cliffs"],
    })
    expect(declaredLeaf(state, { kind: "audio", id: "waves", file: "x.ogg" })?.file).toBe("waves.ogg")
    expect(declaredLeaf(state, { kind: "sprite", actor: "Keeper", id: "idle", file: "x.png" })?.manifestKey).toEqual([
      "actors",
      "Keeper",
      "sprites",
      "idle",
    ])
  })

  it("finds nothing for an id another group or another actor declares", () => {
    expect(declaredLeaf(state, { kind: "audio", id: "cliffs", file: "x.ogg" })).toBeUndefined()
    expect(declaredLeaf(state, { kind: "sprite", actor: "Ghost", id: "idle", file: "x.png" })).toBeUndefined()
  })
})
