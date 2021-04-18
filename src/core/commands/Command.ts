import { VnPlayerState } from "../state"
import { SourceLocation } from "./Parser"

export abstract class Command {
  private location: SourceLocation
  constructor(location: SourceLocation) {
    this.location = location
  }
  public getSourceLocation(): SourceLocation {
    return this.location
  }
  public abstract apply(state: VnPlayerState): VnPlayerState
}
