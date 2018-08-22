import { Command } from "./commands/Command"
import { VnPlayerState } from "./state"
import "./commands/commands"

export const initialState: VnPlayerState = {
  actors: {
    default: {
      textColor: "white",
      nameTagColor: "white",
    },
    none: {},
  },
  commandIndex: 0, // the command to be applied next
  commands: [],
  animatableState: {
    text: null,
  },
}

export class VnPlayer {
  public state: VnPlayerState
  constructor(state: VnPlayerState | undefined) {
    this.state = state === undefined ? initialState : state
  }

  public advance() {
    let newState = { ...this.state }
    if (newState.commandIndex < newState.commands.length) {
      newState = newState.commands[newState.commandIndex].apply(newState)
      newState.commandIndex++
      this.state = newState
    }
  }

  public loadCommands(commands: Command[]) {
    this.state = {...this.state, commands, commandIndex: 0}
  }

  public goToCommand(cmdIndex: number) {
    if (cmdIndex < 1 || cmdIndex > this.state.commands.length) {
      return
    }
    // TODO: optimize this if needed :)
    // e.g. with history
    this.state = {...this.state,
      commandIndex: 0,
      animatableState: initialState.animatableState,
    }

    while (this.state.commandIndex !== cmdIndex) {
      this.advance()
    }
  }
}
