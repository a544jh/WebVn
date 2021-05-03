import { Sprite, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation, tsHasOwnProperty } from "../Parser"

interface ShowCommand {
  actor: string
  sprite: string
  id?: string //TODO handle..
  postion?: string //TODO...
}

class Show extends Command {
  constructor(location: SourceLocation, public cmd: ShowCommand) {
    super(location)
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newSprite: Sprite = {
      actor: this.cmd.actor,
      sprite: this.cmd.sprite,
      x: 0,
      y: 0,
    }

    const newSprites = { ...state.animatableState.sprites, [this.cmd.actor]: newSprite }
    const newState = { ...state, stopAfterRender: false }
    newState.animatableState = { ...state.animatableState, sprites: newSprites }

    return newState
  }
}

registerCommandHandler("show", (obj, location) => {
  if (typeof obj !== "object" || obj === null) {
    return new ParserError("Show command must be a map", location, ErrorLevel.WARNING)
  }
  if (!tsHasOwnProperty(obj, "actor")) {
    return new ParserError("Show command must have actor property", location, ErrorLevel.WARNING)
  }
  const actor = getRequiredProperty(obj, "actor", location)
  if (actor instanceof ParserError) return actor
  const sprite = getRequiredProperty(obj, "sprite", location)
  if (sprite instanceof ParserError) return sprite

  return new Show(location, { actor, sprite })
})

// TODO move to utils maybe...
function getRequiredProperty(obj: unknown, prop: string, location: SourceLocation): string | ParserError {
  if (!tsHasOwnProperty(obj, prop)) {
    return new ParserError(`Show command must have ${prop} property.`, location, ErrorLevel.WARNING)
  }
  const val = obj[prop]
  if (typeof val !== "string") {
    return new ParserError(`${prop} must be a string.`, location, ErrorLevel.WARNING)
  }
  return val
}
