import { Sprite, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation, tsHasOwnProperty } from "../Parser"

interface ShowCommand {
  actor: string
  sprite: string
  id?: string //TODO handle..
  postion?: string //TODO preset positions...
  x?: number
  y?: number
  anchorX?: number
  anchorY?: number
}

class Show extends Command {
  constructor(location: SourceLocation, public cmd: ShowCommand) {
    super(location)
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newSprite: Sprite = {
      actor: this.cmd.actor,
      sprite: this.cmd.sprite,
      x: this.cmd.x === undefined ? 0.5 : this.cmd.x,
      y: this.cmd.y === undefined ? 0.5 : this.cmd.y,
      anchorX: this.cmd.anchorX === undefined ? 0.5 : this.cmd.anchorX,
      anchorY: this.cmd.anchorY === undefined ? 0.5 : this.cmd.anchorY,
    } // TODO: better default postion handling .. if any coord set default should be zero ...

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

  try {
    const cmd = new Show(location, {
      actor,
      sprite,
      x: getOptionalNumber(obj, "x"),
      y: getOptionalNumber(obj, "y"),
      anchorX: getOptionalNumber(obj, "anchorX"),
      anchorY: getOptionalNumber(obj, "anchorY"),
    })
    return cmd
  } catch (e) {
    const msg = (e as Error).message
    return new ParserError(msg, location, ErrorLevel.WARNING)
  }
})

// TODO move to utils maybe... or make/use a validation library...
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

function getOptionalNumber(obj: unknown, prop: string): number | undefined {
  if (!tsHasOwnProperty(obj, prop)) return undefined
  const value = obj[prop]
  if (typeof value === "number" || value === undefined) {
    return value
  }
  throw new Error(`${prop} must be a number.`)
}
