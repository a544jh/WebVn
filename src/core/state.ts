import { Command } from "./commands"

export interface VnPlayerState{
  readonly commands: Array<Command>
  readonly animatableState: AnimatableState
  //user settings, saves...
}

export interface AnimatableState {
  text: TextBox | null
  //bg, actors, bgn, sfx...
}

export interface TextBox {
  type: TextBoxType
  textNodes: Array<TextNode>
}

export interface ADVTextBox extends TextBox {
  type: TextBoxType.ADV
  nameTag: string
  nameTagColor: string
}

export const enum TextBoxType {
  ADV = "adv" , NVL = "nvl", freeform = "freeform"
}

export interface TextNode {
  text: string
  characterDelay: number
  color: string
}
