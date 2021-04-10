import { VnPlayerState } from "../state"

export abstract class Command {
  private line: number
  constructor(line: number) {
    this.line = line
  }
  public getLine(): number {
    return this.line
  }
  public abstract apply(state: VnPlayerState): VnPlayerState
}
