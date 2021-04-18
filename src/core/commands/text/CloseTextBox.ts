import { YamlParser } from "../../../yamlParser/YamlParser"
import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ObjectToCommand, ParserError } from "../Parser"

export class CloseTextBox extends Command {

  public apply(state: VnPlayerState): VnPlayerState {
    return {
      ...state, animatableState: {
        ...state.animatableState, text: null,
      },
    }
  }
}

const textboxHandler: ObjectToCommand = (obj, location) => {
  if (obj === "close") return new CloseTextBox(location)

  return new ParserError("Not a valid textbox command.", location, ErrorLevel.WARNING)
}

YamlParser.registerCommand('textbox', textboxHandler)