import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ObjectToCommand, ParserError, registerCommandHandler } from "../Parser"

export class CloseTextBox extends Command {
  public apply(state: VnPlayerState): VnPlayerState {
    return {
      ...state,
      animatableState: {
        ...state.animatableState,
        text: null,
      },
      stopAfterRender: true,
    }
  }
}

class ClearFreeform extends Command {
  public apply(state: VnPlayerState): VnPlayerState {
    return {...state, animatableState: {...state.animatableState, freeformText: []}}
  }
}

const textboxHandler: ObjectToCommand = (obj, location) => {
  if (obj === "close") return new CloseTextBox(location)
  if (obj === "clear") return new ClearFreeform(location)

  return new ParserError("Not a valid textbox command.", location, ErrorLevel.WARNING)
}

registerCommandHandler("textbox", textboxHandler)
