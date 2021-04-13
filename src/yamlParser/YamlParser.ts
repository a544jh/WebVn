import {
  Composer,
  Document,
  isAlias,
  isMap,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  Node,
  Options,
  parse,
  parseDocument,
  Parser,
  YAMLSeq,
} from "yaml"
import { VnParser } from "../core/commands/Parser"
import { Token } from "yaml/dist/parse/tokens"
import { NARRATOR_ACTOR_ID, VnPlayerState } from "../core/state"
import { Command } from "../core/commands/Command"
import { Say } from "../core/commands/text/Say"
import { CloseTextBox } from "../core/commands/text/CloseTextBox"

export const getTokens = (text: string): Token[] => {
  const tokens: Token[] = []
  const parser = new Parser((token) => tokens.push(token))
  parser.parse(text)
  return tokens
}

export const getDocument = (text: string): Document => {
  return parseDocument(text)
}

export const getObject = (text: string): unknown => parse(text)


const updateState = (text: string, state: VnPlayerState): VnPlayerState => {
  const newState = {...state}
  const docOptions: Options = {}

  const docs: Document[] = []
  const lineCounter = new LineCounter()
  const composer = new Composer((doc: Document) => docs.push(doc), docOptions)
  const parser = new Parser(composer.next, lineCounter.addNewLine)
  parser.parse(text)
  composer.end()

  console.dir(docs[0])

  const storyNode = docs[0].get("story")
  if (storyNode === undefined) {
    throw new Error("no story found")
  } else if (!isSeq(storyNode)) {
    throw new Error("story not a seq")
  } else {
    storyNode
  }

  const commands = toCommands(storyNode, lineCounter)

  newState.commands = commands

  return newState
}

const toCommands = (story: YAMLSeq<unknown>, lc: LineCounter): Command[] => {
  const commands: Command[] = []

  const nodeEvaluators: NodeToCommand[] = [singleString, registeredCommand, mapWithOneCapitalizedStringValue]

  for (let item of story.items) {
    if (isAlias(item)) {
      //const resolvedNode = Object.assign(Object.create(item.source), item.source) // WTF JS ... (need to preserve the type)
      // ^ works too but relies on prototype chain

      // Hack to clone the Node and set its type using symbol used by yaml lib internally...
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const sourceAsAny = item.source as any
      const resolvedNode = { ...item.source } as any
      /* eslint-enable @typescript-eslint/no-explicit-any */
      const symbol = Symbol.for("yaml.node.type")
      resolvedNode[symbol] = sourceAsAny[symbol]
      resolvedNode.range = item.range // use line numbers where anchor is dereferenced
      item = resolvedNode
    }

    for (const func of nodeEvaluators) {
      const command = func(item, lc)
      if (command !== undefined) {
        commands.push(command)
        break
      }
    }
  }
  return commands
}

type NodeToCommand = (item: unknown, lc: LineCounter) => Command | undefined

const singleString: NodeToCommand = (item, lc) => {
  if (isScalar(item) && typeof item.value === "string") {
    return new Say(getLine(item, lc), NARRATOR_ACTOR_ID, item.value)
  }
}

const registeredCommand: NodeToCommand = (item, lc) => {
  if (isMap(item) && item.items.length === 1 && isPair(item.items[0])) {
    const pair = item.items[0]
    if (isScalar(pair.key) && typeof pair.key.value === "string" && registeredCommands[pair.key.value]) {
      return registeredCommands[pair.key.value](pair.value, lc)
    }
  }
}

const mapWithOneCapitalizedStringValue: NodeToCommand = (item, lc) => {
  if (isMap(item) && item.items.length === 1 && isPair(item.items[0])) {
    const pair = item.items[0]
    if (isScalar(pair.key) && isScalar(pair.value)) {
      const line = getLine(item, lc)
      if (typeof pair.key.value === "string" && typeof pair.value.value === "string") {
        const key = pair.key.value
        if (key[0] !== key[0].toLowerCase()) {
          return new Say(line, key, pair.value.value)
        }
      }
    }
  }
}

const textboxHandler: NodeToCommand = (item, lc) => {
  if (isScalar(item) && item.value === "close") {
    return new CloseTextBox(getLine(item, lc))
  }
}

interface CommandHandlers {
  [index: string]: NodeToCommand
}

const registeredCommands: CommandHandlers = {
  textbox: textboxHandler,
}

const getLine = (item: Node, lc: LineCounter): number => lc.linePos(item.range?.[0] || 0).line

export const YamlParser: VnParser = {
  updateState: updateState
}
