import { VnPlayerState } from "../state"
import { Command } from "./Command"

export type SimpleCommandParser = (s: string) => Command[]

// TODO: handle multiple files and stuff at some point :)

export enum ErrorLevel {
  WARNING,
  ERROR,
}

export interface SourceLocation {
  startLine: number
  endLine: number
}

export class ParserError {
  constructor(message: string, location: SourceLocation, level: ErrorLevel) {
    this.message = message
    this.location = location
    this.level = level
  }

  message: string
  location: SourceLocation
  level: ErrorLevel
}

export type ObjectToCommand = (obj: unknown, location: SourceLocation) => Command | ParserError

interface CommandHandlers {
  [index: string]: ObjectToCommand
}

const registeredCommands: CommandHandlers = {}

export const registerCommandHandler = (command: string, handler: ObjectToCommand): void => {
  if (command[0] !== command[0].toLowerCase()) {
    throw new Error(`Command ${command} must be non-capitalized. Capitalized keys are reserved for actors.`)
  }
  if (registeredCommands[command] !== undefined) {
    throw new Error(`Command ${command} already registered`)
  }
  registeredCommands[command] = handler
}

export const getCommandHandler = (command: string): ObjectToCommand | undefined => {
  return registeredCommands[command]
}

export interface VnParser {
  updateState(text: string, state: VnPlayerState): [VnPlayerState, ParserError[]]
}

// https://fettblog.eu/typescript-hasownproperty/
export function tsHasOwnProperty<X extends unknown, Y extends PropertyKey>(
  obj: X,
  prop: Y
): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}
