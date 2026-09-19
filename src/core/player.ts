import { State, VnPlayerState } from "./state"
import { VnPath } from "./vnPath"
import "./commands/controlFlow/Decision"
import "./commands/controlFlow/Label"
import "./commands/controlFlow/Jump"
import "./commands/text/TextBox"
import "./commands/text/FreeformPos"
import "./commands/text/Mode"
import "./commands/controlFlow/variables"
import "./commands/sprites/Show"
import "./commands/sprites/Hide"
import "./commands/backgrounds/Background"
import "./commands/audio/Bgm"
import "./commands/audio/Sfx"
import { ConsecutiveIntegerSet } from "../lib/ConsecutiveIntegerSet"
import { VnGlobalSaveData, VnSaveSlotData } from "./save"

export class VnPlayer {
  public state: VnPlayerState
  public path: VnPath
  public startingState: VnPlayerState
  public saves: VnSaveSlotData[]

  constructor(state: VnPlayerState, saveData?: VnGlobalSaveData) {
    this.state = state
    this.path = VnPath.emptyPath()
    this.startingState = this.state
    this.saves = saveData?.saves ?? []
    if (saveData) this.state.seenCommands = ConsecutiveIntegerSet.fromJSON(saveData.seenCommands)
  }

  // Only an advance made from a stop is the author's own, and only one that applied something is one
  // a replay can walk - `State.appliedAny` is the question `Advance.tryPerform` asks too. Advancing at
  // the end of the story applies nothing, and so does skipping at the end of a script edited shorter
  // under a `seenCommands` that still remembers the longer one.
  public advance(): void {
    const newState = State.advance(this.state)
    if (this.state.stopAfterRender && State.appliedAny(this.state, newState)) {
      this.path = this.path.advance()
    }
    this.state = newState
  }

  public advanceUntilStop(): void {
    const newState = State.advanceUntilStop(this.state)
    if (this.state.stopAfterRender && State.appliedAny(this.state, newState)) {
      this.path = this.path.advance()
    }
    this.state = newState
  }

  public makeDecision(id: number): void {
    const newState = State.makeDecision(id, this.state)
    if (newState !== this.state) this.path = this.path.makeDecision(id)
    this.state = newState
  }

  // Recorded, unlike a replayed jump: this one is something done to the player from outside the
  // story, so it is the last thing the author did and undo should pop it. That is also what makes
  // the path unsaveable until it is popped.
  public goToCommandDirect(cmdIndex: number): void {
    this.state = State.goToCommandDirect(cmdIndex, this.state)
    this.path = this.path.goToCommandDirect(cmdIndex)
  }

  // Replays there for real, using the decisions already recorded, and takes the path it walked -
  // so the player ends up somewhere the path genuinely describes.
  public goToCommandByReplay(cmdIndex: number): void {
    const [state, path] = State.goToCommandByReplay(cmdIndex, this.startingState, this.path.getReplayableDecisions())
    this.state = state
    this.path = path
  }

  public undo(): void {
    this.path = this.path.undo(1)
    this.state = State.fromPath(this.startingState, this.path)
  }

  // Past the last command there is no next command to have seen, whatever `seenCommands` says about
  // that index - and it can say the wrong thing, since the marks are carried across a `reloadStory`
  // and a script edited shorter leaves them pointing beyond the end. Without the bound, skip mode
  // spins on the last frame of such a story and the scroll wheel steps a story that cannot step.
  public isNextCommandSeen(): boolean {
    if (this.state.commandIndex >= this.state.commands.length) return false
    return this.state.seenCommands.contains(this.state.commandIndex)
  }

  public saveToSlot(slot: number): void {
    const save = {
      path: this.path.toShorthandPath(),
      timestamp: new Date().getTime(),
    }
    this.saves[slot] = save
  }

  public loadFromSlot(slot: number): void {
    const save = this.saves[slot]
    if (save === undefined) throw new Error("No save at slot " + slot)
    const [state, path] = State.fromShorthandPath(this.startingState, save.path.slice(0, -1), save.path.slice(-1)[0])
    this.state = state
    this.path = path
  }

  // The script was edited: same session, new story. Unlike loadState the path is kept, but only as
  // far as it still replays against the new script - and startingState becomes the new beginning,
  // since that is what every later replay (undo, a replay jump, loading a save) starts from.
  public reloadStory(state: VnPlayerState): void {
    // Every seed mints its own set, so the marks have to be carried over by hand - a command the
    // player has read stays read across an edit of the script.
    state.seenCommands = this.state.seenCommands
    const [newState, keptPath] = this.path.replayAsFarAsPossible(state)
    this.state = newState
    this.startingState = state
    this.path = keptPath
  }

  // Put a path from another session of the same story back. A rename rebuilds the whole player - new
  // directory, new resolver, new lock - over files it did not change, so the author's place in the
  // story is the one thing that would otherwise be lost to an operation that changed nothing about
  // the story.
  //
  // Replayed as far as it still applies, exactly as a script edit's path is: a path that no longer
  // fits is truncated rather than throwing. It should always fit here, since a rename copies the
  // script verbatim - but "should" is not a reason to reach for the version that throws.
  public restorePath(path: VnPath): void {
    this.path = path
    this.reloadStory(this.startingState)
  }

  public loadState(state: VnPlayerState): void {
    state.seenCommands = this.state.seenCommands
    this.state = state
    this.startingState = state
    this.path = VnPath.emptyPath()
  }

  public getGlobalSaveData(): VnGlobalSaveData {
    return {
      seenCommands: this.state.seenCommands.toJSON(),
      saves: this.saves,
    }
  }
}
