import { Document, isMap, isNode, isScalar, LineCounter, YAMLMap } from "yaml"
import { z, ZodIssue } from "zod"
import { ErrorLevel, ParserError, SourceLocation } from "../core/commands/Parser"
import { VnManifest } from "../core/manifest"
import { NARRATOR_ACTOR_ID } from "../core/state"
import { composeDocuments, FIRST_LINE, getLines, yamlProblems } from "./yamlDocument"

// manifest.yaml, the document a project declares itself in. It lives here rather than next to
// `VnManifest` in core/ because core/ imports zod but not yaml, and keeping it free of both yaml
// and the DOM is worth more than the cohesion of putting the parse next to the type.

// An id names the project's directory and keys its saves, so it has to survive being a filename on
// every filesystem. Lowercase-only is what stops two ids colliding once an export is extracted on a
// case-insensitive one; the charset leaves no way to spell a leading or trailing dot or space, or a
// name made only of dots, so `.` and `..` need no rule of their own.
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

// The Windows device names do fit the charset, and a directory cannot be called any of them.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/

const idSchema = z
  .string()
  .regex(ID_PATTERN, "must be 1-64 characters of a-z, 0-9, _ or -, starting with a letter or digit")
  .refine((id) => !WINDOWS_RESERVED.test(id), "is a reserved device name and cannot name a directory")

// YamlParser decides a `Name: "text"` line is a Say by testing the key's casing, so an actor
// declared lowercase is one no script can ever speak as - and their lines are reported as
// unrecognized commands, blaming the script for the manifest's mistake. `default` and `narrator`
// are the engine's own two, and seedActors merges both by name.
// Total on purpose: an empty key has no first character, and zod runs a refinement even when the
// checks before it failed, so a partial predicate here throws out of parseManifest instead of
// returning the errors its signature promises.
const isCapitalized = (key: string) => key.length > 0 && key[0] !== key[0].toLowerCase()

const actorIdSchema = z
  .string()
  .refine(
    (key) => key === "default" || key === NARRATOR_ACTOR_ID || isCapitalized(key),
    `must be capitalized - only "default" and "${NARRATOR_ACTOR_ID}", the engine's own actors, are lowercase`
  )

// `sprites` is the images an actor can be shown in, as filenames. Turning it into a map of declared
// names is a breaking format change - the one that brings `formatVersion` back - and belongs to
// .scratch/sprites/.
const actorSchema = z.object({
  name: z.string().optional(),
  nameTagColor: z.string().optional(),
  textColor: z.string().optional(),
  sprites: z.array(z.string()).optional(),
})

// An author who writes `audioAssets:` and stops means an empty list, but YAML hands that over as
// null. Declaring nothing and declaring emptiness are the same statement, so both take the default.
const declared = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((value) => value ?? undefined, schema)

// The three declaration lists default to empty: a project with no audio should not have to write
// `audioAssets: []`. Identity does not default - a manifest without it is not a project.
const manifestSchema = z.object({
  id: idSchema,
  title: z.string().min(1, "is required"),
  actors: declared(z.record(actorIdSchema, actorSchema).default({})),
  backgrounds: declared(z.array(z.string()).default([])),
  audioAssets: declared(z.array(z.string()).default([])),
})

// Unknown keys are stripped rather than rejected, which is what lets a manifest written against a
// later format still load here. There is no `formatVersion` yet: every manifest that exists is one
// we generate, so there is no file in the wild for a version gate to protect. The trigger to add
// one back is the first compatibility break - see .scratch/asset-manifest/issues/02-manifest-yaml.md.

// A manifest that fails validation yields nothing at all, unlike parseStory, which always returns a
// playable state. See docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md: a broken script
// still has content worth showing, a broken manifest has no identity to load the project under.
export const parseManifest = (text: string): [VnManifest | null, ParserError[]] => {
  const [docs, lineCounter] = composeDocuments(text)
  const doc = docs[0]

  const errors = yamlProblems(doc, lineCounter)
  // A manifest is one document. The `---` separated stream is the shape the URL payload will take
  // once a project travels as manifest-plus-script, and taking the first document quietly here
  // would turn that into a story silently loading under half a project.
  if (docs.length > 1) {
    errors.push(
      new ParserError("A manifest is a single YAML document.", documentLines(docs[1], lineCounter), ErrorLevel.ERROR)
    )
  }
  if (errors.some((e) => e.level === ErrorLevel.ERROR)) return [null, errors]

  const result = manifestSchema.safeParse(doc.toJS())
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(new ParserError(issueMessage(issue), issueLocation(issue, doc, lineCounter), ErrorLevel.ERROR))
    }
    return [null, errors]
  }

  return [result.data, errors]
}

// Zod's own message says what is wrong but not where in the document, so the path goes in front of
// it: "actors.a1: must be capitalized ...".
const issueMessage = (issue: ZodIssue): string =>
  issue.path.length === 0 ? issue.message : `${issue.path.join(".")}: ${issue.message}`

// The composed document still knows where every value came from, so an issue's path is enough to
// point the editor's gutter at the offending line. A missing key has no node to point at.
//
// An issue is located to the whole `key: value` pair rather than to the value alone. The actor-id
// rule is about the key, and a key sits on the line above its mapping, so pointing at the value
// would mark the wrong line for the one rule in this schema that cannot mark the right one.
const issueLocation = (issue: ZodIssue, doc: Document, lc: LineCounter): SourceLocation => {
  if (issue.path.length === 0) return isNode(doc.contents) ? getLines(doc.contents, lc) : FIRST_LINE

  const parent = issue.path.length === 1 ? doc.contents : doc.getIn(issue.path.slice(0, -1), true)
  const pairLines = isMap(parent) ? entryLines(parent, issue.path[issue.path.length - 1], lc) : undefined
  if (pairLines !== undefined) return pairLines

  const node = doc.getIn(issue.path, true)
  return isNode(node) ? getLines(node, lc) : FIRST_LINE
}

const documentLines = (doc: Document, lc: LineCounter): SourceLocation =>
  isNode(doc.contents) ? getLines(doc.contents, lc) : FIRST_LINE

// From the start of a mapping's key to the end of its value.
const entryLines = (map: YAMLMap, key: string | number, lc: LineCounter): SourceLocation | undefined => {
  const pair = map.items.find((item) => isScalar(item.key) && item.key.value === key)
  if (pair === undefined || !isNode(pair.key)) return undefined
  const keyLines = getLines(pair.key, lc)
  return {
    startLine: keyLines.startLine,
    endLine: isNode(pair.value) ? getLines(pair.value, lc).endLine : keyLines.endLine,
  }
}
