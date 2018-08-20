import { Actor, ADVNameTag, ADVTextBox, TextBoxType, TextNode, VnPlayerState } from "./state"

export interface Command {
  type: CommandType
  [index: string]: any
  line?: number
}

type ApplyFunc<C extends Command> = (command: C, state: VnPlayerState) => VnPlayerState

// TODO: Use "say" command, so the textbox is stateful...
// maybe just use "generic" commands from parser?? lol no generics :DDD
// and just write converting middleware w/ validation e.g. cmd w/ args -> Command object
// "plugins" would have to be written in TS then...
// make way to "register" plugins?
// or define all commands in the parser -> more boilerplate, but enables validation

export const enum CommandType {
  ADV = "adv",
  TextBoxClose = "close",
}

interface ADV extends Command {
  type: CommandType.ADV
  text: string
  actor?: string
  // actor, speed...
}

interface TextBoxClose extends Command {
  type: CommandType.TextBoxClose
}

const applyADV: ApplyFunc<ADV> = (command, state) => {
  // TODO: handle undefined actor
  const actor: Actor = state.actors[command.actor || "none"]
  const color: string = actor.textColor || state.actors.default.textColor

  let nameTag: ADVNameTag | undefined
  if (actor.name) {
    nameTag = {
      name: actor.name,
      color: actor.nameTagColor || state.actors.default.nameTagColor,
    }
  }

  const textNodes: TextNode[] = [{
    text: command.text,
    characterDelay: 20,
    color,
  }]
  const text: ADVTextBox = {
    type: TextBoxType.ADV,
    nameTag,
    textNodes,
  }

  const animatableState = {...state.animatableState, text}
  const newState = {...state, animatableState}

  return newState
}

const closeTextBox: ApplyFunc<TextBoxClose> = (command, state) => {
  return {...state, animatableState: {
    ...state.animatableState, text: null,
  }}
}

export function applyCommand(state: VnPlayerState): VnPlayerState {
  const command = state.commands[state.commandIndex]
  return commandApplyFuncs[command.type](command, state)
}

type TCommandApplyFuncs = { // aka reducers
  [K in CommandType]: ApplyFunc<any>
}

const commandApplyFuncs: TCommandApplyFuncs = {
  adv : applyADV,
  close: closeTextBox,
}
