import { AssetDeclaration } from "../core/manifest"
import { VnPlayerState } from "../core/state"
import { AssetLocation, belowAssets, declaredAssets, locateAsset } from "../domRenderer/assetPaths"
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
//
// **Which folder means what is `assetPaths.ts`'s**, read backwards through `locateAsset`: this module
// decides what to do with a file, never where the layout puts one.

export interface UndeclaredFile {
  // Where it is in the project - `assets/backgrounds/old/cliffs.png`. What a row is keyed by and what
  // preview and remove act on.
  readonly path: string
  // What its row shows: the path below its group's folder, `old/cliffs.png`, or below `assets/` for
  // a file in `Other files`. It has no id, so this is the only name it has.
  readonly name: string
  // What Declare would write, every field but the id - which is the one thing the author is asked.
  // Null where nothing could be declared: everything in `Other files`, and a sprite under a folder
  // no actor could be called.
  readonly declares: AssetLocation | null
}

// One actor's folder under `assets/sprites/`, with the files in it nothing declares.
export interface UndeclaredSprites {
  readonly actor: string
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
    const name = belowAssets(path)
    if (name === null || declared.has(path)) continue

    const location = locateAsset(path)
    if (location === null) {
      other.push({ path, name, declares: null })
    } else if (location.kind === "sprite") {
      const files = sprites.get(location.actor) ?? []
      // A folder no actor could be called is one no declaration could ever point into: the casing
      // rule is what tells a `Name: "text"` line from a command, so a lowercase actor is one no
      // script can speak as.
      files.push({ path, name: location.file, declares: validateActorId(location.actor) === null ? location : null })
      sprites.set(location.actor, files)
    } else {
      ;(location.kind === "background" ? backgrounds : tracks).push({ path, name: location.file, declares: location })
    }
  }

  return {
    backgrounds,
    audio: tracks,
    sprites: [...sprites.keys()].sort(byPath).map((actor) => ({ actor, files: sprites.get(actor) ?? [] })),
    other,
  }
}

// Whether there is anything to draw at all - what decides, beside `nothingDeclared`, whether the
// panel says "Nothing declared yet." or draws its groups.
export const nothingUndeclared = (files: UndeclaredFiles): boolean =>
  files.backgrounds.length === 0 && files.audio.length === 0 && files.sprites.length === 0 && files.other.length === 0

// The declaration Declare writes: what the path fixes, and the id the author gave.
export const declarationOf = (location: AssetLocation, id: string): AssetDeclaration => ({ ...location, id })

// By code unit rather than `localeCompare`, so the order is the same in every browser and every
// locale - the rows must not reorder for one author and not another.
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
