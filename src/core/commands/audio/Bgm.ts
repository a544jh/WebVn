import { z } from "zod"
import { Reference } from "../../manifest"
import { STOP_AUDIO_ID, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { makeZodCmdHandler, registerCommandHandler, SourceLocation } from "../Parser"

class Bgm extends Command {
  constructor(location: SourceLocation, private cmd: BgmCommand) {
    super(location)
  }

  // A bare string is the track, looping; the map form says so with a field. Written once, so the
  // id `apply` plays and the id `references` checks cannot come apart.
  private audioId(): string {
    return typeof this.cmd === "string" ? this.cmd : this.cmd.audio
  }

  apply(state: VnPlayerState): VnPlayerState {
    let audio: string | null = this.audioId()
    const loop = typeof this.cmd === "string" ? true : this.cmd.loop

    if (audio === STOP_AUDIO_ID) audio = null

    return {
      ...state,
      animatableState: {
        ...state.animatableState,
        audio: { ...state.animatableState.audio, bgm: audio, loopBgm: loop },
      },
    }
  }

  // `stop` is how a script stops the music, not a track anything could declare - the manifest
  // schema refuses it as an id for that reason.
  public references(): Reference[] {
    if (this.audioId() === STOP_AUDIO_ID) return []
    return [{ kind: "audio", id: this.audioId() }]
  }
}

const BgmCommandSchema = z.union([
  z.object({
    audio: z.string(),
    loop: z.boolean().optional().default(true),
  }),
  z.string(),
])

type BgmCommand = z.infer<typeof BgmCommandSchema>

registerCommandHandler("bgm", makeZodCmdHandler(BgmCommandSchema, Bgm))
