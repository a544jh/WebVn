import { SC } from "./StatementConverter"
import { CloseTextBox } from "../core/commands/text/TextBox"
import { Say } from "../core/commands/text/Say"

SC.setSayHandler((s) => new Say({ startLine: s.line, endLine: s.line }, s.actor, s.text))

SC.registerCommandStatement("close", (c) => new CloseTextBox({ startLine: c.line, endLine: c.line }))
