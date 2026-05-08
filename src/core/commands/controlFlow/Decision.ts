import { z } from "zod"
import { DecisionItem, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { makeZodCmdHandler, registerCommandHandler, SourceLocation } from "../Parser"

const DecisionCommandSchema = z
  .array(
    z
      .record(z.object({ jump: z.string() }))
      .refine((obj) => Object.keys(obj).length === 1, "Decision must be a single-keyed map.")
  )
  .transform((arr): DecisionItem[] =>
    arr.map((item) => {
      const title = Object.keys(item)[0]
      return { title, jumpLabel: item[title].jump }
    })
  )

type DecisionCommand = z.infer<typeof DecisionCommandSchema>

export class Decision extends Command {
  public items: DecisionItem[]

  constructor(location: SourceLocation, cmd: DecisionCommand) {
    super(location)
    this.items = cmd
  }

  public apply(state: VnPlayerState): VnPlayerState {
    return { ...state, stopAfterRender: true, decision: this.items }
  }
}

registerCommandHandler("decision", makeZodCmdHandler(DecisionCommandSchema, Decision))
