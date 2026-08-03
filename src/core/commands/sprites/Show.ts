import { z } from "zod"
import { Sprite, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { makeZodCmdHandler, registerCommandHandler, SourceLocation } from "../Parser"

const ShowCommandSchema = z.object({
  actor: z.string(),
  sprite: z.string(),
  id: z.string().optional(),
  position: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  anchorX: z.number().optional(),
  anchorY: z.number().optional(),
})

type ShowCommand = z.infer<typeof ShowCommandSchema>

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
    } // TODO: better default position handling .. if any coord set default should be zero ...

    const newSprites = { ...state.animatableState.sprites, [this.cmd.actor]: newSprite }
    const newState = { ...state, stopAfterRender: false }
    newState.animatableState = { ...state.animatableState, sprites: newSprites }

    return newState
  }
}

registerCommandHandler("show", makeZodCmdHandler(ShowCommandSchema, Show))
