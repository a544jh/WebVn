import { VnPlayerState } from "../state"
import { Command } from "./Command"

export type SimpleCommandParser = (s: string) => Command[]

// TODO: handle multiple files and stuff at some point :)

export interface VnParser {
  updateState(text: string, state: VnPlayerState): VnPlayerState
}
