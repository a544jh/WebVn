import { z } from "zod";
import { VnPlayerState } from "../../state";
import { Command } from "../Command";
import { makeZodCmdHandler, registerCommandHandler, SourceLocation } from "../Parser";

const freeformPosCmdSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number()
})

type FreeformPosCmd = z.infer<typeof freeformPosCmdSchema>

export class FreeformPos extends Command {

  private cmd: FreeformPosCmd

  constructor(location: SourceLocation, cmd: FreeformPosCmd) {
    super(location)
    this.cmd = cmd
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newState: VnPlayerState = { ...state, animatableState: {...state.animatableState, freeformInsertionPoint: this.cmd} }
    return newState
  }
}

registerCommandHandler("freeformPos", makeZodCmdHandler(freeformPosCmdSchema, FreeformPos))