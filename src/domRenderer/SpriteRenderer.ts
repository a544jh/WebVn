import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { Sprite } from "../core/state"
import { DomRenderer } from "./DomRenderer"

export class SpriteRenderer {
  private root: HTMLDivElement

  constructor(vnRoot: HTMLDivElement, private renderer: DomRenderer, private assetLoader: ImageAssetLoaderSrc) {
    this.root = document.createElement("div")
    this.root.id = "vn-sprite-renderer"
    vnRoot.appendChild(this.root)
  }

  public async render(sprites: Record<string, Sprite>, animate: boolean): Promise<void> {
    // add new sprites
    for (const id in sprites) {
      if (this.getSpriteElem(id) !== null) {
        continue
      }
      const sprite = sprites[id]
      const elem = this.assetLoader.getAsset(getSpriteAssetPath(sprite))
      if (!elem) throw new Error("Can't render unloaded sprite") // maybe we want to have a type that guarantees that the asset is available..
      elem.dataset.vnSpriteId = id
      elem.style.position = "absolute"

      // TODO transform, normalize coords..

      this.root.appendChild(elem)
    }

    // remove from DOM
    const elems = [...this.root.children]
    for (const elem of elems as HTMLElement[]) {
      const id = elem.dataset.vnSpriteId
      if (id !== undefined && sprites[id] === undefined) {
        this.root.removeChild(elem)
      }
    }

    return Promise.resolve()
  }

  private getSpriteElem(id: string) {
    return this.root.querySelector(`[data-vn-sprite-id=${id}]`)
  }
}

export function getSpriteAssetPath(sprite: Sprite): string {
  return `sprites/${sprite.actor}/${sprite.sprite}`
}
