// Where an asset's bytes come from. One interface between "a logical path inside a project" and
// "something an element can load", consulted in exactly one place - `AssetLoader.loadAsset` - so
// that swapping the storage backend under the editor is a constructor argument rather than a change
// to the render path. design-docs/PROJECT_STORAGE.md, "The player and the editor get different
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
  // `cloneNode()` every `getAsset` hands out, because a clone re-fetches its `src` - which is what
  // test/browser/objectUrlLifetime.test.ts pins.
  resolve(path: string): Promise<string>
}

// The resolver a published VN uses, which is a directory of relative paths: the path already is the
// URL, and the browser resolves it against the document. Not a placeholder and not a migration
// step - the standalone player, the deployed demo and every test keep this one permanently, and it
// is half of the doc's "the player and the editor get different resolvers".
//
// A class rather than a bare function or a singleton on purpose. Its anticipated second caller is a
// player loading a VN from another origin, which needs a base URL - a constructor argument this
// class has room for. That is deliberately not built here: nothing has a caller for it yet, and the
// interesting half of an outside origin is CORS and partial failure rather than the base.
export class RelativePathResolver implements AssetResolver {
  public resolve(path: string): Promise<string> {
    return Promise.resolve(path)
  }
}
