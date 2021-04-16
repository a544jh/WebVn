import { VnPlayerState } from "../state"
import { Command } from "./Command"

export type SimpleCommandParser = (s: string) => Command[]

// TODO: handle multiple files and stuff at some point :)

export enum ErrorLevel {
  WARNING,
  ERROR,
}

export class ParserError {
  constructor(message: string, line: number, level: ErrorLevel) {
    this.message = message
    this.line = line
    this.level = level
  }

  message: string
  line: number
  level: ErrorLevel
}

export interface VnParser {
  updateState(text: string, state: VnPlayerState): [VnPlayerState, ParserError[]]
}
