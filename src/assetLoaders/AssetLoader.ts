export interface AssetLoader<T> {
  registerAsset(path: string): void
  getAsset(path: string): T | null | undefined
  // Rejects when the file is not there. `loadAll` is the caller that catches it.
  loadAsset(path: string): Promise<void>
  // Resolves with the paths that failed rather than rejecting on the first one. Declaring an asset
  // before the file exists is the normal authoring order, so a manifest naming a file nobody has
  // drawn yet has to load everything else and say what is missing.
  //
  // A path that has already failed is reported again but not retried: registration is cumulative,
  // so retrying would re-request every typo ever made, on every load.
  loadAll(): Promise<string[]>
  // Forget everything: every decoded asset, and every path known to have failed. The next
  // registration and load re-resolve from scratch, which is the only way a file whose *bytes*
  // changed under an unchanged path can reach the screen - `loadAsset` early-returns on a path it
  // already holds, before it ever consults the resolver, and under OPFS the object URL behind that
  // path still points at the old blob.
  //
  // **Not eviction.** Nothing is revoked. `OpfsAssetResolver` mints one object URL per path and
  // never revokes it, and `getAsset` hands out a `cloneNode()` whose load re-runs against its
  // `src` - so a revoked URL is an element that silently never loads, which is what
  // test/browser/objectUrlLifetime.test.ts pins both halves of. Giving these loaders real eviction
  // is the right change eventually and is deliberately not the price of admission for a file
  // picker: see `.scratch/asset-panel/issues/04-replacing-and-previewing-an-asset.md`.
  clear(): void
}
