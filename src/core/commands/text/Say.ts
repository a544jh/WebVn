import { Actor, ADVNameTag, ADVTextBox, NARRATOR_ACTOR_ID, TextBoxType, TextMode, TextNode, VnPlayerState } from "../../state"
import { Command } from "../Command"
import { Decision } from "../controlFlow/Decision"
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

    const animatableState = { ...state.animatableState }

    if (state.mode == TextMode.ADV) {
      const text: ADVTextBox = {
        type: TextBoxType.ADV,
        nameTag,
        textNodes,
      }
      animatableState.text = text
    } else if (state.mode == TextMode.freeform) {
      const ip = state.animatableState.freeformInsertionPoint
      const existingBox = state.animatableState.freeformText.find(b => b.x == ip.x && b.y == ip.y && b.width == ip.width)
      const newBoxes = [...state.animatableState.freeformText]

      const newlineNode = [
        {
          text: '\n',
          characterDelay: 20,
          color,
        },
      ]

      if (existingBox) {
        newBoxes[newBoxes.indexOf(existingBox)] = {...existingBox, textNodes: existingBox.textNodes.concat(newlineNode, textNodes)}
      } else {
        newBoxes.push({...ip, textNodes})
      }
      animatableState.freeformText = newBoxes
    }


    const stopAfterRender = !(state.commands[state.commandIndex + 1] instanceof Decision)

    const newState = { ...state, animatableState, stopAfterRender }

    return newState
  }
}
