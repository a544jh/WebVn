import { describe, expect, it } from "vitest"
import { seedState } from "../../src/core/manifest"
import { VnPlayerState } from "../../src/core/state"
import { makeCommand } from "../helpers/commands"
import { TEST_MANIFEST } from "../helpers/testManifest"

// What `show` and `hide` key the on-screen sprites by. A sprite instance's id is Ren'Py's `as`:
// the identity of a thing on screen, one per key, defaulting to the actor - so an actor is shown
// once unless the script names further instances of them.

const show = (state: VnPlayerState, cmd: Record<string, unknown>): VnPlayerState =>
  makeCommand("show", cmd).apply(state)

const hide = (state: VnPlayerState, id: string): VnPlayerState => makeCommand("hide", id).apply(state)

const ids = (state: VnPlayerState): string[] => Object.keys(state.animatableState.sprites).sort()

describe("show", () => {
  it("keys a sprite by the actor when no id is given, so existing scripts key what they always did", () => {
    const state = show(seedState(TEST_MANIFEST), { actor: "Jenny", sprite: "happy" })

    expect(ids(state)).toEqual(["Jenny"])
    expect(state.animatableState.sprites.Jenny).toMatchObject({ actor: "Jenny", sprite: "happy" })
  })

  it("keys a sprite by its id when the script names one", () => {
    const state = show(seedState(TEST_MANIFEST), { id: "jenny-twin", actor: "Jenny", sprite: "sad" })

    expect(ids(state)).toEqual(["jenny-twin"])
    expect(state.animatableState.sprites["jenny-twin"]).toMatchObject({ actor: "Jenny", sprite: "sad" })
  })

  // The defect this fixes: the map was keyed by actor, so an actor could be on screen exactly once.
  it("puts one actor on screen twice under two ids", () => {
    let state = show(seedState(TEST_MANIFEST), { actor: "Jenny", sprite: "happy" })
    state = show(state, { id: "jenny-twin", actor: "Jenny", sprite: "sad", x: 0.2 })

    expect(ids(state)).toEqual(["Jenny", "jenny-twin"])
    expect(state.animatableState.sprites.Jenny.sprite).toBe("happy")
    expect(state.animatableState.sprites["jenny-twin"].sprite).toBe("sad")
  })

  it("replaces the sprite already under that id rather than adding another", () => {
    let state = show(seedState(TEST_MANIFEST), { actor: "Jenny", sprite: "happy" })
    state = show(state, { actor: "Jenny", sprite: "sad" })

    expect(ids(state)).toEqual(["Jenny"])
    expect(state.animatableState.sprites.Jenny.sprite).toBe("sad")
  })
})

// `hide` is untouched by the id change: it was always a key lookup, and only what the string means
// changed. Default and custom ids share one namespace, so there is no second form to add.
describe("hide", () => {
  it("removes the default sprite by the actor's name", () => {
    let state = show(seedState(TEST_MANIFEST), { actor: "Jenny", sprite: "happy" })
    state = hide(state, "Jenny")

    expect(ids(state)).toEqual([])
  })

  it("removes one instance of an actor and leaves the other", () => {
    let state = show(seedState(TEST_MANIFEST), { actor: "Jenny", sprite: "happy" })
    state = show(state, { id: "jenny-twin", actor: "Jenny", sprite: "sad" })
    state = hide(state, "jenny-twin")

    expect(ids(state)).toEqual(["Jenny"])
  })

  // Sprite ids are invented in the script, so nothing can validate them - a typo is a silent no-op
  // here, and it is the editor's job to surface it. See .scratch/sprites/.
  it("is a no-op on an id nothing is showing under", () => {
    const state = show(seedState(TEST_MANIFEST), { actor: "Jenny", sprite: "happy" })

    expect(ids(hide(state, "jenny-twni"))).toEqual(["Jenny"])
  })
})
