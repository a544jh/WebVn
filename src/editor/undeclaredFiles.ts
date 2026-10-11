import { AssetDeclaration } from "../core/manifest"
import { VnPlayerState } from "../core/state"
import { declaredAssets } from "../domRenderer/assetPaths"
import { validateActorId } from "../yamlParser/parseManifest"

// The files under a project's `assets/` that no declaration points at - CONTEXT.md's _undeclared
// file_ - sorted into the groups the asset panel draws. `.scratch/asset-panel/issues/06` is the
// ticket and its "Where the rows go" is every rule below.
//
// **Its own module rather than a corner of `declarations.ts`**, and that is the point of it:
// `declaredGroups` is what `design-docs/EDITOR.md`'s completions are meant to read, and an undeclared
// file must never be offered there as an id. So the two walks stay apart and the panel is the only
// thing that puts them side by side. Pure, so `test/unit/undeclaredFiles.test.ts` pins every rule
// without a DOM or a store.

// What Declare would write for a file, every field but the id - which is the one thing the author is
// asked. Fixed by where the file already is: changing the kind, the actor or the filename would mean
// moving the file, and Declare copies nothing.
export type Declarable =
  | { readonly kind: "background" | "audio"; readonly file: string }
  | { readonly kind: "sprite"; readonly actor: string; readonly file: string }

export interface UndeclaredFile {
  // Where it is in the project - `assets/backgrounds/old/cliffs.png`. What a row is keyed by and what
  // preview and remove act on.
  readonly path: string
  // What its row shows: the path below its group's folder, `old/cliffs.png`, or below `assets/` for
  // a file in `Other files`. It has no id, so this is the only name it has.
  readonly name: string
  // What Declare would declare, or null where nothing could: everything in `Other files`, and a
  // sprite under a folder no actor could be called.
  readonly declares: Declarable | null
}

// One actor's folder under `assets/sprites/`, with the files in it nothing declares.
export interface UndeclaredSprites {
  readonly actor: string
  // Whether the state knows this actor - declared in the manifest, or one of the engine's own two,
  // which every project has without declaring them. An actor it does not know is drawn as a branch
  // of its own that says so.
  readonly cast: boolean
  readonly files: UndeclaredFile[]
}

export interface UndeclaredFiles {
  readonly backgrounds: UndeclaredFile[]
  readonly audio: UndeclaredFile[]
  // Sorted by actor. Only folders that hold an undeclared file appear.
  readonly sprites: UndeclaredSprites[]
  // What no group answers: a file outside the three folders, or straight under `sprites/`.
  readonly other: UndeclaredFile[]
}

const ASSETS = "assets/"
const BACKGROUNDS = "assets/backgrounds/"
const AUDIO = "assets/audio/"
const SPRITES = "assets/sprites/"

// Every file in `listing` under `assets/` that no declaration in `state` points at.
//
// **Everything under `assets/`, and nothing outside it.** `assetPaths.ts` builds every path the engine
// can ask for under `assets/`, so a file above it is the project describing itself rather than an
// asset nobody declared - and the project root is where the storer writes, so a listing taken there
// mid-flush can hold Chromium's `.crswap` beside the file being written. Scoping to `assets/`, which
// nothing but the panel writes into, is what makes a filter for that unnecessary.
//
// The subtraction is against `declaredAssets`, the one walk of what a state declares, so what this
// calls declared and what the loaders preload cannot disagree.
export const undeclaredFiles = (listing: Iterable<string>, state: VnPlayerState): UndeclaredFiles => {
  const { images, audio } = declaredAssets(state)
  const declared = new Set([...images, ...audio].map((asset) => asset.path))

  const backgrounds: UndeclaredFile[] = []
  const tracks: UndeclaredFile[] = []
  const sprites = new Map<string, UndeclaredFile[]>()
  const other: UndeclaredFile[] = []

  for (const path of [...listing].sort(byPath)) {
    if (!path.startsWith(ASSETS) || declared.has(path)) continue

    const background = below(path, BACKGROUNDS)
    const track = below(path, AUDIO)
    const sprite = spriteFolder(path)
    if (background !== null) {
      backgrounds.push({ path, name: background, declares: { kind: "background", file: background } })
    } else if (track !== null) {
      tracks.push({ path, name: track, declares: { kind: "audio", file: track } })
    } else if (sprite !== null) {
      const files = sprites.get(sprite.actor) ?? []
      files.push({
        path,
        name: sprite.file,
        // A folder no actor could be called is one no declaration could ever point into: the casing
        // rule is what tells a `Name: "text"` line from a command, so a lowercase actor is one no
        // script can speak as.
        declares:
          validateActorId(sprite.actor) === null ? { kind: "sprite", actor: sprite.actor, file: sprite.file } : null,
      })
      sprites.set(sprite.actor, files)
    } else {
      other.push({ path, name: path.slice(ASSETS.length), declares: null })
    }
  }

  return {
    backgrounds,
    audio: tracks,
    sprites: [...sprites.keys()]
      .sort(byPath)
      .map((actor) => ({ actor, cast: state.actors[actor] !== undefined, files: sprites.get(actor) ?? [] })),
    other,
  }
}

// Whether there is anything to draw at all - what decides, beside `nothingDeclared`, whether the
// panel says "Nothing declared yet." or draws its groups.
export const nothingUndeclared = (files: UndeclaredFiles): boolean =>
  files.backgrounds.length === 0 && files.audio.length === 0 && files.sprites.length === 0 && files.other.length === 0

// The declaration Declare writes: what the path fixes, and the id the author gave.
export const declarationOf = (declares: Declarable, id: string): AssetDeclaration =>
  declares.kind === "sprite"
    ? { kind: "sprite", actor: declares.actor, id, file: declares.file }
    : { kind: declares.kind, id, file: declares.file }

// Where an undeclared file's row is, by the name of what it sits under - "Backgrounds", or an actor's
// own name. Add asset's taken-name refusal points there, and only asks about the paths Add asset can
// produce, which are all inside the three folders.
export const groupNames = (files: UndeclaredFiles): Map<string, string> => {
  const names = new Map<string, string>()
  for (const file of files.backgrounds) names.set(file.path, "Backgrounds")
  for (const file of files.audio) names.set(file.path, "Audio")
  for (const folder of files.sprites) for (const file of folder.files) names.set(file.path, folder.actor)
  for (const file of files.other) names.set(file.path, "Other files")
  return names
}

// The path below `folder`, or null when it is not under it or names the folder alone.
const below = (path: string, folder: string): string | null =>
  path.startsWith(folder) && path.length > folder.length ? path.slice(folder.length) : null

// `assets/sprites/<actor>/<file>`, or null - a file straight under `sprites/` has no actor to belong
// to, and goes to `Other files`.
const spriteFolder = (path: string): { actor: string; file: string } | null => {
  const rest = below(path, SPRITES)
  const slash = rest?.indexOf("/") ?? -1
  if (rest === null || slash <= 0 || slash === rest.length - 1) return null
  return { actor: rest.slice(0, slash), file: rest.slice(slash + 1) }
}

// By code unit rather than `localeCompare`, so the order is the same in every browser and every
// locale - the rows must not reorder for one author and not another.
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
