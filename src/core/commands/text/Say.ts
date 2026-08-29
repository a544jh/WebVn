import {
  Actor,
  ADVNameTag,
  ADVTextBox,
  DEFAULT_ACTOR_ID,
  NARRATOR_ACTOR_ID,
  TextBoxType,
  TextMode,
  TextNode,
  VnPlayerState,
} from "../../state"
import { Reference } from "../../manifest"
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
      const existingBox = state.animatableState.freeformText.find(
        (b) => b.x == ip.x && b.y == ip.y && b.width == ip.width
      )
      const newBoxes = [...state.animatableState.freeformText]

      const newlineNode = [
        {
          text: "\n",
          characterDelay: 20,
          color,
        },
      ]

      if (existingBox) {
        newBoxes[newBoxes.indexOf(existingBox)] = {
          ...existingBox,
          textNodes: existingBox.textNodes.concat(newlineNode, textNodes),
        }
      } else {
        newBoxes.push({ ...ip, textNodes })
      }
      animatableState.freeformText = newBoxes
    }

    const stopAfterRender = !(state.commands[state.commandIndex + 1] instanceof Decision)

    const newState = { ...state, animatableState, stopAfterRender }

    return newState
  }

  // The engine's own two actors are exempt: `narrator` is the unnamed voice a plain line is said in
  // and `default` is what every other actor inherits from, so neither is a project's to declare.
  public references(): Reference[] {
    if (this.actorName === NARRATOR_ACTOR_ID || this.actorName === DEFAULT_ACTOR_ID) return []
    return [{ kind: "actor", id: this.actorName }]
  }

  // The line is still said, in default styling with the raw id as its name tag - the fallback above,
  // promoted from accident to decision by ADR 0004 and now accompanied by a warning. Dropping a line
  // of dialogue to punish a misspelt name is a larger hole than showing it in the wrong colour.
  public survivesUndeclaredReference(): boolean {
    return true
  }
}
