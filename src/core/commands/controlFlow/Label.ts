import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"
import "./Jump"

export class Label extends Command {
  constructor(location: SourceLocation, name: string) {
    super(location)
    this.name = name
  }
  name: string

  public apply(state: VnPlayerState): VnPlayerState {
    return { ...state, stopAfterRender: false }
  }
}

registerCommandHandler("label", (obj, location) => {
  if (typeof obj === "string") {
    return new Label(location, obj)
  }
  return new ParserError("Label must be a string.", location, ErrorLevel.WARNING)
})

export function updateLabels(state: VnPlayerState): VnPlayerState {
  const newState = { ...state }
  const lables: Record<string, number> = {}
  state.commands.forEach((command, index) => {
    if (command instanceof Label) {
      const lable = command.name
      if (lables[lable] !== undefined) {
        throw new Error(`Label ${lable} already exists in story.`)
      } else {
        lables[lable] = index
      }
    }
  })
  newState.labels = lables
  return newState
}
