import { Actor, AudioAsset, SpriteInstance } from "../core/state"

// Where an asset id becomes a path under the project directory. The script names ids; the manifest
// says which file each one is; this is the one place the two are put together, so what
// `DomRenderer.loadAssets` preloads and what a sub-renderer asks the loader for cannot drift apart.
//
// Every lookup yields `undefined` rather than throwing when nothing declares the id, so the caller
// can say which id failed and in what role. Once TODO item E lands, an `AssetResolver` takes over
// the second half of each of these - the path stops being a string concatenation - and the ids
// these functions exist to resolve are what it resolves.

// `bg: {image: "#000000"}` paints a colour instead of naming an asset. This test is the definition
// of that split, and the manifest schema is what keeps an id from ever looking like one.
export const isBackgroundColor = (image: string): boolean => image.charAt(0) === "#"

export const audioAssetPath = (assets: Record<string, AudioAsset>, id: string): string | undefined => {
  const asset = assets[id]
  return asset === undefined ? undefined : "audio/" + asset.file
}

export const backgroundAssetPath = (backgrounds: Record<string, string>, id: string): string | undefined => {
  const file = backgrounds[id]
  return file === undefined ? undefined : "backgrounds/" + file
}

// An actor's sprites live in a directory of their own, so two actors may declare the same filename.
export const spriteFilePath = (actor: string, file: string): string => `sprites/${actor}/${file}`

export const spriteAssetPath = (actors: Record<string, Actor>, sprite: SpriteInstance): string | undefined => {
  const file = actors[sprite.actor]?.sprites?.[sprite.sprite]
  return file === undefined ? undefined : spriteFilePath(sprite.actor, file)
}
