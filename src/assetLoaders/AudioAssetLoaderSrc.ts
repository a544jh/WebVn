import { AssetLoader } from "./AssetLoader"
import { loadAllOf } from "./loadAll"

export class AudioAssetLoaderSrc implements AssetLoader<HTMLAudioElement> {
  private assets: Record<string, HTMLAudioElement | null> = {}
  private failed: Set<string> = new Set()

  // Idempotent, for the same reason as the image loader's.
  public registerAsset(path: string): void {
    if (this.assets[path] === undefined) this.assets[path] = null
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
    return new Promise((resolve, reject) => {
      audio.addEventListener("canplaythrough", () => {
        this.assets[path] = audio
        resolve()
      })
      // Without this a missing file leaves the promise pending forever - `canplaythrough` never
      // fires and nothing else settles it - so one bad declaration hangs every load after it.
      audio.addEventListener("error", () => reject(new Error("Could not load " + path)))
    })
  }

  public loadAll(): Promise<string[]> {
    return loadAllOf(Object.keys(this.assets), this.failed, this.loadAsset.bind(this))
  }
}
