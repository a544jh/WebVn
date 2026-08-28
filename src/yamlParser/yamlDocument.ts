import { Composer, Document, LineCounter, Node, Parser } from "yaml"
import { ErrorLevel, ParserError, SourceLocation } from "../core/commands/Parser"

// The bits both parsers need to turn YAML text into something with line numbers on it. Shared so
// the two cannot drift: a script error and a manifest error have to be the same currency for the
// editor's gutter markers to work on either.

// The first line, for a problem with no node to point at - a missing key, or a document that failed
// to compose at all.
export const FIRST_LINE: SourceLocation = { startLine: 1, endLine: 1 }

// Composes the text, keeping the LineCounter that was filled in on the way. forceDoc, so an empty
// string still yields a document to report problems against. Every document is returned rather than
// just the first: a stray `---` is a thing a caller may want to refuse rather than silently drop.
export const composeDocuments = (text: string): [Document[], LineCounter] => {
  const lineCounter = new LineCounter()
  const parser = new Parser(lineCounter.addNewLine)
  const composer = new Composer()
  return [Array.from(composer.compose(parser.parse(text), true, text.length)), lineCounter]
}

// The yaml lib's own warnings and errors, as ours. Warnings first, matching the order they were
// reported in before this was shared.
export const yamlProblems = (doc: Document, lc: LineCounter): ParserError[] => {
  const problems: ParserError[] = []
  for (const warning of doc.warnings) {
    problems.push(yamlProblem("YAML parse warning: " + warning.message, warning.pos[0], lc, ErrorLevel.WARNING))
  }
  for (const error of doc.errors) {
    problems.push(yamlProblem("YAML parse error: " + error.message, error.pos[0], lc, ErrorLevel.ERROR))
  }
  return problems
}

const yamlProblem = (message: string, offset: number, lc: LineCounter, level: ErrorLevel): ParserError => {
  const line = lc.linePos(offset).line
  return new ParserError(message, { startLine: line, endLine: line }, level)
}

// Where a composed node sits in the text it was parsed from.
export const getLines = (item: Node, lc: LineCounter): SourceLocation => {
  const endPos = lc.linePos(item.range?.[1] || 0)
  const endLine = endPos.col === 1 ? endPos.line - 1 : endPos.line
  return { startLine: lc.linePos(item.range?.[0] || 0).line, endLine }
}
