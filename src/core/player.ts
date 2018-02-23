import { TextBoxType, VnPlayerState } from "./state";
import * as Commands from "./commands"

const initialState: VnPlayerState = {
  commandIndex: -1,
  commands: [],
  animatableState: {
    text: null
  }
};

export class VnPlayer {
  public state: VnPlayerState;
  constructor(state: VnPlayerState | undefined) {
    this.state = state === undefined ? initialState : state;
  }

  public advance() {
    let newState = { ...this.state };
    if (newState.commandIndex < newState.commands.length) {
      newState = Commands.applyCommand(newState)
      newState.commandIndex++;
      this.state = newState;
    }
  }
}
