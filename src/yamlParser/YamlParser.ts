import { Composer, Document, isMap, isPair, isScalar, isSeq, LineCounter, Options, parse, parseDocument, Parser, YAMLSeq } from "yaml"
import { VnParser } from "../core/commands/Parser"
import { Token } from "yaml/dist/parse/tokens"
import { VnPlayerState } from "../core/state"
import { initialState } from "../core/player"
import { Command } from "../core/commands/Command"
import { Say } from "../core/commands/text/Say"

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


const getInitialState = (text: string): VnPlayerState => {
  const vnState = { ...initialState}

  const docOptions: Options = {}

  const docs: Document[] = []
  const lineCounter = new LineCounter()
  const composer = new Composer((doc: Document) => docs.push(doc), docOptions)
  const parser = new Parser(composer.next, lineCounter.addNewLine)
  parser.parse(text)
  composer.end()

  const storyNode = docs[0].get("story")
  if (storyNode === undefined) {
    throw new Error("no story found")
  } else if (!isSeq(storyNode)) {
    throw new Error("story not a seq")
  } else {
    storyNode
  }

  const commands = toCommands(storyNode, lineCounter)

  vnState.commands = commands

  return vnState
}

const toCommands = (story: YAMLSeq<unknown>, lc: LineCounter): Command[] => {
  const commands: Command[] = []

  const nodeEvaluators: NodeToCommand[] = [
    singleString,
    mapWithOneStringValue
  ]

  for (const item of story.items){
    for (const func of nodeEvaluators) {
      const command = func(item, lc)
      if (command !== null) {
        commands.push(command)
        break
      }
    }
  }
  return commands
}

type NodeToCommand = (item: unknown, lc: LineCounter) => Command | null

const singleString: NodeToCommand = (item, lc) => {
  if (isScalar(item) && typeof item.value === "string") {
    return new Say(lc.linePos(item.range?.[0] || 0).line, "none", item.value)
  }
  return null
}

const mapWithOneStringValue: NodeToCommand = (item, lc) => {
  if(isMap(item) && item.items.length === 1 && isPair(item.items[0])){
    const pair = item.items[0]
    if(isScalar(pair.key) && isScalar(pair.value)) {
      const line = lc.linePos(item.range?.[0] || 0).line
      if (typeof pair.key.value === "string" && typeof pair.value.value === "string") {
        return new Say(line, pair.key.value, pair.value.value)
      }
    }
  }
  return null
}



export const YamlParser: VnParser = {
  getInitialState
}
