export class ImageAssetLoaderSrc {
  private assets: Record<string, HTMLImageElement | null> = {}

  public registerAsset(path: string): void {
    this.assets[path] = null
  }

  public getAsset(path: string): HTMLImageElement | null | undefined {
    return this.assets[path]
  }

  public loadAsset(path: string): Promise<void> {
    if (this.assets[path] !== undefined && this.assets[path] !== null) {
      return Promise.resolve()
    }
    const img = new Image()
    img.src = path
    const decodePromise = img.decode()
    decodePromise.then(() => {
      this.assets[path] = img
    })
    return decodePromise
  }

  public loadAll(): Promise<void[]> {
    const decodePromises = []
    for (const path in this.assets) {
      decodePromises.push(this.loadAsset(path))
    }
    return Promise.all(decodePromises)
  }
}
