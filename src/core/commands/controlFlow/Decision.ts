import { DecisionItem, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { ErrorLevel, ParserError, registerCommandHandler, SourceLocation } from "../Parser"

export class Decision extends Command {
  items: DecisionItem[]

  constructor(location: SourceLocation, items: DecisionItem[]) {
    super(location)
    this.items = items
  }

  public apply(state: VnPlayerState): VnPlayerState {
    return { ...state, stopAfterRender: true, decision: this.items }
  }
}

registerCommandHandler("decision", (obj, location) => {
  const decisionItems: DecisionItem[] = []

  if (!Array.isArray(obj)) {
    return new ParserError("Decisions must be a seq.", location, ErrorLevel.WARNING)
  }
  for (const item of obj) {
    if (typeof item !== "object") {
      return new ParserError("Decision must be a single-keyed map.", location, ErrorLevel.WARNING)
    }
    if (Object.keys(item).length !== 1) {
      return new ParserError("Decision must be a single-keyed map.", location, ErrorLevel.WARNING)
    }
    const title = Object.keys(item)[0]
    const value = item[title]
    if (typeof value !== "object") {
      return new ParserError(`Decision "${title}"'s value must be a map.`, location, ErrorLevel.WARNING)
    }
    const jumpLabel = value.jump
    if (typeof jumpLabel !== "string")
      return new ParserError(`Decision "${title}" must have a jump label`, location, ErrorLevel.WARNING)
    const decisionItem: DecisionItem = { title, jumpLabel }
    decisionItems.push(decisionItem)
  }

  return new Decision(location, decisionItems)
})
