import * as Commands from "./commands"
import { TextBoxType, VnPlayerState } from "./state"

const initialState: VnPlayerState = {
  actors: {
    default: {
      textColor: "white",
      nameTagColor: "white",
    },
    none: {},
  },
  commandIndex: -1,
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
      newState = Commands.applyCommand(newState)
      newState.commandIndex++
      this.state = newState
    }
  }
}
