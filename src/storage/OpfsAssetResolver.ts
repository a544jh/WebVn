import { AssetResolver } from "../assetLoaders/AssetResolver"
import { readProjectFile } from "./projectStore"

// The editor's half of design-docs/PROJECT_STORAGE.md's "the player and the editor get different
// resolvers": an asset's bytes come out of the project's own directory in OPFS rather than off the
// network.
//
//   resolve("assets/sprites/A1/idle.png")
//     -> readProjectFile("my-story", "assets/sprites/A1/idle.png")
//     -> URL.createObjectURL(blob)
//
// Constructed with the project's *directory*, which is the only thing it needs to know - and the
// directory rather than the manifest's id for the same reason storing addresses one: an author who
// edits `id:` has made the two disagree, and that is the rename ticket's to resolve.
//
// A path the store does not have rejects, and `loadAll` reports it like any other missing file - so
// the editor's existing "declared file that is not there" warning, marked on the manifest line that
// declared it, works over OPFS with no further change. That is the payoff for keeping the logical
// path as the loader's key.
export class OpfsAssetResolver implements AssetResolver {
  constructor(private directory: string) {}

  public async resolve(path: string): Promise<string> {
    const blob = await readProjectFile(this.directory, path)
    // Minted once per path and never revoked. The loaders never evict, and every `getAsset` hands
    // out a `cloneNode()`, which re-runs the load against its `src` - so a revoked URL yields an element that
    // silently never loads, with nothing thrown and nothing logged. "We made this URL, we should
    // clean it up" is the obvious-looking change that breaks it;
    // test/browser/objectUrlLifetime.test.ts is what it trips over. If eviction ever needs
    // revocation, it belongs to the loader, which holds the element and knows when it drops one.
    return URL.createObjectURL(blob)
  }
}
