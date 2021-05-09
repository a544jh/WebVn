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
      const spriteElem = this.getSpriteElem(id)
      if (spriteElem !== null) {
        const prevSprite = this.renderer.getCommittedState()?.animatableState.sprites[id]
        if (prevSprite !== undefined && sprites[id] !== prevSprite) {
          if (prevSprite.sprite !== sprites[id].sprite) {
            // TODO set position ...
            if (animate) {
              // fade out current
              spriteElem.addEventListener("transitionend", () => {
                spriteElem.remove()
              })
              spriteElem.style.opacity = "0"
              spriteElem.style.transitionDuration = "200ms"

              // fade in new ...
              const newElem = this.assetLoader.getAsset(getSpriteAssetPath(sprites[id]))
              if (!newElem) throw new Error("Can't render unloaded sprite")
              newElem.style.opacity = "0"
              newElem.style.transitionDuration = "200ms"
              newElem.offsetHeight // force reflow
              newElem.style.opacity = "1"
              newElem.dataset.vnSpriteId = id
              this.root.appendChild(newElem)
            } else {
              const newElem = this.assetLoader.getAsset(getSpriteAssetPath(sprites[id]))
              if (!newElem) throw new Error("Can't render unloaded sprite")
              newElem.dataset.vnSpriteId = id
              spriteElem.replaceWith(newElem)
            }
          }
        }
        continue
      }
      const sprite = sprites[id]
      const elem = this.assetLoader.getAsset(getSpriteAssetPath(sprite))
      if (!elem) throw new Error("Can't render unloaded sprite") // maybe we want to have a type that guarantees that the asset is available..
      elem.dataset.vnSpriteId = id

      // TODO transform, normalize coords..

      this.root.appendChild(elem)

      if (animate) {
        elem.style.opacity = "0"
        elem.style.transitionDuration = "200ms"
        elem.offsetHeight // force reflow
        elem.style.opacity = "1"
      }
    }

    // remove from DOM
    const elems = [...this.root.children]
    for (const elem of elems as HTMLElement[]) {
      const id = elem.dataset.vnSpriteId
      if (id !== undefined && sprites[id] === undefined) {
        if (!animate) {
          elem.remove()
        } else {
          elem.style.transitionDuration = "200ms"
          elem.style.opacity = "0"
          elem.addEventListener("transitionend", () => {
            elem.remove()
          })
        }
      } else if (id === undefined) {
        elem.remove()
      }
    }

    return Promise.resolve()
  }

  private getSpriteElem(id: string): HTMLElement {
    return this.root.querySelector(`[data-vn-sprite-id=${id}]`) as HTMLElement
  }
}

export function getSpriteAssetPath(sprite: Sprite): string {
  return `sprites/${sprite.actor}/${sprite.sprite}`
}
