import { Command } from "./commands/Command"
import { NARRATOR_ACTOR_ID, VnPlayerState } from "./state"
import "./commands/controlFlow/Decision"
import "./commands/text/CloseTextBox"
import "./commands/controlFlow/variables"
import "./commands/sprites/Show"
import "./commands/sprites/Hide"

export const initialState: VnPlayerState = {
  actors: {
    default: {
      textColor: "white",
      nameTagColor: "white",
    },
    [NARRATOR_ACTOR_ID]: {},
  },
  commandIndex: 0, // the command to be applied next
  commands: [],
  labels: {},
  stopAfterRender: false,
  animatableState: {
    text: null,
    sprites: {},
  },
  decision: null,
  variables: {},
}

export class VnPlayer {
  public state: VnPlayerState
  constructor(state: VnPlayerState | undefined) {
    this.state = state === undefined ? initialState : state
  }

  public advance(): void {
    if (this.state.decision !== null) return

    let newState = { ...this.state }
    if (newState.commandIndex < newState.commands.length) {
      newState = newState.commands[newState.commandIndex].apply(newState)
      newState.commandIndex++
      this.state = newState
    }
  }

  public makeDecision(id: number): void {
    if (this.state.decision === null) return
    if (id < 0 || id > this.state.decision.length - 1) return
    const item = this.state.decision[id]

    const newState = { ...this.state }
    if (this.state.labels[item.jumpLabel] === undefined) {
      throw new Error("Target label does not exist.")
    }
    newState.commandIndex = this.state.labels[item.jumpLabel]
    newState.stopAfterRender = false
    newState.decision = null
    this.state = newState
  }

  public loadCommands(commands: Command[]): void {
    this.state = { ...this.state, commands, commandIndex: 0 }
  }

  public goToCommand(cmdIndex: number): void {
    if (cmdIndex < 1 || cmdIndex > this.state.commands.length) {
      return
    }
    // case for preCommand hooks...? (to reset decision...)
    this.state = { ...this.state, commandIndex: cmdIndex - 1, decision: null }
    this.advance()
  }
}
