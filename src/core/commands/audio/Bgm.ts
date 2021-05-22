import { z, ZodError } from "zod"
import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"

class Bgm extends Command {
  constructor(location: SourceLocation, private cmd: BgmCommand) {
    super(location)
  }

  apply(state: VnPlayerState): VnPlayerState {
    let audio: string | null
    let loop: boolean
    if (typeof this.cmd === "string") {
      audio = this.cmd
      loop = true
    } else {
      audio = this.cmd.audio
      loop = this.cmd.loop
    }

    if (audio === "stop") audio = null

    return {
      ...state,
      animatableState: {
        ...state.animatableState,
        audio: { ...state.animatableState.audio, bgm: audio, loopBgm: loop },
      },
    }
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

registerCommandHandler("bgm", (obj: unknown, location: SourceLocation): Command | ParserError => {
  try {
    const cmd = BgmCommandSchema.parse(obj)
    return new Bgm(location, cmd)
  } catch (e) {
    const zodError = e as ZodError
    return new ParserError(zodError.message, location, ErrorLevel.WARNING)
  }
})
