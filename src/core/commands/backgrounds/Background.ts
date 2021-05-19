import { Background, ViewBox, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"
import { AnyZodObject, z, ZodError, ZodTypeAny } from "zod"

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
      waitForPan: false, // TODO handle
      transition: this.cmd.transition,
      transitonDuration: this.cmd.duration,
      transitionOptions: this.cmd.options,
      shouldTransition: true,
    }
    return {
      ...state,
      animatableState: { ...state.animatableState, background: newBackground },
      stopAfterRender: false,
    }
  }
}

export const registeredSchemas: Record<string, z.ZodTypeAny> = {}

export function registerSchema(transition: string, schema: ZodTypeAny): void {
  registeredSchemas[transition] = schema
  const registeredTransitions = Object.keys(registeredSchemas) as [string, ...string[]]
  BgCommandSchema = BgCommandSchema.extend({ transition: z.enum(registeredTransitions) })
}

const registeredTransitions = Object.keys(registeredSchemas) as [string, ...string[]]

const ViewBoxSchema = z.number().array().length(4)
type ViewBoxArr = z.infer<typeof ViewBoxSchema>

let BgCommandSchema = z.object({
  transition: z.enum(registeredTransitions),
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
    const optionsSchema = registeredSchemas[cmd.transition]
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
