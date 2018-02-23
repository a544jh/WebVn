import { VnPlayerState, ADVTextBox, TextBoxType, TextNode } from "./state";

export interface Command {
  type: CommandType
  [index: string]: any
}

interface ApplyFunc<C extends Command> {
  (command: C, state : VnPlayerState): VnPlayerState
}

export const enum CommandType {
  ADV = "adv"
}

interface ADV extends Command{
  type: CommandType.ADV
  text: string
  // actor, speed...
}

const applyADV : ApplyFunc<ADV> = (command, state) => {
  let textNodes :TextNode[] = [{
    text: command.text,
    characterDelay: 20,
    color: "black"
  }]
  let text :ADVTextBox = {
    type: TextBoxType.ADV,
    textNodes,
  }

  let animatableState = {...state.animatableState, text}
  let newState = {...state, animatableState}

  return newState
}

export function applyCommand(state : VnPlayerState) :VnPlayerState {
  const command = state.commands[state.commandIndex]
  return commandApplyFuncs[command.type](command, state)
}

type TCommandApplyFuncs = { // aka reducers
  [K in CommandType]: ApplyFunc<any>
}

const commandApplyFuncs :TCommandApplyFuncs = {
  "adv" : applyADV
}

