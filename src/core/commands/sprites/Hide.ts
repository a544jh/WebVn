import { z } from "zod"
import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { makeZodCmdHandler, registerCommandHandler, SourceLocation } from "../Parser"

const HideCommandSchema = z.string()

type HideCommand = z.infer<typeof HideCommandSchema>

class Hide extends Command {
  constructor(location: SourceLocation, private id: HideCommand) {
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

registerCommandHandler("hide", makeZodCmdHandler(HideCommandSchema, Hide))
