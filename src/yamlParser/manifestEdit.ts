import { isMap, stringify } from "yaml"
import { SourceLocation } from "../core/commands/Parser"
import { AssetDeclaration } from "../core/manifest"
import { composeDocuments } from "./yamlDocument"
import { declarationLocation } from "./parseManifest"

// The asset panel's two manifest writes, as text: adding a declaration and taking one away.
//
// **Textual insertion into the buffer. Never parse, mutate and re-`stringify`.** A round trip
// through the parser eats the author's comments - which is the same reason the `?vn=` payload
// carries the raw manifest buffer, and `test-assets/manifest.yaml` is itself a manifest with
// comments in it that an author would lose. So the parser is used only to *locate*, and every edit
// is a line splice.
//
// Beside `parseManifest.ts` rather than in `src/editor/`, because it is about manifest text rather
// than about the editor: it touches no DOM, no CodeMirror and no store, which is also what makes it
// the seam the whole of `test/unit/manifestEdit.test.ts` is written against. `VnEditor` is what puts
// the result back in its buffer and adopts it.

// The edited buffer, or why nothing was edited. **A refusal rather than a best effort**, and that is
// carried across from `VnEditor.revertManifestId`: the locator answers "which line is this key on",
// which is not the same question as "may I write on that line". A manifest this ate would be worse
// than a declaration the author has to type themselves.
export type ManifestEdit =
  | { readonly kind: "edited"; readonly text: string }
  | { readonly kind: "refused"; readonly problem: string }

// A flow-style manifest - the whole document as `{formatVersion: 1, id: a, title: b}` on one line -
// has every key on line 1, so there is no line an insertion could have to itself. Nothing here
// writes one, but an author may.
const FLOW_DOCUMENT =
  "manifest.yaml is written on one line, so there is nowhere to insert a declaration without rewriting it."

const NOT_A_MAPPING = "manifest.yaml is not a mapping, so it declares nothing to insert a declaration into."

// The group a declaration belongs under, innermost first found: the path that already exists is
// where the insertion goes, and everything below it is minted. One list per kind, read in order, so
// "the actor exists but declares no sprites" needs no special case of its own.
const targets = (declaration: AssetDeclaration): (string | number)[][] => {
  switch (declaration.kind) {
    case "background":
      return [["backgrounds"]]
    case "audio":
      return [["audioAssets"]]
    case "sprite":
      return [["actors", declaration.actor, "sprites"], ["actors", declaration.actor], ["actors"]]
  }
}

// What goes under that group, as a value to serialise. The deeper the group that was found, the less
// of the nest is left to mint - so this is `targets` read from the other end.
const nested = (declaration: AssetDeclaration, depth: number): unknown => {
  const entry = { [declaration.id]: declaration.file }
  if (declaration.kind !== "sprite") return entry
  if (depth === 0) return entry
  if (depth === 1) return { sprites: entry }
  return { [declaration.actor]: { sprites: entry } }
}

// The top-level key each kind lives under, for the case where the manifest declares no such group at
// all - a project straight out of `mintProject`, whose manifest is `formatVersion`/`id`/`title` and
// nothing else.
const groupKey = (declaration: AssetDeclaration): string =>
  declaration.kind === "background" ? "backgrounds" : declaration.kind === "audio" ? "audioAssets" : "actors"

// Add a declaration to the manifest buffer.
//
// It is found rather than assumed: the innermost group that already exists is where the entry is
// spliced in, at whatever indent that group's own children use, and anything between that group and
// the entry is minted. So the first background in a project with no `backgrounds:` key appends the
// group, and a sprite for an actor nobody has cast mints the actor and its `sprites:` map.
export const declareAsset = (text: string, declaration: AssetDeclaration): ManifestEdit => {
  const shape = documentShape(text)
  if (shape !== null) return { kind: "refused", problem: shape }

  const paths = targets(declaration)
  for (let depth = 0; depth < paths.length; depth++) {
    const at = declarationLocation(text, paths[depth])
    if (at === null) continue

    const lines = text.split("\n")
    const key = String(paths[depth][paths[depth].length - 1])
    // **The group's own line must hold nothing but the group**, or there is nowhere under it to
    // write: `backgrounds: {cliffs: a.png}` locates `backgrounds` to a line whose value is already
    // there, and splicing a child in beneath it would be a mapping with two values.
    if (!declaresBlock(lines[at.startLine - 1] ?? "", key)) {
      return { kind: "refused", problem: `${key}: is not on a line of its own, so nothing can be inserted under it.` }
    }
    const indent = childIndent(lines, at)
    lines.splice(at.endLine, 0, ...block(nested(declaration, depth), indent))
    return { kind: "edited", text: lines.join("\n") }
  }

  // No group, so the whole nest goes at the end of the document at zero indent. Appended rather than
  // placed: a manifest's key order is the author's, and guessing where a group "should" go is a
  // rewrite of their document rather than an addition to it.
  const whole = { [groupKey(declaration)]: nested(declaration, paths.length - 1) }
  return { kind: "edited", text: ensureTrailingNewline(text) + block(whole, "").join("\n") + "\n" }
}

// Take a declaration out of the manifest buffer, by the key path the manifest addresses it under -
// `["backgrounds", id]`, `["audioAssets", id]`, `["actors", actor, "sprites", id]`.
//
// The whole entry goes, not only the line its key is on: an audio asset with a title and an artist
// is three lines, and leaving two of them behind would be a manifest that does not parse.
export const undeclareAsset = (text: string, manifestKey: (string | number)[]): ManifestEdit => {
  const at = declarationLocation(text, manifestKey)
  const key = String(manifestKey[manifestKey.length - 1])
  if (at === null) return { kind: "refused", problem: `manifest.yaml does not declare ${key}.` }

  const lines = text.split("\n")
  // The same guard as above, from the other side: a line that holds more than this declaration is a
  // line a splice would take other declarations out of.
  if (!declaresKey(lines[at.startLine - 1] ?? "", key)) {
    return { kind: "refused", problem: `${key}: is not on a line of its own, so it cannot be removed on its own.` }
  }
  lines.splice(at.startLine - 1, at.endLine - at.startLine + 1)
  return { kind: "edited", text: lines.join("\n") }
}

// Why this document cannot be edited at all, or null when it can.
const documentShape = (text: string): string | null => {
  const [docs] = composeDocuments(text)
  const contents = docs[0]?.contents
  if (!isMap(contents)) return NOT_A_MAPPING
  // `flow` is the yaml lib's own record of how the collection was written, so this asks the document
  // rather than sniffing the text for braces.
  return contents.flow === true ? FLOW_DOCUMENT : null
}

// Whether a line declares this key and leaves the value to the lines below it. A trailing comment is
// allowed - `backgrounds: # the art` is block style and perfectly safe to write under.
const declaresBlock = (line: string, key: string): boolean =>
  new RegExp(`^\\s*(${quotings(key)})\\s*:\\s*(#.*)?$`).test(line)

// Whether a line declares this key at all, whatever follows the colon. What a removal needs: the
// value may be on the same line (`cliffs: a.png`) or below it, and either way the located lines are
// this declaration's alone.
const declaresKey = (line: string, key: string): boolean => new RegExp(`^\\s*(${quotings(key)})\\s*:`).test(line)

// The three ways YAML spells one key. Escaped, because an asset id is any non-empty string and may
// hold regex metacharacters.
const quotings = (key: string): string => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return [escaped, `"${escaped}"`, `'${escaped}'`].join("|")
}

// The indent an entry inside this group should take: its existing children's, or one step in from
// the group when there are none. Following the children rather than imposing two spaces means an
// author who indents four keeps indenting four.
const childIndent = (lines: string[], group: SourceLocation): string => {
  const groupIndent = indentOf(lines[group.startLine - 1] ?? "")
  for (let line = group.startLine; line < group.endLine; line++) {
    const indent = entryIndent(lines[line] ?? "")
    // Deeper than the group, or it is not one of the group's entries. Belt and braces with the
    // comment rule below, because the failure this guards is silent: an entry written at the group's
    // own indent is a *sibling* of the group, and an unknown key at the top level is stripped rather
    // than rejected - so the author would be told the asset was added and nothing would declare it.
    if (indent !== null && indent.length > groupIndent.length) return indent
  }
  return groupIndent + INDENT_UNIT
}

// `indentUnit` is 2 in the editor and `mintedFiles` writes 2, so 2 is what an empty group gets.
const INDENT_UNIT = "  "

// The indent of a line that declares something, or null for a blank line or a comment. **Neither
// says anything about how the entries around it are indented** - a `# note` sits wherever its author
// put it, and one at column 0 under `backgrounds:` would otherwise set the indent for the entry
// going in beneath it.
const entryIndent = (line: string): string | null => {
  const trimmed = line.trim()
  return trimmed === "" || trimmed.startsWith("#") ? null : indentOf(line)
}

const indentOf = (line: string): string => /^[^\S\n]*/.exec(line)?.[0] ?? ""

// A value as block YAML, one line per entry, each prefixed with the indent it sits at.
//
// **Serialised rather than interpolated**, which is a fix rather than a style: an asset id is any
// non-empty string, so `true`, `#x` and `a: b` are all legal ids that YAML would read back as
// something else - the same trap `mintProject` serialises its own two fields to avoid.
// `lineWidth: 0` is what stops a long filename being folded onto a second line, which would be
// valid YAML and an unreadable manifest.
const block = (value: unknown, indent: string): string[] =>
  stringify(value, { lineWidth: 0 })
    .trimEnd()
    .split("\n")
    .map((line) => indent + line)

const ensureTrailingNewline = (text: string): string => (text === "" || text.endsWith("\n") ? text : text + "\n")
