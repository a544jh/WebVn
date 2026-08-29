import { AssetLoader } from "./AssetLoader"
import { AssetResolver, RelativePathResolver } from "./AssetResolver"
import { loadAllOf } from "./loadAll"

export class ImageAssetLoaderSrc implements AssetLoader<HTMLImageElement> {
  private assets: Record<string, HTMLImageElement | null> = {}
  private failed: Set<string> = new Set()
  private resolver: AssetResolver

  constructor(resolver: AssetResolver = new RelativePathResolver()) {
    this.resolver = resolver
  }

  // Idempotent, because registration happens again on every load - and adopting a manifest makes
  // that every editor blur. Re-registering a loaded asset as null would drop what is already
  // decoded and re-fetch the whole project each time.
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

  // The resolver is consulted here and nowhere else, and only after the early return above: an
  // already-loaded asset is never re-resolved, so re-registering the whole project on every
  // adopt-on-blur costs nothing. Resolving ahead of time in `DomRenderer.loadAssets` instead would
  // mean N reads and N fresh object URLs per keystroke pause, unless that caller started tracking
  // what is already loaded - which is duplicating this loader's own state in it.
  public async loadAsset(path: string): Promise<void> {
    if (this.assets[path] !== undefined && this.assets[path] !== null) {
      return
    }
    const url = await this.resolver.resolve(path)
    const img = new Image()
    img.src = url
    // decode() rejects on a failed load, which is the reporting this loader already had. A resolver
    // that rejects - the file is not in the store - fails the same way, which is how "a declared
    // file that is not there" keeps working whatever the bytes come from.
    await img.decode()
    // Keyed by the logical path, never by the URL: that is what lets a failure be reported against
    // the manifest line that declared it, and what the three render-time call sites look up.
    this.assets[path] = img
  }

  public loadAll(): Promise<string[]> {
    return loadAllOf(Object.keys(this.assets), this.failed, this.loadAsset.bind(this))
  }
}
