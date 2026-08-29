import { Reference } from "../manifest"
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
  public apply(state: VnPlayerState): VnPlayerState {
    return state
  }
  // The ids this command expects the manifest to declare. A command names its own reserved values
  // here - `#` a colour, `stop` silence - rather than the pass knowing them, so what a value means
  // stays with the command that gives it meaning.
  public references(): Reference[] {
    return []
  }
  // Whether the command still does something worth doing when one of those ids is undeclared. False
  // for a command that is nothing but its reference, which the pass then replaces with a NoOp; true
  // for `Say`, whose text does not depend on the actor it names. See
  // docs/adr/0004-an-undeclared-reference-neutralizes-its-command.md.
  public survivesUndeclaredReference(): boolean {
    return false
  }
}
