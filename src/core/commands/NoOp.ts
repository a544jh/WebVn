import { Command } from "./Command"

// What a command naming an undeclared id becomes. It needs no behaviour of its own: `Command.apply`
// returns the state untouched and `State.advance` resets the one-off flags before applying, so the
// story advances straight through it and the inert cases get their behaviour for free.
//
// It exists so the substitution is index-stable. `VnPath` records user actions against command
// indices and every save is a path, so dropping the command instead would shift every later index
// and invalidate every saved game in the project. Declaring the missing id and reparsing mints the
// real command back at the same index.
//
// Carrying the command it replaced costs nothing and makes a stack trace or a debugger session
// legible - it is the only thing left saying what the line was meant to do.
export class NoOp extends Command {
  constructor(public readonly replaced: Command) {
    super(replaced.getSourceLocation())
  }
}
