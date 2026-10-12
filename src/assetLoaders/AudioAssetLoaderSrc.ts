import { AssetLoader } from "./AssetLoader"
import { AssetResolver, RelativePathResolver } from "./AssetResolver"
import { loadAllOf } from "./loadAll"

export class AudioAssetLoaderSrc implements AssetLoader<HTMLAudioElement> {
  private assets: Record<string, HTMLAudioElement | null> = {}
  private readonly failed: Set<string> = new Set()
  private resolver: AssetResolver

  constructor(resolver: AssetResolver = new RelativePathResolver()) {
    this.resolver = resolver
  }

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

  // Consulted here and nowhere else, after the early return - see the image loader for why that
  // ordering is the whole reason the resolver lives in `loadAsset` rather than in its caller.
  public async loadAsset(path: string): Promise<void> {
    if (this.assets[path] !== undefined && this.assets[path] !== null) {
      return
    }
    const audio = await loadAudio(await this.resolver.resolve(path)).catch(() => {
      throw new Error("Could not load " + path)
    })
    // Keyed by the logical path, not the URL - see the image loader.
    this.assets[path] = audio
  }

  public loadAll(): Promise<string[]> {
    return loadAllOf(Object.keys(this.assets), this.failed, this.loadAsset.bind(this))
  }

  // See `AssetLoader.clear`. Both maps, because a path that failed is remembered as never-retried
  // and a replace is precisely the author supplying the file that was missing.
  public clear(): void {
    this.assets = {}
    this.failed.clear()
  }
}

// An element ready to play through, or a rejection when the URL holds nothing this browser can play.
// Its own function for the reason `loadImage` is: the asset panel asks a picked file the same
// question, so what it lets in as audio is exactly what this loader will load.
export const loadAudio = (url: string): Promise<HTMLAudioElement> => {
  const audio = new Audio(url)
  return new Promise((resolve, reject) => {
    audio.addEventListener("canplaythrough", () => resolve(audio))
    // Without this a missing file leaves the promise pending forever - `canplaythrough` never
    // fires and nothing else settles it - so one bad declaration hangs every load after it.
    audio.addEventListener("error", () => reject(new Error("Could not load " + url)))
  })
}
