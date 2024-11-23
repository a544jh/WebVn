import { z } from "zod";
import { TextMode, VnPlayerState } from "../../state";
import { Command } from "../Command";
import { makeZodCmdHandler, registerCommandHandler, SourceLocation } from "../Parser";

const modeCmdSchema = z.nativeEnum(TextMode)

type ModeCmd = z.infer<typeof modeCmdSchema>

export class Mode extends Command {
  private mode: TextMode

  constructor(location: SourceLocation, cmd: ModeCmd) {
    super(location)
    this.mode = cmd
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newState = { ...state, mode: this.mode, animatableState: { ...state.animatableState, freeformText: [], text: null } }
    return newState
  }
}

registerCommandHandler("mode", makeZodCmdHandler(modeCmdSchema, Mode))