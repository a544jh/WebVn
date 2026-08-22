import { describe, expect, it } from "vitest"
import { initialState, VnPlayer } from "../../src/core/player"
import { State, VnPlayerState } from "../../src/core/state"
import { VnPath } from "../../src/core/vnPath"
import { Command } from "../../src/core/commands/Command"
import { Say } from "../../src/core/commands/text/Say"
import { Decision } from "../../src/core/commands/controlFlow/Decision"
import { Jump } from "../../src/core/commands/controlFlow/Jump"
import { Label, updateLabels } from "../../src/core/commands/controlFlow/Label"
import { ConsecutiveIntegerSet } from "../../src/lib/ConsecutiveIntegerSet"
import { loc, makeCommand } from "../helpers/commands"

const say = (text: string) => new Say(loc, "narrator", text)

const set = (args: unknown) => makeCommand("set", args)

function makeState(commands: Command[]): VnPlayerState {
  return updateLabels({ ...initialState, commands, seenCommands: new ConsecutiveIntegerSet() })
}

// Mirrors DomRenderer's render loop: keep advancing until the state wants an interaction.
// These auto-advances are not recorded in the path (VnPlayer only records advances made from a stop).
function autorun(player: VnPlayer): void {
  while (!player.state.stopAfterRender) player.advance()
}

// One user press of "advance"
function press(player: VnPlayer): void {
  player.advance()
  autorun(player)
}

function loadShorthand(start: VnPlayerState, shorthand: number[]): VnPlayerState {
  const [state] = State.fromShorthandPath(start, shorthand.slice(0, -1), shorthand[shorthand.length - 1])
  return state
}

// A script with a decision, both branches joining up via jump/labels.
// Index:      0           1           2         3          4            5            6          7          8             9           10
// Stops at "one", at "two"+decision (a Say directly before a Decision doesn't stop), then per branch.
function branchingScript(): Command[] {
  return [
    say("one"),
    say("two"),
    new Decision(loc, [
      { title: "left", jumpLabel: "L1" },
      { title: "right", jumpLabel: "L2" },
    ]),
    new Label(loc, "L1"),
    say("left1"),
    say("left2"),
    new Jump(loc, "end"),
    new Label(loc, "L2"),
    say("right1"),
    new Label(loc, "end"),
    say("fin"),
  ]
}

describe("State.advance", () => {
  it("applies the next command and advances the index", () => {
    const state = State.advance(makeState([say("a"), say("b")]))
    expect(state.commandIndex).toBe(1)
    expect(state.stopAfterRender).toBe(true)
    expect(state.animatableState.text?.textNodes[0].text).toBe("a")
  })

  it("is a no-op while a decision is pending", () => {
    const state = { ...makeState([say("a")]), decision: [{ title: "a", jumpLabel: "x" }] }
    expect(State.advance(state)).toBe(state)
  })

  it("clears one-off sfx and background transition flags", () => {
    const base = makeState([say("a")])
    const state = {
      ...base,
      animatableState: {
        ...base.animatableState,
        audio: { ...base.animatableState.audio, sfx: "boop" },
        background: { ...base.animatableState.background, shouldTransition: true },
      },
    }
    const next = State.advance(state)
    expect(next.animatableState.audio.sfx).toBeNull()
    expect(next.animatableState.background.shouldTransition).toBe(false)
  })

  it("marks the applied command as seen (mutating the shared seen set by design)", () => {
    const state = makeState([say("a")])
    expect(state.seenCommands.contains(0)).toBe(false)
    State.advance(state)
    expect(state.seenCommands.contains(0)).toBe(true)
  })

  it("stops at the end of the command list without running past it", () => {
    const atEnd = State.advance(makeState([say("a")]))
    const after = State.advance(atEnd)
    expect(after.commandIndex).toBe(1)
    expect(after.stopAfterRender).toBe(true)
  })

  it("leaves the index where a jump moved it", () => {
    const state = State.advance(makeState([new Jump(loc, "end"), say("a"), new Label(loc, "end"), say("b")]))
    expect(state.commandIndex).toBe(2)
  })
})

describe("State.makeDecision", () => {
  it("is a no-op when no decision is pending", () => {
    const state = makeState([say("a")])
    expect(State.makeDecision(0, state)).toBe(state)
  })

  it("is a no-op for an out-of-range id", () => {
    const base = makeState(branchingScript())
    const state = {
      ...base,
      decision: [
        { title: "left", jumpLabel: "L1" },
        { title: "right", jumpLabel: "L2" },
      ],
    }
    expect(State.makeDecision(-1, state)).toBe(state)
    expect(State.makeDecision(2, state)).toBe(state)
  })

  it("jumps to the item's label and clears the decision", () => {
    const base = makeState(branchingScript())
    const state = {
      ...base,
      commandIndex: 3,
      stopAfterRender: true,
      decision: [
        { title: "left", jumpLabel: "L1" },
        { title: "right", jumpLabel: "L2" },
      ],
    }
    const next = State.makeDecision(1, state)
    expect(next.commandIndex).toBe(state.labels["L2"])
    expect(next.decision).toBeNull()
    expect(next.stopAfterRender).toBe(false)
  })

  it("throws if the target label does not exist", () => {
    const state = { ...makeState([say("a")]), decision: [{ title: "a", jumpLabel: "nowhere" }] }
    expect(() => State.makeDecision(0, state)).toThrow("Target label does not exist.")
  })
})

describe("State.goToCommandDirect", () => {
  it("applies the 1-based target command", () => {
    const state = State.goToCommandDirect(2, makeState([say("a"), say("b")]))
    expect(state.commandIndex).toBe(2)
    expect(state.animatableState.text?.textNodes[0].text).toBe("b")
  })

  it("clears a pending decision", () => {
    const base = makeState(branchingScript())
    const state = { ...base, commandIndex: 3, decision: [{ title: "left", jumpLabel: "L1" }] }
    expect(State.goToCommandDirect(1, state).decision).toBeNull()
  })

  it("is a no-op when out of bounds", () => {
    const state = makeState([say("a"), say("b")])
    expect(State.goToCommandDirect(0, state)).toBe(state)
    expect(State.goToCommandDirect(3, state)).toBe(state)
  })
})

describe("State.advanceUntilStop", () => {
  it("runs through non-stopping commands until a stop", () => {
    const state = State.advanceUntilStop(makeState([new Label(loc, "x"), say("a")]))
    expect(state.commandIndex).toBe(2)
    expect(state.animatableState.text?.textNodes[0].text).toBe("a")
  })

  it("throws a plain Error on a command loop that never stops", () => {
    // Also proves core no longer depends on the browser alert() global (this would be a
    // ReferenceError in the node test environment otherwise).
    const state = makeState([new Label(loc, "loop"), new Jump(loc, "loop")])
    expect(() => State.advanceUntilStop(state)).toThrow(/infinite loop/)
  })
})

describe("State.fromShorthandPath", () => {
  it("restores a live state saved mid-script (advances only)", () => {
    const player = new VnPlayer(makeState([say("s1"), say("s2"), say("s3"), say("s4")]))
    autorun(player)
    press(player)
    press(player) // showing s3

    const replayed = loadShorthand(player.startingState, player.path.toShorthandPath())
    expect(replayed.commandIndex).toBe(player.state.commandIndex)
    expect(replayed.animatableState.text).toEqual(player.state.animatableState.text)
    expect(replayed.decision).toBeNull()
  })

  it("restores a live state saved after a decision and a jump", () => {
    const player = new VnPlayer(makeState(branchingScript()))
    autorun(player)
    press(player) // "two" + decision
    player.makeDecision(0)
    autorun(player) // "left1"
    press(player) // "left2"
    press(player) // "fin", via the jump

    const replayed = loadShorthand(player.startingState, player.path.toShorthandPath())
    expect(player.path.toShorthandPath()).toEqual([0, 2])
    expect(replayed.commandIndex).toBe(player.state.commandIndex)
    expect(replayed.animatableState.text).toEqual(player.state.animatableState.text)
  })

  it("respects which decision was made", () => {
    const player = new VnPlayer(makeState(branchingScript()))
    autorun(player)
    press(player)
    player.makeDecision(1)
    autorun(player) // "right1"

    const replayed = loadShorthand(player.startingState, player.path.toShorthandPath())
    expect(player.path.toShorthandPath()).toEqual([1, 0])
    expect(replayed.commandIndex).toBe(player.state.commandIndex)
    expect(replayed.animatableState.text).toEqual(player.state.animatableState.text)
  })

  it("restores a pending decision when the save ends on one", () => {
    const player = new VnPlayer(makeState(branchingScript()))
    autorun(player)
    press(player) // at the decision prompt

    const replayed = loadShorthand(player.startingState, player.path.toShorthandPath())
    expect(replayed.commandIndex).toBe(player.state.commandIndex)
    expect(replayed.decision).toEqual(player.state.decision)
    expect(replayed.decision).not.toBeNull()
  })

  it("restores variables", () => {
    const commands = [set(["$hp", "=", 5]), say("a"), set(["$hp", "+=", 3]), say("b")]
    const player = new VnPlayer(makeState(commands))
    autorun(player)
    press(player)

    const replayed = loadShorthand(player.startingState, player.path.toShorthandPath())
    expect(player.state.variables).toEqual({ hp: 8 })
    expect(replayed.variables).toEqual(player.state.variables)
    expect(replayed.commandIndex).toBe(player.state.commandIndex)
  })
})

// Replay invariant: a path means "what the user did" - Advance(n) is n presses made from a stop,
// and the automatic runs (initial, post-decision, post-goto) are never part of the path. Replay
// performs those runs without consuming recorded advances, so replayed paths match live ones.
describe("path replay matches live play", () => {
  it("undo goes back exactly one stop", () => {
    const player = new VnPlayer(makeState([say("s1"), say("s2"), say("s3"), say("s4")]))
    autorun(player)
    press(player)
    press(player) // showing s3
    player.undo()
    expect(player.state.commandIndex).toBe(2) // showing s2
  })

  it("fromPath reproduces the live state after a decision", () => {
    const player = new VnPlayer(makeState(branchingScript()))
    autorun(player)
    press(player)
    player.makeDecision(0)
    autorun(player)
    press(player)
    press(player)
    const replayed = State.fromPath(player.startingState, player.path)
    expect(replayed.commandIndex).toBe(player.state.commandIndex)
    expect(replayed.animatableState.text).toEqual(player.state.animatableState.text)
  })

  it("fromPath of the empty path is the first stop", () => {
    const replayed = State.fromPath(makeState(branchingScript()), VnPath.emptyPath())
    expect(replayed.commandIndex).toBe(1)
    expect(replayed.animatableState.text?.textNodes[0].text).toBe("one")
  })

  it("save -> load -> save -> load does not drift", () => {
    const player = new VnPlayer(makeState(branchingScript()))
    autorun(player)
    press(player)
    player.makeDecision(0)
    autorun(player)
    press(player) // "left2"
    const cmdIndexAtSave = player.state.commandIndex
    const shorthandAtSave = player.path.toShorthandPath()

    player.saveToSlot(0)
    player.loadFromSlot(0)
    expect(player.state.commandIndex).toBe(cmdIndexAtSave)
    expect(player.path.toShorthandPath()).toEqual(shorthandAtSave)
    player.saveToSlot(0)
    player.loadFromSlot(0)
    expect(player.state.commandIndex).toBe(cmdIndexAtSave)
    expect(player.path.toShorthandPath()).toEqual(shorthandAtSave)
  })

  it("undo walks back through the story one visible stop at a time", () => {
    const player = new VnPlayer(makeState(branchingScript()))
    autorun(player)
    press(player)
    player.makeDecision(0)
    autorun(player)
    press(player)
    press(player) // "fin"
    expect(player.state.commandIndex).toBe(11)

    player.undo()
    expect(player.state.commandIndex).toBe(6) // "left2"
    player.undo()
    expect(player.state.commandIndex).toBe(5) // "left1"
    player.undo()
    expect(player.state.commandIndex).toBe(3) // the decision prompt again
    expect(player.state.decision).not.toBeNull()
    player.undo()
    expect(player.state.commandIndex).toBe(1) // "one"
    player.undo() // undoing past the beginning stays at the first stop
    expect(player.state.commandIndex).toBe(1)
  })

  it("handles a decision as the very first stop", () => {
    const script = [
      new Decision(loc, [
        { title: "a", jumpLabel: "L1" },
        { title: "b", jumpLabel: "L2" },
      ]),
      new Label(loc, "L1"),
      say("a1"),
      new Jump(loc, "end"),
      new Label(loc, "L2"),
      say("b1"),
      new Label(loc, "end"),
      say("done"),
    ]
    const player = new VnPlayer(makeState(script))
    autorun(player) // the decision comes up with no advances recorded
    expect(player.state.decision).not.toBeNull()
    player.makeDecision(1)
    autorun(player) // "b1"
    press(player) // "done"
    expect(player.path.toShorthandPath()).toEqual([1, 1])

    const replayed = loadShorthand(player.startingState, player.path.toShorthandPath())
    expect(replayed.commandIndex).toBe(player.state.commandIndex)

    player.undo()
    expect(player.state.animatableState.text?.textNodes[0].text).toBe("b1")
  })

  it("undo works across a goto", () => {
    const player = new VnPlayer(makeState([say("s1"), say("s2"), say("s3"), say("s4")]))
    autorun(player)
    player.goToCommandDirect(3)
    autorun(player) // showing s3
    press(player) // showing s4
    player.undo()
    expect(player.state.commandIndex).toBe(3)
    expect(player.state.animatableState.text?.textNodes[0].text).toBe("s3")
  })

  it("throws instead of hanging when a saved path expects a decision that never comes", () => {
    const start = makeState([say("s1"), say("s2"), say("s3"), say("s4")])
    expect(() => State.fromShorthandPath(start, [0], 0)).toThrow(/infinite loop/)
  })

  it("throws on an out-of-range decision id in a saved path", () => {
    const start = makeState(branchingScript())
    expect(() => State.fromShorthandPath(start, [5], 0)).toThrow(/Invalid decision id/)
  })

  it("throws when replaying a decision the story does not offer", () => {
    const start = makeState([say("s1"), say("s2")])
    const path = VnPath.emptyPath().makeDecision(0)
    expect(() => State.fromPath(start, path)).toThrow(/does not match the story/)
  })
})
