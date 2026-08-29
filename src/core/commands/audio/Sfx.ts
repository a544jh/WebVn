import { z } from "zod"
import { Reference } from "../../manifest"
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

  // No exemption, `stop` included: the manifest refuses `stop` as an audio id and `apply` has no
  // stop handling the way `bgm` does, so `sfx: stop` is the one spelling that provably cannot work
  // and would otherwise be the one spelling that never warns.
  public references(): Reference[] {
    return [{ kind: "audio", id: this.cmd }]
  }
}

registerCommandHandler("sfx", makeZodCmdHandler(sfxCmdSchema, Sfx))
