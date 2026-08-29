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
}
