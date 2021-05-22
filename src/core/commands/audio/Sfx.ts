import { z } from "zod"
import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { makeZodCmdHandler, registerCommandHandler, SourceLocation } from "../Parser"

const sfxCmdSchema = z.string()

type SfxCmd = z.infer<typeof sfxCmdSchema>

class Sfx extends Command {
  constructor(location: SourceLocation, private cmd: SfxCmd) {
    super(location)
  }

  apply(state: VnPlayerState): VnPlayerState {
    return {
      ...state,
      animatableState: { ...state.animatableState, audio: { ...state.animatableState.audio, sfx: this.cmd } },
    }
  }
}

registerCommandHandler("sfx", makeZodCmdHandler(sfxCmdSchema, Sfx))
