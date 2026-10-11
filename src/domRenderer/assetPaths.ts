import { AssetDeclaration, DeclaredAsset } from "../core/manifest"
import { Actor, AudioAsset, SpriteInstance, VnPlayerState } from "../core/state"

// Where an asset id becomes a path under the project directory. The script names ids; the manifest
// says which file each one is; this is the one place the two are put together, so what
// `DomRenderer.loadAssets` preloads and what a sub-renderer asks the loader for cannot drift apart.
//
// Two functions per asset kind, and both halves are needed. `xFilePath` builds the path from a
// filename, which is what preloading has - it walks the declarations, so every file is already in
// hand. `xAssetPath` resolves an id first, which is what rendering has. The second is defined in
// terms of the first, so the directory prefix is written once.
//
// A lookup yields `undefined` rather than throwing when nothing declares the id, so the caller can
// say which id failed and in what role.
//
// Every path is under `assets/`, which is design-docs/PROJECT_STORAGE.md's layout: a project
// directory keeps its own files - manifest.yaml, script.yaml, and the N script files
// design-docs/SCRIPT_INCLUDES.md adds - above that level, so nothing there can ever be mistaken for
// media. The prefix belongs here and not in an `AssetResolver`: it is part of the project's layout,
// not part of where the bytes come from, and a resolver that added one would make two
// implementations disagree about what a path means.

// The layout itself, written once. Every builder below and the one reader at the bottom go through
// these, which is what "do not re-spell the prefix" means in practice.
const ASSETS = "assets/"
const AUDIO = ASSETS + "audio/"
const BACKGROUNDS = ASSETS + "backgrounds/"
const SPRITES = ASSETS + "sprites/"

export const audioFilePath = (file: string): string => AUDIO + file

export const audioAssetPath = (assets: Record<string, AudioAsset>, id: string): string | undefined => {
  const asset = assets[id]
  return asset === undefined ? undefined : audioFilePath(asset.file)
}

export const backgroundFilePath = (file: string): string => BACKGROUNDS + file

export const backgroundAssetPath = (backgrounds: Record<string, string>, id: string): string | undefined => {
  const file = backgrounds[id]
  return file === undefined ? undefined : backgroundFilePath(file)
}

// An actor's sprites live in a directory of their own, so two actors may declare the same filename.
export const spriteFilePath = (actor: string, file: string): string => `${SPRITES}${actor}/${file}`

export const spriteAssetPath = (actors: Record<string, Actor>, instance: SpriteInstance): string | undefined => {
  const file = actors[instance.actor]?.sprites?.[instance.sprite]
  return file === undefined ? undefined : spriteFilePath(instance.actor, file)
}

// Where a declaration's file sits. The third question this module answers, and the one an *edit* has
// rather than a render: `Add asset` holds a kind and a filename before any id is declared, so
// `xFilePath` alone does not say which directory and `xAssetPath` needs a declaration that is not
// there yet. Defined in terms of the three above, like everything else here, so the prefixes stay
// written once.
export const declaredFilePath = (declaration: AssetDeclaration): string =>
  declaration.kind === "sprite"
    ? spriteFilePath(declaration.actor, declaration.file)
    : declaration.kind === "audio"
    ? audioFilePath(declaration.file)
    : backgroundFilePath(declaration.file)

// Every asset a state declares, whether or not the story reaches it - the manifest is the file
// index. The one walk of the three declarations: `DomRenderer.loadAssets` preloads what it yields
// and reports failures out of the same list, so what is preloaded, what is asked for later and what
// an error points at cannot drift apart.
//
// Split by loader rather than returned flat, because sprites and backgrounds are images and audio
// is not, and the caller would otherwise have to know which is which a second time.
export const declaredAssets = (state: VnPlayerState): { images: DeclaredAsset[]; audio: DeclaredAsset[] } => {
  const images: DeclaredAsset[] = []
  const audio: DeclaredAsset[] = []

  for (const actor in state.actors) {
    const sprites = state.actors[actor].sprites ?? {}
    for (const id in sprites) {
      images.push({ path: spriteFilePath(actor, sprites[id]), manifestKey: ["actors", actor, "sprites", id] })
    }
  }
  for (const id in state.backgrounds) {
    images.push({ path: backgroundFilePath(state.backgrounds[id]), manifestKey: ["backgrounds", id] })
  }
  for (const id in state.audioAssets) {
    audio.push({ path: audioFilePath(state.audioAssets[id].file), manifestKey: ["audioAssets", id] })
  }

  return { images, audio }
}

// The other direction: what a path under `assets/` would be declared as, read back off the layout -
// the kind, the actor for a sprite, and the filename a declaration names. The inverse of
// `declaredFilePath`, so a location given any id builds back the path it came from.
//
// The asset panel's undeclared files are the one reader: it sorts a file nobody declares into the
// group its folder names. **Only the layout's question**, not the manifest's - whether the actor a
// folder names is one any manifest could declare is `parseManifest.ts`'s to say.
export type AssetLocation =
  | { readonly kind: "background" | "audio"; readonly file: string }
  | { readonly kind: "sprite"; readonly actor: string; readonly file: string }

// Null for a path outside the three folders, a file straight under `sprites/` with no actor folder,
// or a folder named on its own.
export const locateAsset = (path: string): AssetLocation | null => {
  const background = below(path, BACKGROUNDS)
  if (background !== null) return { kind: "background", file: background }
  const track = below(path, AUDIO)
  if (track !== null) return { kind: "audio", file: track }
  const sprite = below(path, SPRITES)
  const slash = sprite?.indexOf("/") ?? -1
  if (sprite === null || slash <= 0 || slash === sprite.length - 1) return null
  return { kind: "sprite", actor: sprite.slice(0, slash), file: sprite.slice(slash + 1) }
}

// The path below `assets/`, or null for one outside it - what is above that level is the project
// describing itself, never an asset.
export const belowAssets = (path: string): string | null => below(path, ASSETS)

const below = (path: string, folder: string): string | null =>
  path.startsWith(folder) && path.length > folder.length ? path.slice(folder.length) : null
