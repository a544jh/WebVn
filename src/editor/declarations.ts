import { DEFAULT_ACTOR_ID, NARRATOR_ACTOR_ID, VnPlayerState } from "../core/state"
import { audioFilePath, backgroundFilePath, spriteFilePath } from "../domRenderer/assetPaths"

// What a project declares, in the shape the manifest declares it: three fixed groups, one level of
// nesting under an actor, ids as leaves.
//
// **A view of the manifest, not of OPFS.** `actors`, `backgrounds` and `audioAssets` are keyed maps
// - the script names an id and the manifest says which file it is - so this is a walk of a symbol
// table rather than a directory listing. A file no id answers appears here nowhere at all, which is
// deliberate: that state is what docs/adr/0004 makes visible in the *script*, not a second place to
// go looking.
//
// **Read out of `VnPlayerState`**, which is where `seedState` copied the three declarations and
// which `advance` never writes - so the state is as authoritative as the manifest and is the thing
// already threaded everywhere. Nothing here holds a manifest object on the side.
//
// Its own module rather than a corner of the panel that draws it, because `.scratch/asset-panel/`'s
// spec names one overlap worth designing for: `design-docs/EDITOR.md`'s completion table wants
// "asset names from the manifest" for an `image:`/`sprite:`/`audio:` value, which is this same
// enumeration surfaced a second way. Whatever enumerates declarations has to be one thing, or the
// panel and the completion menu come to disagree about what a project contains.

// Which of the three declarations a leaf came out of. The panel needs it to know which controls a
// row gets and which path function built its path; `Add asset` asks the author for it.
export type AssetKind = "background" | "audio" | "sprite"

// One declared asset. `file` is what the manifest says and `path` is where that file sits inside the
// project - **built by `src/domRenderer/assetPaths.ts` and nowhere else**, which is the one place an
// id becomes a path.
export interface DeclaredLeaf {
  readonly kind: AssetKind
  readonly id: string
  readonly file: string
  readonly path: string
  // How the manifest addresses it: what `declarationLocations` takes, and what `loadAssets` reports
  // a failed load under. Carrying it is what makes a row findable from a failure and a declaration
  // spliceable from a row.
  readonly manifestKey: (string | number)[]
  // Whose sprite this is. Only the one kind has an owner - an actor's sprites are declared inside
  // that actor, so the id alone does not say whose it is.
  readonly actor?: string
}

// A group, or an actor inside the Actors group. One type for both levels because the shape is the
// same and the nesting is exactly one deep - which is also why this is three collapsible groups
// rather than a treeview: the fiddly part of a real `role="tree"` is the part this shape does not
// have.
export interface DeclaredBranch {
  // What the author is shown: a group's name, or the actor's own id.
  readonly name: string
  // What identifies it, for the collapse state and for a test: the manifest key path, joined.
  readonly key: string
  readonly leaves: DeclaredLeaf[]
  readonly branches: DeclaredBranch[]
}

// The manifest key path as one string. The key rather than the path identifies a row, because two
// ids may name the same file and only one of them is the row that was clicked.
export const leafKey = (manifestKey: (string | number)[]): string => manifestKey.join("/")

// How many things are under a branch, which is the figure its header carries. A group of assets
// counts its leaves and the Actors group counts its actors, from one expression rather than a rule
// per group.
export const branchCount = (branch: DeclaredBranch): number => branch.leaves.length + branch.branches.length

// Whether a project has declared anything at all - what a project straight out of `mintProject`
// shows, whose manifest is `formatVersion`/`id`/`title` and nothing else.
export const nothingDeclared = (groups: DeclaredBranch[]): boolean => groups.every((group) => branchCount(group) === 0)

// The three groups, always all three and always in this order - which is also the order a project is
// read in: what it has, then who says it.
export const declaredGroups = (state: VnPlayerState): DeclaredBranch[] => [
  {
    name: "Backgrounds",
    key: "backgrounds",
    branches: [],
    leaves: Object.entries(state.backgrounds).map(([id, file]) => ({
      kind: "background",
      id,
      file,
      path: backgroundFilePath(file),
      manifestKey: ["backgrounds", id],
    })),
  },
  {
    name: "Audio",
    key: "audioAssets",
    branches: [],
    leaves: Object.entries(state.audioAssets).map(([id, asset]) => ({
      kind: "audio",
      id,
      file: asset.file,
      path: audioFilePath(asset.file),
      manifestKey: ["audioAssets", id],
    })),
  },
  {
    name: "Actors",
    key: "actors",
    leaves: [],
    branches: Object.entries(state.actors)
      // **`default` and `narrator` are the engine's own**, and `seedActors` merges both in on every
      // boot whether or not the manifest mentions them - so a walk of the state would otherwise draw
      // two actors nobody declared. They are kept only when they declare sprites, because at that
      // point an author did write them down. This is the one place the state and the manifest
      // disagree about what a project declares, and it is settled in favour of the manifest.
      .filter(([id, actor]) => !isEngineActor(id) || Object.keys(actor.sprites ?? {}).length > 0)
      .map(([actor, declared]) => ({
        name: actor,
        key: leafKey(["actors", actor]),
        branches: [],
        leaves: Object.entries(declared.sprites ?? {}).map(([id, file]) => ({
          kind: "sprite" as const,
          actor,
          id,
          file,
          path: spriteFilePath(actor, file),
          manifestKey: ["actors", actor, "sprites", id],
        })),
      })),
  },
]

const isEngineActor = (id: string): boolean => id === DEFAULT_ACTOR_ID || id === NARRATOR_ACTOR_ID
