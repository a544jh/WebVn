import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { SC } from "../StatementConverter"

export class CloseTextBox extends Command {

  public apply(state: VnPlayerState) {
    return {
      ...state, animatableState: {
        ...state.animatableState, text: null,
      },
    }
  }
}
