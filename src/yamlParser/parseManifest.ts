import { Document, isMap, isNode, isScalar, LineCounter, YAMLMap } from "yaml"
import { z, ZodIssue } from "zod"
import { ErrorLevel, ParserError, SourceLocation } from "../core/commands/Parser"
import { VnManifest } from "../core/manifest"
import { isBackgroundColor, NARRATOR_ACTOR_ID, STOP_AUDIO_ID } from "../core/state"
import { composeDocuments, documentLines, FIRST_LINE, getLines, multiDocumentError, yamlProblems } from "./yamlDocument"

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

// An asset id names a file the script asks for; nothing derives a filename or a directory name from
// it, so the project id's filesystem charset does not transfer. Any non-empty string, minus the two
// values the engine has already spoken for below.
const assetIdSchema = z.string().min(1, "must not be empty")

// The two values the engine has spoken for. Both are defined in core/state.ts, beside the types
// they constrain: `Bgm.apply` acts on one and `BackgroundRenderer` on the other, so stating either
// rule a second time here is how the schema and the engine would come to disagree.
//
// `bgm: stop` stops the music, so a track keyed `stop` could never be played. The alternatives -
// `bgm: null`, `bgm: {stop: true}` - need no reserved word and break every script that stops music,
// which is not a trade worth making for a word nobody will name a track.
const audioIdSchema = assetIdSchema.refine(
  (id) => id !== STOP_AUDIO_ID,
  `"${STOP_AUDIO_ID}" is reserved - it is how a script stops the music. Give the track another id and a title.`
)

// A background id starting with `#` would name an asset nothing can reach, because that is how a
// `bg` says it is painting a colour rather than naming one.
const backgroundIdSchema = assetIdSchema.refine(
  (id) => !isBackgroundColor(id),
  'may not start with "#" - a background beginning with one is read as a colour, not an asset'
)

// A bare string is the whole declaration when there is no metadata, which is what makes an audio
// entry read exactly like a background one.
const audioAssetSchema = z.preprocess(
  (value) => (typeof value === "string" ? { file: value } : value),
  // Strict, unlike the top level: an unknown key inside an entry is a typo, and `artistt: a544jh`
  // should not silently produce a track with no artist. A later format announces itself at the top
  // level, never inside an asset.
  z
    .object({
      file: z.string().min(1, "must name a file"),
      title: z.string().optional(),
      artist: z.string().optional(),
    })
    .strict()
)

// `sprites` is the images an actor can be shown in, as declared name to filename. The script names
// the declared name, so renaming a file is a manifest edit rather than a rewrite of the story.
//
// Strict, like an asset entry and unlike the top level: `sprites` is what makes an actor an entry
// that declares assets, and a stripped `sprits:` would leave an actor silently declaring none -
// which is the same failure as a stripped `artistt:` leaving a track with no artist.
const actorSchema = z
  .object({
    name: z.string().optional(),
    nameTagColor: z.string().optional(),
    textColor: z.string().optional(),
    sprites: z.record(assetIdSchema, z.string().min(1, "must name a file")).optional(),
  })
  .strict()

// An author who writes `audioAssets:` and stops means an empty declaration, but YAML hands that over
// as null. Declaring nothing and declaring emptiness are the same statement, so both take the default.
const declared = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((value) => value ?? undefined, schema)

// The three declarations default to empty: a project with no audio should not have to write
// `audioAssets: {}`. Identity does not default - a manifest without it is not a project.
const manifestSchema = z.object({
  id: idSchema,
  title: z.string().min(1, "is required"),
  actors: declared(z.record(actorIdSchema, actorSchema).default({})),
  backgrounds: declared(z.record(backgroundIdSchema, z.string().min(1, "must name a file")).default({})),
  audioAssets: declared(z.record(audioIdSchema, audioAssetSchema).default({})),
})

// Unknown keys at the top level are stripped rather than rejected, which is what lets a manifest
// written against a later format still load here. Inside an asset entry the rule is the opposite -
// see audioAssetSchema.

// The version gate, which arrived with asset ids. Every manifest shipped before them declares its
// assets as lists of filenames, so reading one under this schema produces a shape error per
// declaration and buries the single message that explains all of them. Hence the check runs on its
// own, ahead of the schema, and its failure is the only error reported.
const FORMAT_VERSION = 1

const versionProblem = (value: unknown): string | undefined => {
  if (value === undefined) {
    return (
      `formatVersion: is required, and must be ${FORMAT_VERSION}. A manifest with no version predates asset ids, ` +
      "where backgrounds, audioAssets and an actor's sprites were lists of filenames rather than maps of id to file."
    )
  }
  if (value !== FORMAT_VERSION) {
    return `formatVersion: ${JSON.stringify(
      value
    )} is not a format this version of WebVn reads. It reads ${FORMAT_VERSION}.`
  }
  return undefined
}

// A manifest that fails validation yields nothing at all, unlike parseStory, which always returns a
// playable state. See docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md: a broken script
// still has content worth showing, a broken manifest has no identity to load the project under.
export const parseManifest = (text: string): [VnManifest | null, ParserError[]] => {
  const [docs, lineCounter] = composeDocuments(text)
  const doc = docs[0]

  const errors = yamlProblems(doc, lineCounter)
  // A manifest is one document. The `---` separated stream is the shape the URL payload takes now
  // that a project travels as manifest-plus-script, and taking the first document quietly here
  // would turn that into a story silently loading under half a project.
  const multiDocument = multiDocumentError(docs, lineCounter, "A manifest")
  if (multiDocument !== undefined) errors.push(multiDocument)
  if (errors.some((e) => e.level === ErrorLevel.ERROR)) return [null, errors]

  const js: unknown = doc.toJS()
  // Only a mapping can carry a version. Anything else is not a manifest at all, and the schema
  // below says so better than a missing-version message would.
  if (isMap(doc.contents)) {
    const problem = versionProblem((js as Record<string, unknown>).formatVersion)
    if (problem !== undefined) {
      errors.push(new ParserError(problem, keyLocation(doc, "formatVersion", lineCounter), ErrorLevel.ERROR))
      return [null, errors]
    }
  }

  const result = manifestSchema.safeParse(js)
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(new ParserError(issueMessage(issue), issueLocation(issue, doc, lineCounter), ErrorLevel.ERROR))
    }
    return [null, errors]
  }

  return [result.data, errors]
}

// Where each of these declarations sits in the manifest text, so a failure a parser cannot see - a
// file that is not there - can still be marked on the line that declared it. Keys are the paths
// `declaredAssets` hands back: ["backgrounds", id], ["audioAssets", id], ["actors", a, "sprites", id].
//
// Composed once for the whole batch rather than per key, and located to the whole `key: value` pair,
// the same way issueLocation locates a schema failure. A key that is not there - a manifest edited
// since the load began - falls back to the first line rather than going unreported.
export const declarationLocations = (text: string, keys: (string | number)[][]): SourceLocation[] => {
  const [docs, lineCounter] = composeDocuments(text)
  const doc = docs[0]
  return keys.map((key) => {
    const parent = key.length === 1 ? doc.contents : doc.getIn(key.slice(0, -1), true)
    const lines = isMap(parent) ? entryLines(parent, key[key.length - 1], lineCounter) : undefined
    return lines ?? FIRST_LINE
  })
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

// Where a top-level key sits, for the one error raised before the schema runs. A manifest that
// never wrote the key has no node to point at, so the whole document stands in for it.
const keyLocation = (doc: Document, key: string, lc: LineCounter): SourceLocation => {
  const lines = isMap(doc.contents) ? entryLines(doc.contents, key, lc) : undefined
  return lines ?? documentLines(doc, lc)
}

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
