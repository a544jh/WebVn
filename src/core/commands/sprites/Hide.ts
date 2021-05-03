import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"

class Hide extends Command {
  constructor(location: SourceLocation, private id: string) {
    super(location)
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newSprites = { ...state.animatableState.sprites }
    delete newSprites[this.id]

    const newState = { ...state, stopAfterRender: false }
    newState.animatableState = { ...state.animatableState, sprites: newSprites }
    return newState
  }
}

registerCommandHandler("hide", (obj, location) => {
  if (typeof obj !== "string") {
    return new ParserError("Sprite id must be a string.", location, ErrorLevel.WARNING)
  }
  return new Hide(location, obj)
})
