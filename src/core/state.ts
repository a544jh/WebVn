import { Command } from "./commands"

export interface VnPlayerState {
  readonly commandIndex: number
  readonly commands: Command[]
  readonly animatableState: AnimatableState
  // user settings, saves...
}

export interface AnimatableState {
  text: TextBox | null
  // bg, actors, bgn, sfx...
}

export type TextBox = ADVTextBox | null

interface ITextBox {
  type: TextBoxType
  textNodes: TextNode[]
}

export interface ADVTextBox extends ITextBox {
  type: TextBoxType.ADV
  nameTag?: string
  nameTagColor?: string
}

export const enum TextBoxType {
  ADV = "adv" , NVL = "nvl", freeform = "freeform",
}

export interface TextNode {
  text: string
  characterDelay: number
  color: string
}
