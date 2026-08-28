import { z } from "zod"
import { SpriteInstance, VnPlayerState } from "../../state"
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
    const newSprite: SpriteInstance = {
      actor: this.cmd.actor,
      sprite: this.cmd.sprite,
      x: this.cmd.x === undefined ? 0.5 : this.cmd.x,
      y: this.cmd.y === undefined ? 0.5 : this.cmd.y,
      anchorX: this.cmd.anchorX === undefined ? 0.5 : this.cmd.anchorX,
      anchorY: this.cmd.anchorY === undefined ? 0.5 : this.cmd.anchorY,
    } // TODO: better default position handling .. if any coord set default should be zero ...

    // The id is the identity of a thing on screen, and it defaults to the actor - which is the key
    // every script written before ids already wrote to. Naming one puts the same actor on screen
    // more than once; `hide` takes the same id back, since the two share one namespace.
    const newSprites = { ...state.animatableState.sprites, [this.cmd.id ?? this.cmd.actor]: newSprite }
    const newState = { ...state, stopAfterRender: false }
    newState.animatableState = { ...state.animatableState, sprites: newSprites }

    return newState
  }
}

registerCommandHandler("show", makeZodCmdHandler(ShowCommandSchema, Show))
