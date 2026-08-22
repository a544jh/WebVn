// Building commands the way the YAML parser does, for the suites that need command instances
// without going through a whole script. Importing player registers every command handler as a
// side effect - without it getCommandHandler finds nothing.
import "../../src/core/player"
import { Command } from "../../src/core/commands/Command"
import { getCommandHandler, ParserError, SourceLocation } from "../../src/core/commands/Parser"

// Commands built by hand all claim to come from the same line; nothing under test reads it.
export const loc: SourceLocation = { startLine: 1, endLine: 1 }

// Parsing must never throw: YamlParser calls handlers directly, so an exception
// escaping one crashes the editor's parse-on-keystroke instead of surfacing a warning.
export const parseCommand = (name: string, obj: unknown): Command | ParserError => {
  const handler = getCommandHandler(name)
  if (handler === undefined) throw new Error(`${name} command not registered`)
  return handler(obj, loc)
}

// Same, for the command classes that aren't exported: build one through its registered handler
// and insist that it parsed.
export const makeCommand = (name: string, obj: unknown): Command => {
  const result = parseCommand(name, obj)
  if (result instanceof ParserError) throw new Error(`failed to parse ${name} command: ${result.message}`)
  return result
}
