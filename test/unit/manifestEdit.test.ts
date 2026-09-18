import { describe, expect, it } from "vitest"
import { declareAsset, undeclareAsset } from "../../src/yamlParser/manifestEdit"

// The asset panel's two manifest writes, as text. **Textual, never parse-mutate-restringify**: a
// round trip through the parser eats the author's comments, which is the same reason the `?vn=`
// payload carries the raw buffer.

const HEAD = "formatVersion: 1\nid: keeper\ntitle: The Keeper\n"

// What the caller does with a refusal is its own business; what this asserts is that nothing was
// mangled on the way to one.
const edited = (result: ReturnType<typeof declareAsset>): string => {
  if (result.kind === "refused") throw new Error("refused: " + result.problem)
  return result.text
}

const problem = (result: ReturnType<typeof declareAsset>): string => {
  if (result.kind === "edited") throw new Error("expected a refusal, got:\n" + result.text)
  return result.problem
}

describe("declareAsset", () => {
  it("adds a background under an existing group, at its children's own indent", () => {
    const text = HEAD + "backgrounds:\n  cliffs: cliffs.png\n"
    expect(edited(declareAsset(text, { kind: "background", id: "jetty", file: "jetty.png" }))).toBe(
      HEAD + "backgrounds:\n  cliffs: cliffs.png\n  jetty: jetty.png\n"
    )
  })

  it("keeps the comments around what it edits", () => {
    const text = HEAD + "# the art\nbackgrounds:\n  cliffs: cliffs.png # the first one\n"
    expect(edited(declareAsset(text, { kind: "background", id: "jetty", file: "jetty.png" }))).toBe(
      HEAD + "# the art\nbackgrounds:\n  cliffs: cliffs.png # the first one\n  jetty: jetty.png\n"
    )
  })

  it("follows an unusual indent rather than imposing two spaces", () => {
    const text = HEAD + "backgrounds:\n    cliffs: cliffs.png\n"
    expect(edited(declareAsset(text, { kind: "background", id: "jetty", file: "jetty.png" }))).toBe(
      HEAD + "backgrounds:\n    cliffs: cliffs.png\n    jetty: jetty.png\n"
    )
  })

  // A comment sits wherever its author put it. One at column 0 under the group is the dangerous case:
  // an entry written at the group's own indent is a *sibling* of the group, and an unknown top-level
  // key is stripped rather than rejected - so the author would be told the asset was added and
  // nothing would declare it.
  it("takes its indent from the group's entries and not from a comment among them", () => {
    const text = HEAD + "backgrounds:\n# a note\n  cliffs: cliffs.png\n"
    expect(edited(declareAsset(text, { kind: "background", id: "jetty", file: "jetty.png" }))).toBe(
      HEAD + "backgrounds:\n# a note\n  cliffs: cliffs.png\n  jetty: jetty.png\n"
    )
  })

  // An empty group's located lines are its key alone - a trailing comment is not part of its node -
  // so the entry goes directly under the key and the comment stays exactly where its author left it.
  it("indents past a group whose only company is a comment", () => {
    const text = HEAD + "backgrounds:\n# nothing yet\n"
    expect(edited(declareAsset(text, { kind: "background", id: "jetty", file: "jetty.png" }))).toBe(
      HEAD + "backgrounds:\n  jetty: jetty.png\n# nothing yet\n"
    )
  })

  it("adds the first child of an empty group at one indent step in", () => {
    const text = HEAD + "backgrounds:\naudioAssets:\n  waves: waves.ogg\n"
    expect(edited(declareAsset(text, { kind: "background", id: "jetty", file: "jetty.png" }))).toBe(
      HEAD + "backgrounds:\n  jetty: jetty.png\naudioAssets:\n  waves: waves.ogg\n"
    )
  })

  // What a project straight out of `mintProject` looks like: formatVersion, id, title and nothing
  // else.
  it("appends the group when the manifest does not declare it at all", () => {
    expect(edited(declareAsset(HEAD, { kind: "background", id: "jetty", file: "jetty.png" }))).toBe(
      HEAD + "backgrounds:\n  jetty: jetty.png\n"
    )
  })

  it("adds an audio asset as a bare filename, which is what an entry with no metadata is", () => {
    expect(edited(declareAsset(HEAD, { kind: "audio", id: "waves", file: "waves.ogg" }))).toBe(
      HEAD + "audioAssets:\n  waves: waves.ogg\n"
    )
  })

  it("adds a sprite under an actor that already declares some", () => {
    const text = HEAD + "actors:\n  Keeper:\n    sprites:\n      idle: idle.png\n"
    expect(edited(declareAsset(text, { kind: "sprite", actor: "Keeper", id: "worried", file: "worried.png" }))).toBe(
      HEAD + "actors:\n  Keeper:\n    sprites:\n      idle: idle.png\n      worried: worried.png\n"
    )
  })

  it("mints the sprites map for an actor that has none yet, under whatever else it declares", () => {
    const text = HEAD + "actors:\n  Keeper:\n    textColor: white\n"
    expect(edited(declareAsset(text, { kind: "sprite", actor: "Keeper", id: "idle", file: "idle.png" }))).toBe(
      HEAD + "actors:\n  Keeper:\n    textColor: white\n    sprites:\n      idle: idle.png\n"
    )
  })

  it("mints the sprites map for an actor declared with no body at all", () => {
    const text = HEAD + "actors:\n  Keeper:\n"
    expect(edited(declareAsset(text, { kind: "sprite", actor: "Keeper", id: "idle", file: "idle.png" }))).toBe(
      HEAD + "actors:\n  Keeper:\n    sprites:\n      idle: idle.png\n"
    )
  })

  it("mints the actor as well when the sprite belongs to one nobody has cast", () => {
    const text = HEAD + "actors:\n  Keeper:\n    sprites:\n      idle: idle.png\n"
    expect(edited(declareAsset(text, { kind: "sprite", actor: "Fisher", id: "idle", file: "idle.png" }))).toBe(
      HEAD + "actors:\n  Keeper:\n    sprites:\n      idle: idle.png\n  Fisher:\n    sprites:\n      idle: idle.png\n"
    )
  })

  it("appends actors, the actor and its sprites map when the manifest declares no actors", () => {
    expect(edited(declareAsset(HEAD, { kind: "sprite", actor: "Keeper", id: "idle", file: "idle.png" }))).toBe(
      HEAD + "actors:\n  Keeper:\n    sprites:\n      idle: idle.png\n"
    )
  })

  // `validateProjectId` accepts `true`, and YAML reads it as a scalar - the same trap `mintProject`
  // serialises rather than interpolates to avoid. An asset id is any non-empty string, so this one
  // has more ways to go wrong, not fewer.
  it("serialises rather than interpolates, so an id YAML would read as a scalar is quoted", () => {
    expect(edited(declareAsset(HEAD, { kind: "background", id: "true", file: "yes.png" }))).toBe(
      HEAD + 'backgrounds:\n  "true": yes.png\n'
    )
  })

  it("quotes a filename that would otherwise change meaning", () => {
    expect(edited(declareAsset(HEAD, { kind: "background", id: "odd", file: "a: b.png" }))).toBe(
      HEAD + 'backgrounds:\n  odd: "a: b.png"\n'
    )
  })

  it("never folds a long value onto a second line", () => {
    const file = "a".repeat(120) + ".png"
    expect(edited(declareAsset(HEAD, { kind: "background", id: "long", file }))).toBe(
      HEAD + `backgrounds:\n  long: ${file}\n`
    )
  })

  it("adds the trailing newline a manifest without one is missing", () => {
    expect(
      edited(declareAsset("formatVersion: 1\nid: k\ntitle: K", { kind: "background", id: "a", file: "a.png" }))
    ).toBe("formatVersion: 1\nid: k\ntitle: K\nbackgrounds:\n  a: a.png\n")
  })

  // `editor.ts`'s revert guard, carried across: the locator answers "which line is this key on",
  // which is not the same question as "may I write on that line".
  it("refuses a flow-style manifest rather than mangling it", () => {
    const text = "{formatVersion: 1, id: k, title: K}\n"
    expect(problem(declareAsset(text, { kind: "background", id: "a", file: "a.png" }))).toContain("one line")
  })

  it("refuses a group whose value shares its line", () => {
    const text = HEAD + "backgrounds: {cliffs: cliffs.png}\n"
    expect(problem(declareAsset(text, { kind: "background", id: "jetty", file: "jetty.png" }))).toContain(
      "backgrounds:"
    )
  })

  it("refuses an actor whose value shares its line", () => {
    const text = HEAD + "actors:\n  Keeper: {textColor: white}\n"
    expect(problem(declareAsset(text, { kind: "sprite", actor: "Keeper", id: "idle", file: "idle.png" }))).toContain(
      "Keeper:"
    )
  })

  it("refuses a manifest that is not a mapping at all", () => {
    expect(problem(declareAsset("- a\n- b\n", { kind: "background", id: "a", file: "a.png" }))).toContain("mapping")
  })
})

describe("undeclareAsset", () => {
  it("takes one line out and leaves the rest of the group alone", () => {
    const text = HEAD + "backgrounds:\n  cliffs: cliffs.png\n  jetty: jetty.png\n"
    expect(edited(undeclareAsset(text, ["backgrounds", "cliffs"]))).toBe(HEAD + "backgrounds:\n  jetty: jetty.png\n")
  })

  // An empty `backgrounds:` parses: a key with nothing under it is null, and the schema reads
  // declaring nothing and declaring emptiness as the same statement.
  it("leaves the group standing and empty when its last entry goes", () => {
    const text = HEAD + "backgrounds:\n  cliffs: cliffs.png\n"
    expect(edited(undeclareAsset(text, ["backgrounds", "cliffs"]))).toBe(HEAD + "backgrounds:\n")
  })

  it("takes a sprite out from under its actor", () => {
    const text = HEAD + "actors:\n  Keeper:\n    sprites:\n      idle: idle.png\n      worried: worried.png\n"
    expect(edited(undeclareAsset(text, ["actors", "Keeper", "sprites", "worried"]))).toBe(
      HEAD + "actors:\n  Keeper:\n    sprites:\n      idle: idle.png\n"
    )
  })

  it("takes a whole multi-line entry, not only the line its key is on", () => {
    const text = HEAD + "audioAssets:\n  waves:\n    file: waves.ogg\n    artist: a544jh\n  hum: hum.ogg\n"
    expect(edited(undeclareAsset(text, ["audioAssets", "waves"]))).toBe(HEAD + "audioAssets:\n  hum: hum.ogg\n")
  })

  it("refuses a declaration that shares its line with anything else", () => {
    const text = HEAD + "backgrounds: {cliffs: cliffs.png}\n"
    expect(problem(undeclareAsset(text, ["backgrounds", "cliffs"]))).toContain("cliffs:")
  })

  // Left standing and empty, like a top-level group - and `actorSchema.sprites` is wrapped in
  // `declared` for exactly this shape, which is what stops the removal making a manifest that does
  // not parse after the file has already been deleted.
  it("leaves an actor's sprites map standing and empty when its last sprite goes", () => {
    const text = HEAD + "actors:\n  Keeper:\n    sprites:\n      idle: idle.png\n"
    expect(edited(undeclareAsset(text, ["actors", "Keeper", "sprites", "idle"]))).toBe(
      HEAD + "actors:\n  Keeper:\n    sprites:\n"
    )
  })

  it("refuses a key the manifest does not declare", () => {
    expect(problem(undeclareAsset(HEAD + "backgrounds:\n  a: a.png\n", ["backgrounds", "b"]))).toContain("b")
  })
})
