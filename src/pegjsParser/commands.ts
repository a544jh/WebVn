import { SC } from "./StatementConverter"
import { CloseTextBox } from "../core/commands/text/CloseTextBox"
import { Say } from "../core/commands/text/Say"

SC.setSayHandler((s) => new Say(s.line, s.actor, s.text))

SC.registerCommandStatement("close", (c) => new CloseTextBox(c.line))
