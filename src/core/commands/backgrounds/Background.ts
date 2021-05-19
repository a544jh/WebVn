import { Background, ViewBox, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"
import { z, ZodError } from "zod"

class SetBackground extends Command {
  constructor(location: SourceLocation, private cmd: BgCommand) {
    super(location)
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const newBackground: Background = {
      image: this.cmd.image,
      panDuration: this.cmd.pan?.duration || 3000,
      panFrom: parseViewBox(this.cmd.pan?.from),
      panTo: parseViewBox(this.cmd.pan?.to),
      waitForPan: false,
      transition: this.cmd.transition,
      transitonDuration: this.cmd.duration,
      transitionOptions: this.cmd.options,
      shouldTransition: true,
    }
    return { ...state, animatableState: { ...state.animatableState, background: newBackground } }
  }
}

const BlindTransitionSchema = z.object({
  slices: z.number().optional(),
  staggerFactor: z.number().optional(),
})

export type BlindsTransitionOptions = z.infer<typeof BlindTransitionSchema>

// TODO: renderer should register supported transtions here...
export const registeredTransitions: Record<string, z.AnyZodObject> = {
  blinds: BlindTransitionSchema,
}

const registeredTransitionKeys = Object.keys(registeredTransitions) as [string, ...string[]]

const ViewBoxSchema = z.number().array().length(4)
type ViewBoxArr = z.infer<typeof ViewBoxSchema>

const BgCommandSchema = z.object({
  transition: z.enum(registeredTransitionKeys),
  options: z.optional(z.unknown()),
  duration: z.number(),
  image: z.string(),
  pan: z.optional(
    z.object({
      from: z.optional(ViewBoxSchema),
      to: z.optional(ViewBoxSchema),
      duration: z.optional(z.number()),
    })
  ),
})

type BgCommand = z.infer<typeof BgCommandSchema>

function bgCommandHandler(obj: unknown, location: SourceLocation): SetBackground | ParserError {
  try {
    const cmd = BgCommandSchema.parse(obj)
    const options = cmd.options
    if (options === undefined) {
      return new SetBackground(location, cmd)
    }
    const optionsSchema = registeredTransitions[cmd.transition]
    const CmdWOptsSchema = BgCommandSchema.extend({ options: optionsSchema })
    const cmdWOpts = CmdWOptsSchema.parse(obj)
    return new SetBackground(location, cmdWOpts)
  } catch (e) {
    const zodError = e as ZodError
    return new ParserError(zodError.message, location, ErrorLevel.WARNING)
  }
}

registerCommandHandler("bg", bgCommandHandler)

function parseViewBox(arr: ViewBoxArr | undefined): ViewBox | undefined {
  if (arr === undefined) return undefined
  const [x, y, w, h] = arr
  const box: ViewBox = { x, y, w, h }
  return box
}
