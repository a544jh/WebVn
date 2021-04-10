import { Command } from "./commands/Command"
export interface VnPlayerState {
  readonly actors: Actors
  readonly commandIndex: number
  readonly commands: Command[]
  readonly animatableState: AnimatableState
  // user settings, saves...
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

export interface Actors {
  default: DefaultActor // all actors inherit from this
  none: Actor // for "narrative" text properties
  [index: string]: Actor
}
