import { State, VnPlayerState } from "./state"

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
  public abstract perform(state: VnPlayerState): VnPlayerState
}

class Advance extends VnAction {
  constructor(public readonly times: number) {
    super()
  }

  public perform(state: VnPlayerState): VnPlayerState {
    for (let i = 0; i < this.times; i++) {
      state = State.advanceUntilStop(state)
    }
    return state
  }
}

class MakeDecision extends VnAction {
  constructor(public readonly id: number) {
    super()
  }

  public perform(state: VnPlayerState): VnPlayerState {
    const decided = State.makeDecision(this.id, state)
    if (decided === state) {
      // makeDecision no-ops when no decision is pending or the id is out of range -
      // silently continuing would let the replay diverge from what the path describes
      throw new Error("Could not replay decision - path does not match the story")
    }
    // the run from the decision to the next stop is automatic, not a recorded advance
    return State.advanceUntilStop(decided)
  }
}

class GoToCommandDirect extends VnAction {
  constructor(public readonly id: number) {
    super()
  }

  public perform(state: VnPlayerState): VnPlayerState {
    // Deliberately applied to the state the replay has reached: a direct jump is defined relative to
    // whatever was loaded when it was made, which is exactly what makes it unrepresentable as a save.
    return State.goToCommandDirect(this.id, state)
  }
}
