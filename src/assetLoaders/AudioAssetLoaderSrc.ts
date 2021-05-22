import { AssetLoader } from "./AssetLoader"

export class AudioAssetLoaderSrc implements AssetLoader<HTMLAudioElement> {
  private assets: Record<string, HTMLAudioElement | null> = {}

  public registerAsset(path: string): void {
    this.assets[path] = null
  }

  public getAsset(path: string): HTMLAudioElement | null | undefined {
    const asset = this.assets[path]
    if (asset === null || asset === undefined) {
      return asset
    }
    return asset.cloneNode() as HTMLAudioElement
  }

  public loadAsset(path: string): Promise<void> {
    if (this.assets[path] !== undefined && this.assets[path] !== null) {
      return Promise.resolve()
    }
    const audio = new Audio(path)
    return new Promise((resolve) => {
      audio.addEventListener("canplaythrough", () => {
        this.assets[path] = audio
        resolve()
      })
    })
  }

  public loadAll(): Promise<void[]> {
    const loadPromises = []
    for (const path in this.assets) {
      loadPromises.push(this.loadAsset(path))
    }
    return Promise.all(loadPromises)
  }
}
