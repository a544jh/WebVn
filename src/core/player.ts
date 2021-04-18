import { Command } from "./commands/Command"
import { NARRATOR_ACTOR_ID, VnPlayerState } from "./state"
import "../pegjsParser/commands"

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
  },
}

export class VnPlayer {
  public state: VnPlayerState
  constructor(state: VnPlayerState | undefined) {
    this.state = state === undefined ? initialState : state
  }

  public advance(): void {
    let newState = { ...this.state }
    if (newState.commandIndex < newState.commands.length) {
      newState = newState.commands[newState.commandIndex].apply(newState)
      newState.commandIndex++
      this.state = newState
    }
  }

  public loadCommands(commands: Command[]): void {
    this.state = {...this.state, commands, commandIndex: 0}
  }

  public goToCommand(cmdIndex: number): void {
    if (cmdIndex < 1 || cmdIndex > this.state.commands.length) {
      return
    }
    this.state = {...this.state, commandIndex: cmdIndex - 1}
    this.advance()
  }
}
