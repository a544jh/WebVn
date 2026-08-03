import { z, ZodError } from "zod"
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
    return { ...state, animatableState: { ...state.animatableState, freeformText: [] } }
  }
}

const TextBoxCommandSchema = z.enum(["close", "clear"])

const textboxHandler: ObjectToCommand = (obj, location) => {
  try {
    const cmd = TextBoxCommandSchema.parse(obj)
    if (cmd === "close") return new CloseTextBox(location)
    return new ClearFreeform(location)
  } catch (e) {
    const zodError = e as ZodError
    return new ParserError(zodError.message, location, ErrorLevel.WARNING)
  }
}

registerCommandHandler("textbox", textboxHandler)
