export interface AssetLoader<T> {
  registerAsset(path: string): void
  getAsset(path: string): T | null | undefined
  loadAsset(path: string): Promise<void>
  loadAll(): Promise<void[]>
}
