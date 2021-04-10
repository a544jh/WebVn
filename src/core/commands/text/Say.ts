import { Actor, ADVNameTag, ADVTextBox, TextBoxType, TextNode, VnPlayerState } from "../../state"
import { Command } from "../Command"

export class Say extends Command {
  private text: string
  private actor?: string

  constructor(line: number, actor: string, text: string) {
    super(line)
    this.text = text
    this.actor = actor
  }

  public apply(state: VnPlayerState): VnPlayerState {

    // TODO: handle undefined actor
    const actor: Actor = state.actors[this.actor || "none"]
    const color: string = actor.textColor || state.actors.default.textColor

    let nameTag: ADVNameTag | undefined
    if (actor.name) {
      nameTag = {
        name: actor.name,
        color: actor.nameTagColor || state.actors.default.nameTagColor,
      }
    }

    const textNodes: TextNode[] = [{
      text: this.text,
      characterDelay: 20,
      color,
    }]
    const text: ADVTextBox = {
      type: TextBoxType.ADV,
      nameTag,
      textNodes,
    }

    const animatableState = { ...state.animatableState, text }
    const newState = { ...state, animatableState }

    return newState
  }
}
