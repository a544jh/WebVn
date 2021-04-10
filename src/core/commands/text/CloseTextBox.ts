import { VnPlayerState } from "../../state"
import { Command } from "../Command"

export class CloseTextBox extends Command {

  public apply(state: VnPlayerState): VnPlayerState {
    return {
      ...state, animatableState: {
        ...state.animatableState, text: null,
      },
    }
  }
}
