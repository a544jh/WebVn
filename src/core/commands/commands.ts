import { SC } from "./StatementConverter"
import { CloseTextBox } from "./text/CloseTextBox"
import { Say } from "./text/Say"

SC.setSayHandler((s) => new Say(s))

SC.registerCommandStatement("close", (c) => new CloseTextBox(c.line))
