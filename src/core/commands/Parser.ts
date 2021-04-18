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

export interface VnParser {
  updateState(text: string, state: VnPlayerState): [VnPlayerState, ParserError[]]
}
