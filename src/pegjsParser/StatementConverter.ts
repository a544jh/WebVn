import { Command } from "../core/commands/Command"
import * as parser from "./parserWrapper.js"

// Statements from pegjs parser

export interface Statement {
  type: string,
  line: number
}

export interface SayStatement extends Statement {
  type: "say",
  actor: string,
  text: string,
}

function isSayStatement(s: Statement): s is SayStatement {
  return s.type === "say"
}

export interface CommandStatement extends Statement {
  type: "command",
  command: string,
  args: string[]
}

function isCommandStatement(s: Statement): s is CommandStatement {
  return s.type === "command"
}

type SayHandler = (s: SayStatement) => Command

type CommandStatementHandler = (s: CommandStatement) => Command

interface CommandHandlers {
  [index: string]: CommandStatementHandler
}

class StatementConverter {

  private sayHandler: SayHandler
  private commandHandlers: CommandHandlers = {}

  public setSayHandler(handler: SayHandler) {
    this.sayHandler = handler
  }

  public registerCommandStatement(command: string, handler: CommandStatementHandler) {
    this.commandHandlers[command] = handler
  }

  public convertStatements(statements: Statement[]): Command[] {
    const ret: Command[] = []
    for (const s of statements) {
      if (isSayStatement(s)) {
        ret.push(this.sayHandler(s))
      } else if (isCommandStatement(s)) {
        const handler = this.commandHandlers[s.command]
        // TODO: undef check
        ret.push(handler(s))
      }
    }
    return ret
  }
}

export const SC = new StatementConverter()

export function parse(text: string): Command[] {
  const statements = parser.parse(text) as Statement[]
  return SC.convertStatements(statements)
}