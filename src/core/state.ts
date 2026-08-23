import { ConsecutiveIntegerSet } from "../lib/ConsecutiveIntegerSet"
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
  readonly mode: TextMode
  readonly animatableState: AnimatableState
  readonly decision: DecisionItem[] | null
  readonly variables: Record<string, VnVariableValue>
  seenCommands: ConsecutiveIntegerSet // should maybe be global instead (mutable...)
  // user settings
}

export interface AnimatableState {
  readonly text: TextBox | null
  readonly freeformInsertionPoint: FreeformInsertionPoint
  readonly freeformText: FreeformTextBox[]
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

export enum TextBoxType {
  ADV = "adv",
  // todo maybe "note" at some point
}

export enum TextMode {
  ADV = "adv",
  freeform = "freeform",
}

export interface FreeformTextBox {
  x: number
  y: number
  width: number
  textNodes: TextNode[]
}

export interface FreeformInsertionPoint {
  x: number
  y: number
  width: number
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
  transitionDuration: number
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

  // prevent render loop if we reach last command in state
  if (newState.commandIndex == newState.commands.length) newState.stopAfterRender = true

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

// The crude jump: teleport the index and apply the target command onto whatever state is loaded.
// Nothing before it is replayed, so the scene is whatever happened to be on screen - which is the
// point of having it as the "direct" mode, and the reason it cannot be expressed as a path.
function goToCommandDirect(cmdIndex: number, state: VnPlayerState): VnPlayerState {
  if (cmdIndex < 1 || cmdIndex > state.commands.length) {
    return state
  }
  state = { ...state, commandIndex: cmdIndex - 1, decision: null }
  return advance(state)
}

// The honest jump: replay the story from the beginning, following jumps and answering decisions
// from `decisions` - the same list a save records - until the target command is reached. Everything
// before it is applied on the way, so the scene is built.
//
// It lands on the first stop at or after the target rather than on the command itself. A command
// that does not stop is not somewhere a player can ever be parked, and an advance in a path runs to
// the next stop, so stopping short would be both an unreachable state and an unrepresentable one.
//
// Returns the path it walked, so the jump leaves the player somewhere the path describes for real:
// undo pops one action and replays like any other, and the session stays saveable.
function goToCommandByReplay(
  cmdIndex: number,
  startingState: VnPlayerState,
  decisions: number[]
): [VnPlayerState, VnPath] {
  let path = VnPath.emptyPath()
  // the automatic run to the first stop is not part of the path
  let state = runToStop(startingState)
  if (cmdIndex < 1 || cmdIndex > startingState.commands.length) {
    return [state, path]
  }

  let nextDecision = 0
  let steps = 0
  while (state.commandIndex < cmdIndex) {
    if (state.decision !== null) {
      // out of recorded answers, or the story changed under one: this is as far as the save data
      // can take us, so land here and let the position marker show where that was
      if (nextDecision >= decisions.length) break
      const id = decisions[nextDecision++]
      const decided = makeDecision(id, state)
      if (decided === state) break
      path = path.makeDecision(id)
      // the run from the decision to the next stop is automatic, not a recorded advance
      state = advanceUntilStop(decided)
      continue
    }

    const before = state.commandIndex
    state = advanceUntilStop(state)
    path = path.advance()
    // the story has nowhere left to go, or it loops and the target is not on the way
    if (state.commandIndex === before) break
    if (++steps > 10000) break
  }

  return [state, path]
}

function advanceUntilStop(state: VnPlayerState): VnPlayerState {
  let advances = 0
  state = advance(state)
  while (!state.stopAfterRender) {
    state = advance(state)
    advances++
    if (advances > 10000) {
      throw new Error("Got stuck in infinite loop while replaying path")
    }
  }
  return state
}

// The unrecorded "auto-run" the renderer performs: advance only if not already stopped.
// (advanceUntilStop always forces one step - that is a recorded user advance.)
function runToStop(state: VnPlayerState): VnPlayerState {
  let advances = 0
  while (!state.stopAfterRender) {
    state = advance(state)
    advances++
    if (advances > 10000) {
      throw new Error("Got stuck in infinite loop while replaying path")
    }
  }
  return state
}

function fromPath(startingState: VnPlayerState, path: VnPath): VnPlayerState {
  // the automatic run to the first stop is not part of the path
  let state = runToStop(startingState)
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
  let state = runToStop(startingState)
  for (const id of decisions) {
    let advances = 0
    while (state.decision === null) {
      state = advanceUntilStop(state)
      path = path.advance()
      advances++
      if (advances > 10000) {
        throw new Error("Got stuck in infinite loop while replaying path")
      }
    }
    const decided = makeDecision(id, state)
    if (decided === state) {
      throw new Error("Invalid decision id in saved path")
    }
    path = path.makeDecision(id)
    // the run from the decision to the next stop is automatic, not a recorded advance
    state = advanceUntilStop(decided)
  }
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
  goToCommandByReplay,
  advanceUntilStop,
  runToStop,
  fromShorthandPath,
  fromPath,
}
