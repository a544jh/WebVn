import { Command } from "./commands/Command"
import { Label } from "./commands/controlFlow/Label"
export interface VnPlayerState {
  readonly actors: Actors
  readonly commandIndex: number
  readonly commands: Command[]
  readonly labels: Labels
  readonly animatableState: AnimatableState
  // user settings, saves...
}

export interface Labels {
  [index: string]: number
}

export interface AnimatableState {
  text: TextBox | null
  // bg, actors, bgn, sfx...
}

export type TextBox = ADVTextBox | null

interface ITextBox {
  type: TextBoxType
  textNodes: TextNode[]
}

export interface ADVTextBox extends ITextBox {
  type: TextBoxType.ADV
  nameTag?: ADVNameTag
}

export interface ADVNameTag {
  name: string
  color: string
}

export const enum TextBoxType {
  ADV = "adv" , NVL = "nvl", freeform = "freeform",
}

export interface TextNode {
  text: string
  characterDelay: number
  color: string
}

export interface DefaultActor extends Actor {
  nameTagColor: string
  textColor: string
}

export interface Actor {
  name?: string
  nameTagColor?: string
  textColor?: string
}

export const NARRATOR_ACTOR_ID = "narrator"

export interface Actors {
  default: DefaultActor // all actors inherit from this
  [NARRATOR_ACTOR_ID]: Actor // the unnamed actor, for "narrative" text
  [index: string]: Actor
}

export function updateLabels(state: VnPlayerState): VnPlayerState {
  const newState = {...state}
  const lables: Labels = {}
  state.commands.forEach((command, index) => {
    if (command instanceof Label) {
      const lable = command.name
      if(lables[lable] !== undefined) {
        throw new Error(`Label ${lable} already exists in story.`)
      } else {
        lables[lable] = index
      }
    }
  })
  newState.labels = lables
  return newState
}