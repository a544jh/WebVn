import { AssetLoader } from "./AssetLoader"
import { loadAllOf } from "./loadAll"

export class ImageAssetLoaderSrc implements AssetLoader<HTMLImageElement> {
  private assets: Record<string, HTMLImageElement | null> = {}
  private failed: Set<string> = new Set()

  // Idempotent, because registration happens again on every load: re-registering a loaded asset as
  // null would drop what is already decoded and re-fetch it.
  public registerAsset(path: string): void {
    if (this.assets[path] === undefined) this.assets[path] = null
  }

  public getAsset(path: string): HTMLImageElement | null | undefined {
    const asset = this.assets[path]
    if (asset === null || asset === undefined) {
      return asset
    }
    return asset.cloneNode() as HTMLImageElement
  }

  public loadAsset(path: string): Promise<void> {
    if (this.assets[path] !== undefined && this.assets[path] !== null) {
      return Promise.resolve()
    }
    const img = new Image()
    img.src = path
    // decode() rejects on a failed load, which is the reporting this loader already had.
    return img.decode().then(() => {
      this.assets[path] = img
    })
  }

  public loadAll(): Promise<string[]> {
    return loadAllOf(Object.keys(this.assets), this.failed, this.loadAsset.bind(this))
  }
}
