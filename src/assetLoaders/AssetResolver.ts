// Where an asset's bytes come from. One interface between "a logical path inside a project" and
// "something an element can load", so that swapping the storage backend under the editor is a
// constructor argument rather than a change to the render path.
//
// **`AssetLoader.loadAsset` is where it is consulted on the render path, and the asset panel's
// preview is the second caller** - it opens a file in a browser tab, which is a path resolved to a
// URL and nothing else. Going through the loader instead would not work: `getAsset` hands back a
// cloned element rather than a URL. This comment said "consulted in exactly one place" and that was
// a fact about callers rather than a rule about them. design-docs/PROJECT_STORAGE.md, "The player and the editor get different
// resolvers".
//
// This is not a replacement for `src/domRenderer/assetPaths.ts`, which is the tempting reading of
// the name. That module answers "which file is this id", which is a manifest question and a pure
// function of the declarations; this answers "where do that file's bytes come from", which is a
// storage question. Two questions, two modules - and the logical path stays the loader's key
// throughout, so `registerAsset`, `getAsset`, `loadAll` and every failure report are untouched by
// which resolver is in use.
export interface AssetResolver {
  // A path inside the project - `assets/backgrounds/a.png`, `assets/sprites/A1/idle.png` - to
  // something an element can load. Async because reading a file out of OPFS is.
  //
  // There is deliberately no `release` counterpart. When eviction eventually needs one, revoking
  // belongs to the *loader*, not here: the loader holds the element and knows when it drops one,
  // while a resolver hands back a URL and forgets it. A resolver that revoked would break the
  // `cloneNode()` every `getAsset` hands out: a clone re-runs the load against its `src`, which
  // normally costs nothing because the browser serves it out of its decoded-image cache, but a
  // revoked `blob:` URL no longer resolves to anything and the clone silently never loads. That is
  // what test/browser/objectUrlLifetime.test.ts pins, both halves of it.
  resolve(path: string): Promise<string>
}

// The resolver a published VN uses, which is a directory of relative paths: a path inside the
// project is a URL once it is resolved against the folder the project is served from. Not a
// placeholder and not a migration step - the standalone player, the deployed demo and every test keep
// this one permanently, and it is half of the doc's "the player and the editor get different
// resolvers".
//
// **The base is the published folder's address**, which the player is told rather than working out
// (`src/playerBoot.ts`): in production it is the page's own directory, which is what a bare relative
// path resolved against anyway, and in a suite it is the served `test-assets/` folder, which the
// runner's own page is not. Without one the path is handed back as it stands and the browser resolves
// it against the document, which is what the loaders' default wants. A base is also most of a player
// for a VN hosted on another origin - what that still has to decide is CORS and partial failure,
// which is why it is not built.
export class RelativePathResolver implements AssetResolver {
  constructor(private base?: string) {}

  public resolve(path: string): Promise<string> {
    return Promise.resolve(this.base === undefined ? path : new URL(path, this.base).href)
  }
}
