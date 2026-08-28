import { Actor, AudioAsset, SpriteInstance } from "../core/state"

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
// say which id failed and in what role. Once TODO item E lands, an `AssetResolver` takes over the
// path-building half of these; the ids they exist to resolve are what it resolves.

export const audioFilePath = (file: string): string => "audio/" + file

export const audioAssetPath = (assets: Record<string, AudioAsset>, id: string): string | undefined => {
  const asset = assets[id]
  return asset === undefined ? undefined : audioFilePath(asset.file)
}

export const backgroundFilePath = (file: string): string => "backgrounds/" + file

export const backgroundAssetPath = (backgrounds: Record<string, string>, id: string): string | undefined => {
  const file = backgrounds[id]
  return file === undefined ? undefined : backgroundFilePath(file)
}

// An actor's sprites live in a directory of their own, so two actors may declare the same filename.
export const spriteFilePath = (actor: string, file: string): string => `sprites/${actor}/${file}`

export const spriteAssetPath = (actors: Record<string, Actor>, instance: SpriteInstance): string | undefined => {
  const file = actors[instance.actor]?.sprites?.[instance.sprite]
  return file === undefined ? undefined : spriteFilePath(instance.actor, file)
}
