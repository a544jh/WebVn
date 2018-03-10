import { Actor, ADVNameTag, ADVTextBox, TextBoxType, TextNode, VnPlayerState } from "./state"

export interface Command {
  type: CommandType
  [index: string]: any
  line?: number
}

type ApplyFunc<C extends Command> = (command: C, state: VnPlayerState) => VnPlayerState

export const enum CommandType {
  ADV = "adv",
}

interface ADV extends Command {
  type: CommandType.ADV
  text: string
  actor?: string
  // actor, speed...
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

export function applyCommand(state: VnPlayerState): VnPlayerState {
  const command = state.commands[state.commandIndex]
  return commandApplyFuncs[command.type](command, state)
}

type TCommandApplyFuncs = { // aka reducers
  [K in CommandType]: ApplyFunc<any>
}

const commandApplyFuncs: TCommandApplyFuncs = {
  adv : applyADV,
}
