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

  public goToCommand(id: number): VnPath {
    return new VnPath([...this.path, new GoToCommand(id)])
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
          stepsLeft -= stepsLeft
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

  public getRemainingAdvances(): number {
    const last = this.path[this.path.length - 1]
    if (last instanceof Advance) {
      return last.times
    }
    return 0
  }

  // JSON serializable for saving..
  public toShorthandPath(): number[] {
    if (this.path.find((a) => a instanceof GoToCommand) !== undefined) {
      throw new Error("Can't get shorthand of path containing goto action")
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
    state = State.makeDecision(this.id, state)
    return State.advanceUntilStop(state)
  }
}

class GoToCommand extends VnAction {
  constructor(public readonly id: number) {
    super()
  }

  public perform(state: VnPlayerState): VnPlayerState {
    return State.goToCommandDirect(this.id, state)
  }
}
