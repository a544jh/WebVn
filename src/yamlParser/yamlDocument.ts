import { Composer, Document, isNode, LineCounter, Node, Parser } from "yaml"
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

// Where a whole document sits in the text it was composed from. Stands in for a node when the
// problem is with the document rather than with anything inside it.
export const documentLines = (doc: Document, lc: LineCounter): SourceLocation =>
  isNode(doc.contents) ? getLines(doc.contents, lc) : FIRST_LINE

// Both parsers read one document and would drop the rest, so both have to refuse a stream instead.
// `subject` names what was being read, because the two say it about different things and the author
// needs to know which buffer is at fault. The `---` a script or a manifest picks up by accident is
// the same `---` the URL payload is built on, which is why this is one check rather than two.
export const multiDocumentError = (docs: Document[], lc: LineCounter, subject: string): ParserError | undefined => {
  if (docs.length <= 1) return undefined
  return new ParserError(`${subject} is a single YAML document.`, documentLines(docs[1], lc), ErrorLevel.ERROR)
}

// A `---` separated stream, split back into the text of the documents it carries. The composer
// decides where the boundaries are - the same rule the parsers apply - so a `---` inside a block
// scalar is not one of them.
//
// Each part keeps its own comments and its own line numbering, and the marker line introducing a
// part is dropped, so joining two documents and splitting them again returns exactly what went in.
export const splitDocuments = (text: string): string[] => {
  const [docs] = composeDocuments(text)
  const starts = docs.map((doc, i) => (i === 0 ? 0 : doc.range?.[0] ?? 0))
  return starts.map((start, i) => {
    const part = text.slice(start, i + 1 < starts.length ? starts[i + 1] : undefined)
    return i === 0 ? part : part.replace(/^---[^\S\n]*\n?/, "")
  })
}
