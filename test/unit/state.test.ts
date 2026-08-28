import { describe, expect, it } from "vitest"
import { seedState } from "../../src/core/manifest"
import { TEST_MANIFEST } from "../helpers/testManifest"
import { VnPlayer } from "../../src/core/player"
import { State, VnPlayerState } from "../../src/core/state"
import { VnPath } from "../../src/core/vnPath"
import { Command } from "../../src/core/commands/Command"
import { Say } from "../../src/core/commands/text/Say"
import { Decision } from "../../src/core/commands/controlFlow/Decision"
import { Jump } from "../../src/core/commands/controlFlow/Jump"
import { Label, updateLabels } from "../../src/core/commands/controlFlow/Label"
import { loc, makeCommand } from "../helpers/commands"

const say = (text: string) => new Say(loc, "narrator", text)

const show = (actor: string) => makeCommand("show", { actor, sprite: "a.png" })

const set = (args: unknown) => makeCommand("set", args)

function makeState(commands: Command[]): VnPlayerState {
  return updateLabels({ ...seedState(TEST_MANIFEST), commands })
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

  it("applies only that command, leaving the rest of the scene as it found it", () => {
    // the crude mode's whole character: nothing before the target is replayed
    const state = State.goToCommandDirect(3, makeState([show("A1"), set(["$x", "=", 7]), say("a")]))
    expect(state.animatableState.text?.textNodes[0].text).toBe("a")
    expect(state.animatableState.sprites["A1"]).toBeUndefined()
    expect(state.variables["x"]).toBeUndefined()
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

describe("State.goToCommandByReplay", () => {
  it("replays everything before the target, so the scene is built", () => {
    const [state] = State.goToCommandByReplay(3, makeState([show("A1"), set(["$x", "=", 7]), say("a")]), [])
    expect(state.animatableState.text?.textNodes[0].text).toBe("a")
    expect(state.animatableState.sprites["A1"]).toBeDefined()
    expect(state.variables["x"]).toBe(7)
  })

  it("lands on the first stop at or after the target", () => {
    // a show does not stop, so parking on it would be a state a player could never be in
    const [state] = State.goToCommandByReplay(1, makeState([show("A1"), say("a")]), [])
    expect(state.commandIndex).toBe(2)
    expect(state.animatableState.text?.textNodes[0].text).toBe("a")
  })

  it("takes the branch the recorded decision chose", () => {
    // index 8 is "right1", only reachable through the second option
    const [state] = State.goToCommandByReplay(9, makeState(branchingScript()), [1])
    expect(state.animatableState.text?.textNodes[0].text).toBe("right1")
  })

  it("follows jumps rather than walking past them", () => {
    // the left branch ends in `jump: end`, so replaying it arrives at "fin"
    const [state] = State.goToCommandByReplay(11, makeState(branchingScript()), [0])
    expect(state.animatableState.text?.textNodes[0].text).toBe("fin")
  })

  it("stops at a decision it has no recorded answer for", () => {
    const [state] = State.goToCommandByReplay(9, makeState(branchingScript()), [])
    expect(state.decision).not.toBeNull()
    expect(state.animatableState.text?.textNodes[0].text).toBe("two")
  })

  it("returns a path that describes where it landed", () => {
    const start = makeState(branchingScript())
    const [state, path] = State.goToCommandByReplay(9, start, [1])
    expect(State.fromPath(start, path)).toEqual(state)
    // and it is an ordinary path, so the session stays saveable
    expect(path.toShorthandPath()).toEqual([1, 0])
  })

  it("is a no-op past the end of the story", () => {
    const start = makeState([say("a"), say("b")])
    const [state] = State.goToCommandByReplay(3, start, [])
    expect(state).toEqual(State.runToStop(start))
  })
})

describe("VnPath.replayAsFarAsPossible", () => {
  it("keeps a path that still replays, and lands where it led", () => {
    const start = makeState([say("a"), say("b"), say("c"), say("d")])
    const player = new VnPlayer(start)
    autorun(player)
    press(player)
    press(player) // showing "c"

    const [state, path] = player.path.replayAsFarAsPossible(start)
    expect(path.toShorthandPath()).toEqual([2])
    expect(state.animatableState.text?.textNodes[0].text).toBe("c")
  })

  it("cuts the path where the story now ends earlier than it expects", () => {
    const before = makeState([say("a"), say("b"), say("c"), say("d")])
    const player = new VnPlayer(before)
    autorun(player)
    press(player)
    press(player) // three advances' worth of story consumed

    // the author deleted the last two lines
    const after = makeState([say("a"), say("b")])
    const [state, path] = player.path.replayAsFarAsPossible(after)
    expect(path.toShorthandPath()).toEqual([1])
    expect(state.animatableState.text?.textNodes[0].text).toBe("b")
  })

  it("cuts the path at a decision whose recorded answer no longer fits", () => {
    const before = makeState(branchingScript())
    const player = new VnPlayer(before)
    autorun(player)
    press(player) // the decision comes up
    player.makeDecision(1) // the second option
    autorun(player)

    // the author cut the decision down to a single option
    const after = makeState(
      branchingScript().map((cmd, i) => (i === 2 ? new Decision(loc, [{ title: "left", jumpLabel: "L1" }]) : cmd))
    )
    const [state, path] = player.path.replayAsFarAsPossible(after)
    expect(path.getDecisions()).toEqual([])
    expect(state.decision).not.toBeNull()
  })

  it("cuts the path at a direct jump that now points past the end", () => {
    const before = makeState([say("a"), say("b"), say("c"), say("d")])
    const player = new VnPlayer(before)
    autorun(player)
    player.goToCommandDirect(4)

    const after = makeState([say("a"), say("b")])
    const [, path] = player.path.replayAsFarAsPossible(after)
    expect(path.containsDirectJump()).toBe(false)
  })

  it("leaves a path that fromPath can still replay without throwing", () => {
    const before = makeState(branchingScript())
    const player = new VnPlayer(before)
    autorun(player)
    press(player)
    player.makeDecision(1)
    autorun(player)

    const after = makeState(
      branchingScript().map((cmd, i) => (i === 2 ? new Decision(loc, [{ title: "left", jumpLabel: "L1" }]) : cmd))
    )
    const [state, path] = player.path.replayAsFarAsPossible(after)
    expect(() => State.fromPath(after, path)).not.toThrow()
    expect(State.fromPath(after, path)).toEqual(state)
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

  it("undo works across a replayed goto, which leaves an ordinary path behind it", () => {
    const player = new VnPlayer(makeState([say("s1"), say("s2"), say("s3"), say("s4")]))
    autorun(player)
    player.goToCommandByReplay(3)
    autorun(player) // showing s3
    expect(player.path.toShorthandPath()).toEqual([2])
    press(player) // showing s4
    player.undo()
    expect(player.state.commandIndex).toBe(3)
    expect(player.state.animatableState.text?.textNodes[0].text).toBe("s3")
  })

  it("records a direct goto, so undo pops the jump and puts you back where you were", () => {
    const player = new VnPlayer(makeState([say("s1"), say("s2"), say("s3"), say("s4")]))
    autorun(player)
    press(player) // showing s2
    player.goToCommandDirect(4) // teleport to s4, which no sequence of advances reaches from here
    expect(player.state.animatableState.text?.textNodes[0].text).toBe("s4")
    expect(player.path.containsDirectJump()).toBe(true)

    player.undo()
    expect(player.state.animatableState.text?.textNodes[0].text).toBe("s2")
    expect(player.path.containsDirectJump()).toBe(false)
  })

  it("does not reuse decisions made after a direct goto when replaying to a command", () => {
    const player = new VnPlayer(makeState(branchingScript()))
    autorun(player) // showing "one"
    player.goToCommandDirect(2) // teleport past it, to "two"
    press(player) // the decision comes up
    player.makeDecision(0) // a choice made somewhere a replay from the top will never go
    autorun(player)

    expect(player.path.getDecisions()).toEqual([0])
    expect(player.path.getReplayableDecisions()).toEqual([])

    // "left2" at index 5, only reachable through that choice
    player.goToCommandByReplay(6)

    // with nothing it can trust, the replay stops at the decision rather than borrowing an answer
    // and sending itself down a branch nobody picked
    expect(player.state.decision).not.toBeNull()
    expect(player.state.animatableState.text?.textNodes[0].text).toBe("two")
  })

  it("replays a path that carries on past a direct goto", () => {
    const start = makeState([say("s1"), say("s2"), say("s3"), say("s4")])
    const player = new VnPlayer(start)
    autorun(player)
    player.goToCommandDirect(3) // showing s3
    press(player) // showing s4

    expect(State.fromPath(start, player.path)).toEqual(player.state)
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
