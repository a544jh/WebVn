import {
  Composer,
  Document,
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  Node,
  Parser,
  YAMLSeq,
} from "yaml"
import { ErrorLevel, getCommandHandler, ParserError, SourceLocation, VnParser } from "../core/commands/Parser"
import { NARRATOR_ACTOR_ID, VnPlayerState } from "../core/state"
import { seedState, VnManifest } from "../core/manifest"
import { Command } from "../core/commands/Command"
import { Say } from "../core/commands/text/Say"
import { updateLabels } from "../core/commands/controlFlow/Label"

const parseStory = (text: string, manifest: VnManifest): [VnPlayerState, ParserError[]] => {
  let newState = seedState(manifest)
  let errors: ParserError[] = []

  const lineCounter = new LineCounter()
  const parser = new Parser(lineCounter.addNewLine)
  const composer = new Composer()
  const docs = Array.from(composer.compose(parser.parse(text), true, text.length))

  console.dir(docs[0])

  for (const docWarning of docs[0].warnings) {
    const line = lineCounter.linePos(docWarning.pos[0]).line
    errors.push(
      new ParserError(
        "YAML parse warning: " + docWarning.message,
        { startLine: line, endLine: line },
        ErrorLevel.WARNING
      )
    )
  }

  for (const docError of docs[0].errors) {
    const line = lineCounter.linePos(docError.pos[0]).line
    errors.push(
      new ParserError("YAML parse error: " + docError.message, { startLine: line, endLine: line }, ErrorLevel.ERROR)
    )
  }

  const storyNode = docs[0].get("story", true)
  if (storyNode === undefined) {
    errors.push(new ParserError("story missing.", { startLine: 1, endLine: 1 }, ErrorLevel.ERROR))
  } else if (!isSeq(storyNode) && isNode(storyNode)) {
    errors.push(new ParserError("story must be a sequence", getLines(storyNode, lineCounter), ErrorLevel.ERROR))
  } else if (isSeq(storyNode)) {
    const [commands, storyErrors] = storyToCommands(storyNode, docs[0], lineCounter)
    errors = errors.concat(storyErrors)
    newState = { ...newState, commands }
  }

  newState = updateLabels(newState)

  console.dir(newState)
  return [newState, errors]
}

const storyToCommands = (story: YAMLSeq<unknown>, doc: Document, lc: LineCounter): [Command[], ParserError[]] => {
  const commands: Command[] = []
  const errors: ParserError[] = []

  const nodeEvaluators: NodeToCommand[] = [singleString, registeredCommand, mapWithOneCapitalizedStringValue]

  for (let item of story.items) {
    if (isAlias(item)) {
      const source = item.resolve(doc)
      if (source === undefined) {
        errors.push(new ParserError(`Unknown anchor *${item.source}.`, getLines(item, lc), ErrorLevel.ERROR))
        continue
      }
      // Object.create keeps the resolved node on the prototype chain, and with it the internal
      // type symbol the isX guards read - a spread would drop it, since it is non-enumerable.
      // The own range shadows the source's, so errors point at where the anchor is dereferenced.
      item = Object.assign(Object.create(source), { range: item.range })
    }

    let recognized = false
    for (const evaluator of nodeEvaluators) {
      const result = evaluator(item, lc)
      if (result instanceof Command) {
        commands.push(result)
        recognized = true
        break
      } else if (result instanceof ParserError) {
        errors.push(result)
        recognized = true
        break
      }
    }
    if (!recognized && isNode(item)) {
      const noMatchError = new ParserError(
        `Unrecognized item. A command should be a string or a single-keyed map.`,
        getLines(item, lc),
        ErrorLevel.WARNING
      )
      errors.push(noMatchError)
    }
  }
  return [commands, errors]
}

type NodeToCommand = (item: unknown, lc: LineCounter) => Command | ParserError | undefined

const singleString: NodeToCommand = (item, lc) => {
  if (isScalar(item) && typeof item.value === "string") {
    return new Say(getLines(item, lc), NARRATOR_ACTOR_ID, item.value)
  }
}

const registeredCommand: NodeToCommand = (item, lc) => {
  if (isMap(item) && item.items.length === 1 && isPair(item.items[0])) {
    const pair = item.items[0]
    if (isScalar(pair.key) && typeof pair.key.value === "string" && isNode(pair.value)) {
      const key = pair.key.value
      const handler = getCommandHandler(key)
      if (handler !== undefined) {
        const location = getLines(item, lc)
        const obj = pair.value.toJSON()
        return handler(obj, location) //toJSON() gives JS object and not JSON. TODO report to maintainer
      } else if (key[0] === key[0].toLowerCase()) {
        return new ParserError(`${key} is not a recognized command.`, getLines(item, lc), ErrorLevel.WARNING)
      }
    }
  }
}

const mapWithOneCapitalizedStringValue: NodeToCommand = (item, lc) => {
  if (isMap(item) && item.items.length === 1 && isPair(item.items[0])) {
    const line = getLines(item, lc)
    const pair = item.items[0]
    if (isScalar(pair.key) && typeof pair.key.value === "string") {
      const key = pair.key.value
      if (key[0] !== key[0].toLowerCase()) {
        if (isScalar(pair.value) && typeof pair.value.value === "string") {
          return new Say(line, key, pair.value.value)
        } else {
          return new ParserError("Value of Say command must be a string.", line, ErrorLevel.WARNING)
        }
      }
    }
  }
}

const getLines = (item: Node, lc: LineCounter): SourceLocation => {
  const endPos = lc.linePos(item.range?.[1] || 0)
  const endLine = endPos.col === 1 ? endPos.line - 1 : endPos.line
  return { startLine: lc.linePos(item.range?.[0] || 0).line, endLine }
}

export const YamlParser: VnParser = {
  parseStory,
}
