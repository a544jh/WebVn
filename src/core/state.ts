import { Command } from "./commands/Command"
export interface VnPlayerState {
  readonly actors: Actors
  readonly backgrounds: string[]
  readonly audioAssets: string[]
  readonly commandIndex: number
  readonly commands: Command[]
  readonly labels: Record<string, number>
  readonly stopAfterRender: boolean
  readonly animatableState: AnimatableState
  readonly decision: DecisionItem[] | null
  readonly variables: Record<string, VnVariableValue>
  // user settings, saves...
}

export interface AnimatableState {
  readonly text: TextBox | null
  readonly sprites: Record<string, Sprite>
  readonly background: Background
  readonly audio: AudioState
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
  ADV = "adv",
  NVL = "nvl",
  freeform = "freeform",
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
  sprites?: string[]
}

export const NARRATOR_ACTOR_ID = "narrator"

export interface Actors {
  default: DefaultActor // all actors inherit from this
  [NARRATOR_ACTOR_ID]: Actor // the unnamed actor, for "narrative" text
  [index: string]: Actor
}

export interface DecisionItem {
  title: string
  jumpLabel: string
  // TODO show based on variable, previously selected etc...
}

export type VnVariableValue = string | number | boolean

export interface Sprite {
  actor: string
  sprite: string
  x: number
  y: number
  anchorX: number
  anchorY: number
}

export interface Background {
  image: string
  panFrom?: ViewBox
  panTo?: ViewBox
  panDuration: number
  waitForPan: boolean
  transition: string
  transitonDuration: number
  transitionOptions?: unknown
  shouldTransition: boolean
}

export interface ViewBox {
  x: number
  y: number
  h: number
  w: number
}

export interface AudioState {
  bgm: string | null
  loopBgm: boolean
  sfx: string | null
}
