import { describe, expect, it } from "vitest"
import { seedState } from "../../src/core/manifest"
import { declarationOf, groupNames, nothingUndeclared, undeclaredFiles } from "../../src/editor/undeclaredFiles"
import { TEST_MANIFEST } from "../helpers/testManifest"

// Which files under `assets/` no declaration points at, and which group of the asset panel each one
// is drawn in. Every bullet under "Where the rows go" in `.scratch/asset-panel/issues/06` is a case
// here, because this is the one place those rules are written down as code.

const seeded = (declarations: Partial<typeof TEST_MANIFEST>) => seedState({ ...TEST_MANIFEST, ...declarations })

describe("undeclaredFiles", () => {
  it("leaves out every file a declaration points at", () => {
    const state = seeded({
      backgrounds: { cliffs: "cliffs.png" },
      audioAssets: { waves: { file: "waves.ogg" } },
      actors: { Keeper: { sprites: { idle: "idle.png" } } },
    })
    const listing = ["assets/backgrounds/cliffs.png", "assets/audio/waves.ogg", "assets/sprites/Keeper/idle.png"]
    expect(nothingUndeclared(undeclaredFiles(listing, state))).toBe(true)
  })

  // The project describing itself, and where the storer writes - which is where a `.crswap` turns up.
  it("lists nothing outside assets/", () => {
    const listing = ["manifest.yaml", "script.yaml", "script.yaml.crswap", "notes.txt", "drafts/x.png"]
    expect(nothingUndeclared(undeclaredFiles(listing, seeded({})))).toBe(true)
  })

  it("puts a file under backgrounds/ in Backgrounds, as a background it could be declared as", () => {
    const { backgrounds } = undeclaredFiles(["assets/backgrounds/storm.png"], seeded({}))
    expect(backgrounds).toEqual([
      { path: "assets/backgrounds/storm.png", name: "storm.png", declares: { kind: "background", file: "storm.png" } },
    ])
  })

  it("puts a file under audio/ in Audio", () => {
    const { audio } = undeclaredFiles(["assets/audio/gulls.ogg"], seeded({}))
    expect(audio).toEqual([
      { path: "assets/audio/gulls.ogg", name: "gulls.ogg", declares: { kind: "audio", file: "gulls.ogg" } },
    ])
  })

  // A `file:` may carry a slash, so a nested file is still one a declaration could name.
  it("keeps a nested path in its folder's group, named from below the folder", () => {
    const { backgrounds, other } = undeclaredFiles(["assets/backgrounds/old/cliffs.png"], seeded({}))
    expect(other).toEqual([])
    expect(backgrounds).toEqual([
      {
        path: "assets/backgrounds/old/cliffs.png",
        name: "old/cliffs.png",
        declares: { kind: "background", file: "old/cliffs.png" },
      },
    ])
  })

  it("puts a sprite under the actor whose folder it is in, and says the actor is cast", () => {
    const state = seeded({ actors: { Keeper: { sprites: { idle: "idle.png" } } } })
    const { sprites } = undeclaredFiles(["assets/sprites/Keeper/scared.png"], state)
    expect(sprites).toEqual([
      {
        actor: "Keeper",
        cast: true,
        files: [
          {
            path: "assets/sprites/Keeper/scared.png",
            name: "scared.png",
            declares: { kind: "sprite", actor: "Keeper", file: "scared.png" },
          },
        ],
      },
    ])
  })

  it("gives a folder no actor is declared for a branch of its own that is not cast", () => {
    const { sprites } = undeclaredFiles(["assets/sprites/Ghost/idle.png"], seeded({}))
    expect(sprites.map(({ actor, cast }) => ({ actor, cast }))).toEqual([{ actor: "Ghost", cast: false }])
    // Still declarable: Declare declares the actor too.
    expect(sprites[0].files[0].declares).toEqual({ kind: "sprite", actor: "Ghost", file: "idle.png" })
  })

  // `seedActors` puts both into every state, so the engine's two are cast whether or not the
  // manifest mentions them.
  it("counts the engine's own actors as cast", () => {
    const { sprites } = undeclaredFiles(["assets/sprites/narrator/n.png"], seeded({}))
    expect(sprites.map(({ actor, cast }) => ({ actor, cast }))).toEqual([{ actor: "narrator", cast: true }])
    expect(sprites[0].files[0].declares).not.toBeNull()
  })

  // The casing rule: a lowercase actor is one no `Name: "text"` line can speak as, so no declaration
  // could ever point into its folder.
  it("draws a folder no actor could be called, and offers no Declare in it", () => {
    const { sprites } = undeclaredFiles(["assets/sprites/ghost/idle.png"], seeded({}))
    expect(sprites).toEqual([
      {
        actor: "ghost",
        cast: false,
        files: [{ path: "assets/sprites/ghost/idle.png", name: "idle.png", declares: null }],
      },
    ])
  })

  it("puts what no group answers in Other files, named from below assets/, with no Declare", () => {
    const { other } = undeclaredFiles(["assets/notes.txt", "assets/sprites/lamp-glow.png"], seeded({}))
    expect(other).toEqual([
      { path: "assets/notes.txt", name: "notes.txt", declares: null },
      { path: "assets/sprites/lamp-glow.png", name: "sprites/lamp-glow.png", declares: null },
    ])
  })

  // A listing is a Set off a directory walk, which has no order the standard promises - and Chromium's
  // is descending by name.
  it("sorts files by path and actor folders by name, whatever order the listing came in", () => {
    const files = undeclaredFiles(
      [
        "assets/sprites/Zed/b.png",
        "assets/backgrounds/storm.png",
        "assets/sprites/Ghost/z.png",
        "assets/backgrounds/old/a.png",
        "assets/sprites/Ghost/a.png",
      ],
      seeded({})
    )
    expect(files.backgrounds.map((file) => file.name)).toEqual(["old/a.png", "storm.png"])
    expect(files.sprites.map((folder) => folder.actor)).toEqual(["Ghost", "Zed"])
    expect(files.sprites[0].files.map((file) => file.name)).toEqual(["a.png", "z.png"])
  })

  // The commonest way in: `file:` edited by hand. The declaration is missing its file - that is the
  // loader's to report - and the file it used to name is undeclared.
  it("lists the file a declaration used to name once the declaration names another", () => {
    const state = seeded({ backgrounds: { storm: "storm-night.png" } })
    const { backgrounds } = undeclaredFiles(["assets/backgrounds/storm.png"], state)
    expect(backgrounds.map((file) => file.path)).toEqual(["assets/backgrounds/storm.png"])
  })
})

describe("declarationOf", () => {
  it("is what the path fixes plus the id the author gave", () => {
    expect(declarationOf({ kind: "background", file: "old/cliffs.png" }, "sketch")).toEqual({
      kind: "background",
      id: "sketch",
      file: "old/cliffs.png",
    })
    expect(declarationOf({ kind: "sprite", actor: "Ghost", file: "idle.png" }, "idle")).toEqual({
      kind: "sprite",
      actor: "Ghost",
      id: "idle",
      file: "idle.png",
    })
  })
})

describe("groupNames", () => {
  it("names the group each undeclared file's row is under", () => {
    const names = groupNames(
      undeclaredFiles(
        ["assets/backgrounds/storm.png", "assets/audio/gulls.ogg", "assets/sprites/Ghost/idle.png"],
        seeded({})
      )
    )
    expect(names.get("assets/backgrounds/storm.png")).toBe("Backgrounds")
    expect(names.get("assets/audio/gulls.ogg")).toBe("Audio")
    expect(names.get("assets/sprites/Ghost/idle.png")).toBe("Ghost")
  })
})
