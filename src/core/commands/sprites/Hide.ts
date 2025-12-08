import { z } from "zod"
import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { makeZodCmdHandler, registerCommandHandler, SourceLocation } from "../Parser"

class Hide extends Command {
  constructor(location: SourceLocation, private cmd: HideCommand) {
    super(location)
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newSprites = { ...state.animatableState.sprites }
    delete newSprites[this.cmd.id]

    const newState = { ...state, stopAfterRender: false }
    newState.animatableState = { ...state.animatableState, sprites: newSprites }
    return newState
  }
}

const HideCommandSchema = z
  .union([z.string(), z.object({ id: z.string() })])
  .transform((value) => (typeof value === "string" ? { id: value } : value))

type HideCommand = z.infer<typeof HideCommandSchema>

registerCommandHandler("hide", makeZodCmdHandler(HideCommandSchema, Hide))
