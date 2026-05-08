import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"
import "./Jump"

export class Label extends Command {
  constructor(location: SourceLocation, public name: string) {
    super(location)
  }

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
  const labels: Record<string, number> = {}
  state.commands.forEach((command, index) => {
    if (command instanceof Label) {
      const label = command.name
      if (labels[label] !== undefined) {
        throw new Error(`Label ${label} already exists in story.`)
      } else {
        labels[label] = index
      }
    }
  })
  newState.labels = labels
  return newState
}
