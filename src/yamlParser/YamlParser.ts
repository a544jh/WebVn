import { Document, parse, parseDocument, Parser } from "yaml"
import { Token } from "yaml/dist/parse/tokens"

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