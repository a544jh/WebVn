import { State, VnPlayerState } from "./state"

// One action, in a shape the editor can render without reaching into the action classes.
export interface PathStep {
  kind: "advance" | "decision" | "directJump"
  // times for an advance, the chosen option for a decision, the target command for a direct jump
  value: number
}

// Immutable representaion of actions taken through the VN
export class VnPath {
  private readonly path: VnAction[]

  private constructor(arr: VnAction[]) {
    this.path = arr
  }

  public static emptyPath(): VnPath {
    return new VnPath([])
  }

  // Advances the VN when an interaction is expected (state.stopAfterRender).
  public advance(): VnPath {
    const last = this.path[this.path.length - 1]
    if (last instanceof Advance) {
      const newLast = new Advance(last.times + 1)
      const newArr = this.path.slice(0, -1)
      newArr.push(newLast)
      return new VnPath(newArr)
    } else {
      return new VnPath([...this.path, new Advance(1)])
    }
  }

  public makeDecision(id: number): VnPath {
    return new VnPath([...this.path, new MakeDecision(id)])
  }

  // Only a direct jump is recorded. A replayed one moves the player to a real point in the story and
  // takes the path that leads there, so there is nothing of the author's own to record.
  public goToCommandDirect(id: number): VnPath {
    return new VnPath([...this.path, new GoToCommandDirect(id)])
  }

  public containsDirectJump(): boolean {
    return this.path.some((action) => action instanceof GoToCommandDirect)
  }

  public undo(steps: number): VnPath {
    let stepsLeft = steps
    const arr = [...this.path]
    while (stepsLeft !== 0) {
      const last = arr[arr.length - 1]
      if (last instanceof Advance) {
        if (last.times <= stepsLeft) {
          arr.pop()
          stepsLeft -= last.times
        } else if (last.times > stepsLeft) {
          arr.pop()
          arr.push(new Advance(last.times - stepsLeft))
          stepsLeft = 0
        }
      } else if (last !== undefined) {
        arr.pop()
        stepsLeft -= 1
      } else {
        return new VnPath([])
      }
    }
    return new VnPath(arr)
  }

  public getSteps(): PathStep[] {
    return this.path.map((action) => action.describe())
  }

  public getActions(): VnAction[] {
    return this.path
  }

  public getDecisions(): number[] {
    return this.path.filter((v) => v instanceof MakeDecision).map((d) => (d as MakeDecision).id)
  }

  // The decisions a replay from the beginning can reuse: the ones made before the first direct jump.
  // After that jump the author was somewhere a replay from the top will never go, so the choices
  // they made there are answers to decisions it will never ask. Feeding one back in does not fail
  // loudly either - an id that happens to be in range for whatever decision the replay does reach
  // sends it down a branch nobody picked.
  public getReplayableDecisions(): number[] {
    const firstJump = this.path.findIndex((action) => action instanceof GoToCommandDirect)
    const playthrough = firstJump === -1 ? this.path : this.path.slice(0, firstJump)
    return playthrough.filter((v) => v instanceof MakeDecision).map((d) => (d as MakeDecision).id)
  }

  public getRemainingAdvances(): number {
    const last = this.path[this.path.length - 1]
    if (last instanceof Advance) {
      return last.times
    }
    return 0
  }

  // Replays this path against a story that may have been edited under it, keeping the prefix that
  // still applies - anything past the first action that no longer works was recorded against a
  // script that no longer exists. Returns the state reached and the path that produced it, so the
  // two always agree and the stored path is always replayable against the current story.
  public replayAsFarAsPossible(startingState: VnPlayerState): [VnPlayerState, VnPath] {
    // the automatic run to the first stop is not part of the path
    let state = State.runToStop(startingState)
    const kept: VnAction[] = []
    for (const action of this.path) {
      const applied = action.tryPerform(state)
      if (applied === null) break
      state = applied[0]
      kept.push(applied[1])
      // a partly applied action means the story ran out inside it, so nothing recorded after it can
      // apply either
      if (applied[1] !== action) break
    }
    return [state, new VnPath(kept)]
  }

  // JSON serializable for saving..
  public toShorthandPath(): number[] {
    if (this.containsDirectJump()) {
      // A direct jump lands somewhere no sequence of advances and decisions reaches, so the
      // shorthand cannot describe it. Callers are expected to check containsDirectJump first - the
      // editor greys out the save button - so reaching this is a bug rather than a user's doing.
      throw new Error("Can't get shorthand of path containing a direct jump")
    }
    return [...this.getDecisions(), this.getRemainingAdvances()]
  }
}

abstract class VnAction {
  // The state reached and the part of this action that actually applied - which is the action itself
  // unless a run of advances ran out of story part way through. Null when none of it applies any
  // more. Editing a script out from under a path is the only way that happens, so a reload uses this
  // to find where the path stops matching, while everything else goes through perform.
  public abstract tryPerform(state: VnPlayerState): [VnPlayerState, VnAction] | null

  public abstract describe(): PathStep

  public perform(state: VnPlayerState): VnPlayerState {
    const applied = this.tryPerform(state)
    if (applied === null || applied[1] !== this) {
      throw new Error("Could not replay action - path does not match the story")
    }
    return applied[0]
  }
}

class Advance extends VnAction {
  constructor(public readonly times: number) {
    super()
  }

  public describe(): PathStep {
    return { kind: "advance", value: this.times }
  }

  public tryPerform(state: VnPlayerState): [VnPlayerState, VnAction] | null {
    let done = 0
    for (let i = 0; i < this.times; i++) {
      const before = state.commandIndex
      const next = State.advanceUntilStop(state)
      // the story now ends earlier than the path expects
      if (next.commandIndex === before) break
      state = next
      done++
    }
    if (done === 0) return null
    // a shortened run is still worth keeping: a path is usually one long Advance, and dropping it
    // whole would throw the author back to the first stop for the sake of one deleted line
    return [state, done === this.times ? this : new Advance(done)]
  }
}

class MakeDecision extends VnAction {
  constructor(public readonly id: number) {
    super()
  }

  public describe(): PathStep {
    return { kind: "decision", value: this.id }
  }

  public tryPerform(state: VnPlayerState): [VnPlayerState, VnAction] | null {
    // makeDecision no-ops when no decision is pending or the id is out of range - continuing would
    // let the replay diverge from what the path describes
    const decided = State.makeDecision(this.id, state)
    if (decided === state) return null
    // the run from the decision to the next stop is automatic, not a recorded advance
    return [State.advanceUntilStop(decided), this]
  }
}

class GoToCommandDirect extends VnAction {
  constructor(public readonly id: number) {
    super()
  }

  public describe(): PathStep {
    return { kind: "directJump", value: this.id }
  }

  public tryPerform(state: VnPlayerState): [VnPlayerState, VnAction] | null {
    // Deliberately applied to the state the replay has reached: a direct jump is defined relative to
    // whatever was loaded when it was made, which is exactly what makes it unrepresentable as a save.
    const jumped = State.goToCommandDirect(this.id, state)
    // the target is past the end of a script that has since got shorter
    if (jumped === state) return null
    return [jumped, this]
  }
}
