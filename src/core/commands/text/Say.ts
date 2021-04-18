import { Actor, ADVNameTag, ADVTextBox, NARRATOR_ACTOR_ID, TextBoxType, TextNode, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { SourceLocation } from "../Parser"

export class Say extends Command {
  private text: string
  private actorName: string

  constructor(location: SourceLocation, actor: string, text: string) {
    super(location)
    this.text = text
    this.actorName = actor
  }

  public apply(state: VnPlayerState): VnPlayerState {
    const actorObj: Actor = state.actors[this.actorName] || state.actors.default
    const color: string = actorObj?.textColor || state.actors.default.textColor

    let nameTag: ADVNameTag | undefined
    if (this.actorName !== NARRATOR_ACTOR_ID) {
      nameTag = {
        name: actorObj.name || this.actorName,
        color: actorObj.nameTagColor || state.actors.default.nameTagColor,
      }
    }

    const textNodes: TextNode[] = [
      {
        text: this.text,
        characterDelay: 20,
        color,
      },
    ]
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
