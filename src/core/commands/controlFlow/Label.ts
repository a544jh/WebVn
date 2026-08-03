import { z } from "zod"
import { VnPlayerState } from "../../state"
import { Command } from "../Command"
import { makeZodCmdHandler, registerCommandHandler, SourceLocation } from "../Parser"
import "./Jump"

const LabelCommandSchema = z.string()

type LabelCommand = z.infer<typeof LabelCommandSchema>

export class Label extends Command {
  public name: string

  constructor(location: SourceLocation, cmd: LabelCommand) {
    super(location)
    this.name = cmd
  }

  public apply(state: VnPlayerState): VnPlayerState {
    return { ...state, stopAfterRender: false }
  }
}

registerCommandHandler("label", makeZodCmdHandler(LabelCommandSchema, Label))

export function updateLabels(state: VnPlayerState): VnPlayerState {
  const newState = { ...state }
  const labels: Record<string, number> = {}
  state.commands.forEach((command, index) => {
    if (command instanceof Label) {
      const label = command.name
      if (labels[label] !== undefined) {
        throw new Error(`Label ${label} already exists in story.`)
      } else {
        labels[label] = index
      }
    }
  })
  newState.labels = labels
  return newState
}
