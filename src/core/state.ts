import { ConsecutiveIntegerSet } from "../lib/ConsecutiveIntegerSet"
import { Command } from "./commands/Command"
import { VnPath } from "./vnPath"
export interface VnPlayerState {
  // The project this state belongs to, copied in by `seedState`. Inert - no command reads either,
  // and `advance` writes neither - but `id` is what saves are keyed under, and holding it here is
  // what stops a reload from ever writing one project's progress under another's key. See
  // docs/adr/0001-manifest-seeds-the-initial-state.md's 2026-08-29 amendment.
  readonly id: string
  readonly title: string
  readonly actors: Actors
  readonly backgrounds: Record<string, string>
  readonly audioAssets: Record<string, AudioAsset>
  readonly commandIndex: number
  // How many commands `advance` has applied on the way here, counted where it applies them. Only its
  // changes mean anything - see `appliedAny`.
  readonly commandsApplied: number
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
  readonly sprites: Record<string, SpriteInstance>
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
  // The images this actor can be shown in, as declared name to filename. The script names the
  // declared name, never the file, which is what makes a rename of the file a manifest edit
  // rather than a rewrite of the story.
  sprites?: Record<string, string>
}

export const NARRATOR_ACTOR_ID = "narrator"

// The engine's own two actors, which no project declares and every project gets: the unnamed voice
// a plain line is said in, and the actor all others inherit from. Both are reserved the way
// STOP_AUDIO_ID and isBackgroundColor are, so the rule that a lowercase key is one of these two is
// stated here rather than wherever it happens to be tested. `Actors` writes `default` as a property
// name below because that is what the type is; this is for the comparisons.
export const DEFAULT_ACTOR_ID = "default"

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

// One sprite on screen: which actor, shown in which of their declared sprites, and where. Keyed in
// `animatableState.sprites` by the id `show` gave it, which defaults to the actor's own name - so an
// actor is on screen once unless the script names further instances of them.
export interface SpriteInstance {
  actor: string
  sprite: string
  x: number
  y: number
  anchorX: number
  anchorY: number
}

// `bg: {image: "#000000"}` paints a colour instead of naming a background asset, and the leading
// `#` is the whole of that distinction. It lives here rather than in the renderer because both the
// renderer and the manifest schema depend on it: one reads it, and the other is what keeps an asset
// id from ever looking like one.
export const isBackgroundColor = (image: string): boolean => image.charAt(0) === "#"

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

// A declared audio asset: the file it plays, and what the pause menu can say about it while it is
// playing. `title` and `artist` are optional, so `bigthump: sfx/bigthump.ogg` stays the whole
// declaration for a sound effect nobody credits.
export interface AudioAsset {
  file: string
  title?: string
  artist?: string
}

// `bgm: stop` stops the music, so this is a word no audio asset can be keyed under. Stated here for
// the same reason as isBackgroundColor: `Bgm.apply` acts on it and the manifest schema rejects it,
// and a rule spelled in both places is a rule that can drift.
export const STOP_AUDIO_ID = "stop"

export interface AudioState {
  bgm: string | null
  loopBgm: boolean
  sfx: string | null
}

// How many commands in a row may run without reaching a stop before a walk gives up on the story as
// looping. A story is not wrong to run long between stops, but nothing a reader can wait through runs
// this long, while a `jump` back to a `label` with no stop between them runs forever. The renderer's
// own walk counts against the same number.
export const LOOP_LIMIT = 10000

// A walk to the next stop gave up, because the story goes round a loop with nothing to stop on. It is
// the author's mistake rather than the reader's, and the stage says so: the renderer catches this and
// shows its "Story error".
export class EndlessLoopError extends Error {
  constructor() {
    super(`The story loops endlessly: ${LOOP_LIMIT} commands in a row without a stop`)
    this.name = "EndlessLoopError"
  }
}

// A jump, or a decision's option, names a label the story does not have. Nothing checks that when the
// script is parsed, so it surfaces when the command is applied.
export class MissingLabelError extends Error {
  constructor(public readonly label: string) {
    super("Target label does not exist.")
    this.name = "MissingLabelError"
  }
}

// A save slot whose path no longer replays against the story - an *incompatible save*, CONTEXT.md.
// Every way that happens throws this one type, so the Load menu can catch exactly these and let
// anything else through as the bug it is.
export class IncompatibleSaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IncompatibleSaveError"
  }
}

// A replay jump that cannot reach its target by replaying from the beginning, because the story goes
// round a loop on the way there. The jump is refused, so the player stays where it was.
export class UnreachableCommandError extends Error {
  constructor(cmdIndex: number) {
    super(`Command ${cmdIndex} is not reached by replaying: the story loops on the way there`)
    this.name = "UnreachableCommandError"
  }
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
    newState.commandsApplied++
    newState = newState.commands[newState.commandIndex].apply(newState)
    // if applied command doesn't change the next command (jumps), go to the next one
    if (newState.commandIndex === state.commandIndex) newState.commandIndex++
  }

  // prevent render loop if we reach last command in state
  if (newState.commandIndex == newState.commands.length) newState.stopAfterRender = true

  return newState
}

// The jump that closes the loop a stuck walk is going round - what the editor marks, since that is
// the line the author has to change. Walks on from `state` one command at a time until a position
// comes round again, which places it inside the loop whatever led into it, and then once round the
// loop, taking the furthest command that sent the index backwards: of nested loops, the outer one.
// Null if the walk reaches a stop after all.
//
// On a fresh `seenCommands`, because `advance` marks what it applies and this walk is not the reader's.
function loopJump(state: VnPlayerState): number | null {
  let walk: VnPlayerState = { ...state, seenCommands: new ConsecutiveIntegerSet() }
  const firstSeen = new Map<string, number>()
  for (let step = 0; step <= 2 * LOOP_LIMIT; step++) {
    const at = position(walk)
    const lapStart = firstSeen.get(at)
    if (lapStart !== undefined) return closingJump(walk, step - lapStart)
    firstSeen.set(at, step)
    walk = advance(walk)
    if (walk.stopAfterRender) return null
  }
  return null
}

// Once round a loop of `lapLength` commands from a position inside it.
function closingJump(walk: VnPlayerState, lapLength: number): number | null {
  let jump: number | null = null
  for (let i = 0; i < lapLength; i++) {
    const from = walk.commandIndex
    walk = advance(walk)
    if (walk.commandIndex <= from && (jump === null || from > jump)) jump = from
  }
  return jump
}

// Whether anything was applied between two states - the one test of whether an advance did
// something. The recorder (`VnPlayer`) and the replay (`Advance.tryPerform`) both ask it, and they
// have to ask the same thing: an action recording keeps and replay refuses is a path `undo` throws on.
//
// Neither cheaper test answers it. Object identity reads as movement at the end of a story, where
// `advance` still builds a fresh snapshot, clearing the frame's transition and sfx flags, before
// finding there is nothing left to apply; that recorded actions no replay could walk. The index reads
// as standing still around a loop, which comes back to where it started having run every command in
// it; that dropped a whole lap from the path whenever skip mode or the wheel went round one.
function appliedAny(before: VnPlayerState, after: VnPlayerState): boolean {
  return after.commandsApplied !== before.commandsApplied
}

function makeDecision(id: number, state: VnPlayerState): VnPlayerState {
  if (state.decision === null) return state
  if (id < 0 || id > state.decision.length - 1) return state
  const item = state.decision[id]

  const newState = { ...state }
  if (state.labels[item.jumpLabel] === undefined) {
    throw new MissingLabelError(item.jumpLabel)
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
  try {
    return replayToCommand(cmdIndex, startingState, decisions)
  } catch (e) {
    if (e instanceof EndlessLoopError) throw new UnreachableCommandError(cmdIndex)
    throw e
  }
}

// Where a walk is, as far as where it goes next is concerned. A command is a pure function of the
// state, and the only parts of the state a command reads to decide where to go are the index and the
// variables - so a walk that comes back to the same line with the same variables, with no decision
// answered in between, will go round that way forever. A loop that counts its way out comes back
// with a different count, which is why the index alone is not the question.
// **A command that steers on anything else has to be added here**, or a working story reads as a loop.
const position = (state: VnPlayerState): string => `${state.commandIndex} ${JSON.stringify(state.variables)}`

function replayToCommand(cmdIndex: number, startingState: VnPlayerState, decisions: number[]): [VnPlayerState, VnPath] {
  let path = VnPath.emptyPath()
  // the automatic run to the first stop is not part of the path
  let state = runToStop(startingState)
  if (cmdIndex < 1 || cmdIndex > startingState.commands.length) {
    return [state, path]
  }

  let nextDecision = 0
  let steps = 0
  // the stops visited since the last decision answered: one seen again is a loop
  let visited = new Set<string>()
  while (state.commandIndex < cmdIndex) {
    if (state.decision !== null) {
      // no recorded answer for this one, so this is as far as the decisions can take us. Landing
      // here beats throwing the way MakeDecision.perform does: that replays a path which is broken
      // if it diverges, while this is speculative reuse, and the position marker shows the author
      // where it stopped.
      if (nextDecision >= decisions.length) break
      const id = decisions[nextDecision++]
      const decided = makeDecision(id, state)
      // Should not happen: getReplayableDecisions hands over only the decisions made before the
      // first direct jump, which a replay from the same starting state meets in the same order. If
      // some future path shape gets one through anyway, stop rather than trust a mismatched answer.
      if (decided === state) break
      path = path.makeDecision(id)
      // the run from the decision to the next stop is automatic, not a recorded advance
      state = advanceUntilStop(decided)
      visited = new Set()
      continue
    }

    visited.add(position(state))
    const before = state
    state = advanceUntilStop(state)
    // the story has nowhere left to go: the target is somewhere this playthrough does not pass
    if (!appliedAny(before, state)) break
    path = path.advance()
    if (visited.has(position(state)) || ++steps > LOOP_LIMIT) throw new UnreachableCommandError(cmdIndex)
  }

  return [state, path]
}

function advanceUntilStop(state: VnPlayerState): VnPlayerState {
  let advances = 0
  state = advance(state)
  while (!state.stopAfterRender) {
    state = advance(state)
    advances++
    if (advances > LOOP_LIMIT) throw new EndlessLoopError()
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
    if (advances > LOOP_LIMIT) throw new EndlessLoopError()
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

// One recorded advance of a saved path. An advance that applies nothing is the save running past the
// end of a story that has got shorter since it was made - it expected a decision that is no longer
// there, or more lines than are left - and that is refused. Kept, it would load and leave the next
// undo to throw, since `Advance.tryPerform` asks the same `appliedAny` and would not walk it.
function savedAdvance(state: VnPlayerState): VnPlayerState {
  const next = advanceUntilStop(state)
  if (!appliedAny(state, next)) throw new IncompatibleSaveError("Saved path runs past the end of the story")
  return next
}

// Every refusal is an IncompatibleSaveError, the loop and the missing label included: a save whose
// replay now goes round a loop, or jumps to a label that has been renamed, was made against a story
// that did neither, so "the story has changed since this save" is exactly what happened. The story
// itself may well be broken too - but that is not this save's to report, and letting either through
// would stop the Load menu drawing at all.
function fromShorthandPath(
  startingState: VnPlayerState,
  decisions: number[],
  remainingAdvances: number
): [VnPlayerState, VnPath] {
  try {
    return replayShorthandPath(startingState, decisions, remainingAdvances)
  } catch (e) {
    if (e instanceof EndlessLoopError) throw new IncompatibleSaveError("Saved path runs into a loop in the story")
    if (e instanceof MissingLabelError)
      throw new IncompatibleSaveError(`Saved path jumps to a label that is gone: ${e.label}`)
    throw e
  }
}

function replayShorthandPath(
  startingState: VnPlayerState,
  decisions: number[],
  remainingAdvances: number
): [VnPlayerState, VnPath] {
  let path = VnPath.emptyPath()
  let state = runToStop(startingState)
  for (const id of decisions) {
    let advances = 0
    while (state.decision === null) {
      state = savedAdvance(state)
      path = path.advance()
      advances++
      if (advances > LOOP_LIMIT) throw new EndlessLoopError()
    }
    const decided = makeDecision(id, state)
    if (decided === state) {
      throw new IncompatibleSaveError("Invalid decision id in saved path")
    }
    path = path.makeDecision(id)
    // the run from the decision to the next stop is automatic, not a recorded advance
    state = advanceUntilStop(decided)
  }
  while (remainingAdvances > 0) {
    state = savedAdvance(state)
    path = path.advance()
    remainingAdvances--
  }
  return [state, path]
}

export const State = {
  advance,
  appliedAny,
  makeDecision,
  goToCommandDirect,
  goToCommandByReplay,
  loopJump,
  advanceUntilStop,
  runToStop,
  fromShorthandPath,
  fromPath,
}
