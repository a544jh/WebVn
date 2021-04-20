import { VnPlayerState } from "../../state";
import { Command } from "../Command";
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser";

export class Jump extends Command {
  constructor(location: SourceLocation, targetLabel: string) {
    super(location)
    this.targetLabel = targetLabel
  }
  targetLabel: string

  public apply(state: VnPlayerState): VnPlayerState {
    const newState = {...state}
    if (state.labels[this.targetLabel] === undefined) {
      throw new Error("Target label does not exist.")
    }
    newState.commandIndex = state.labels[this.targetLabel]
    newState.stopAfterRender = false
    return newState
  }
}

registerCommandHandler("jump", (obj, location) => {
  if (typeof obj === "string") {
    return new Jump(location, obj)
  }
  return new ParserError("Target label must be a string.", location, ErrorLevel.WARNING)
})