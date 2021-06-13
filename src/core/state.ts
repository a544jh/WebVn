import { ConsecutiveIntegerSet } from "../lib/ConsequtiveIntegerSet"
import { Command } from "./commands/Command"
import { VnPath } from "./vnPath"
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
  seenCommands: ConsecutiveIntegerSet // should maybe be global instead (mutable...)
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

function advance(state: VnPlayerState): VnPlayerState {
  if (state.decision !== null) return state

  let newState = { ...state }

  // TODO: after-render, pre-command hooks for "one off" things?

  newState.animatableState = {
    ...state.animatableState,
    background: { ...state.animatableState.background, shouldTransition: false },
    audio: { ...state.animatableState.audio, sfx: null },
  }
  newState.stopAfterRender = false

  // TODO: if we implement custom sprite removal effects,
  // sprites to be removed should actually be deleted from the state here..

  if (newState.commandIndex < newState.commands.length) {
    newState.seenCommands.add(newState.commandIndex)
    newState = newState.commands[newState.commandIndex].apply(newState)
    // if applied command doesn't change the next command (jumps), go to the next one
    if (newState.commandIndex === state.commandIndex) newState.commandIndex++
  }
  return newState
}

function makeDecision(id: number, state: VnPlayerState): VnPlayerState {
  if (state.decision === null) return state
  if (id < 0 || id > state.decision.length - 1) return state
  const item = state.decision[id]

  const newState = { ...state }
  if (state.labels[item.jumpLabel] === undefined) {
    throw new Error("Target label does not exist.")
  }
  newState.commandIndex = state.labels[item.jumpLabel]
  newState.stopAfterRender = false
  newState.decision = null
  return newState
}

function goToCommandDirect(cmdIndex: number, state: VnPlayerState): VnPlayerState {
  if (cmdIndex < 1 || cmdIndex > state.commands.length) {
    return state
  }
  state = { ...state, commandIndex: cmdIndex - 1, decision: null }
  return advance(state)
}

function advanceUntilStop(state: VnPlayerState): VnPlayerState {
  let advances = 0
  state = advance(state)
  while (!state.stopAfterRender) {
    state = advance(state)
    advances++
    if (advances > 10000) {
      alert("Looks like we're stuck in an infinite loop")
      throw new Error("Got stuck in infinite loop while replaying path")
    }
  }
  return state
}

function fromPath(startingState: VnPlayerState, path: VnPath): VnPlayerState {
  let state = startingState
  for (const action of path.getActions()) {
    state = action.perform(state)
  }
  return state
}

function fromShorthandPath(
  startingState: VnPlayerState,
  decisions: number[],
  remainingAdvances: number
): [VnPlayerState, VnPath] {
  let path = VnPath.emptyPath()
  let state = startingState
  let decisionIndex = 0
  while (decisionIndex < decisions.length) {
    let advances = 0
    while (state.decision === null) {
      state = advance(state)
      if (state.stopAfterRender) {
        path = path.advance()
      }
      advances++
      if (advances > 10000) {
        alert("Looks like we're stuck in an infinite loop")
        throw new Error("Got stuck in infinite loop while replaying path")
      }
    }
    state = makeDecision(decisions[decisionIndex], state)
    path = path.makeDecision(decisions[decisionIndex])
    decisionIndex++
  }
  state = advanceUntilStop(state)
  path = path.advance()
  while (remainingAdvances > 0) {
    state = advanceUntilStop(state)
    path = path.advance()
    remainingAdvances--
  }
  return [state, path]
}

export const State = {
  advance,
  makeDecision,
  goToCommandDirect,
  advanceUntilStop,
  fromShorthandPath,
  fromPath,
}
