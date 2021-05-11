import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { Sprite } from "../core/state"
import { DomRenderer } from "./DomRenderer"

export class SpriteRenderer {
  private root: HTMLDivElement
  private readonly TRANSITION_DURATION = "2000ms"
  private readonly sceneWidth: number
  private readonly sceneHeight: number

  constructor(vnRoot: HTMLDivElement, private renderer: DomRenderer, private assetLoader: ImageAssetLoaderSrc) {
    this.root = document.createElement("div")
    this.root.id = "vn-sprite-renderer"
    vnRoot.appendChild(this.root)
    this.sceneWidth = this.root.clientWidth
    this.sceneHeight = this.root.clientHeight
  }

  public async render(sprites: Record<string, Sprite>, animate: boolean): Promise<void> {
    for (const id in sprites) {
      const spriteElem = this.getSpriteElem(id)
      if (spriteElem !== null) {
        const prevSprite = this.renderer.getCommittedState()?.animatableState.sprites[id]
        if (prevSprite !== undefined && sprites[id] !== prevSprite) {
          this.setPosition(spriteElem, sprites[id])

          if (animate) {
            spriteElem.style.transitionDuration = this.TRANSITION_DURATION
          } else {
            spriteElem.style.transitionDuration = ""
          }

          if (prevSprite.sprite !== sprites[id].sprite) {
            // handle sprite image change

            const newElem = this.assetLoader.getAsset(getSpriteAssetPath(sprites[id]))
            if (!newElem) throw new Error("Can't render unloaded sprite")
            newElem.dataset.vnSpriteId = id

            if (animate) {
              // fade out current
              spriteElem.dataset.vnSpriteId = undefined // clean up the elem if we skip animation
              spriteElem.addEventListener("transitionend", () => {
                spriteElem.remove()
              })
              spriteElem.style.opacity = "0"
              spriteElem.style.transitionDuration = this.TRANSITION_DURATION

              // fade in new ...
              newElem.style.opacity = "0"
              newElem.style.transitionDuration = this.TRANSITION_DURATION
              this.setPosition(newElem, prevSprite)

              this.root.appendChild(newElem)
              newElem.offsetHeight // force reflow

              newElem.style.opacity = "1"
              this.setPosition(newElem, sprites[id])
            } else {
              this.setPosition(newElem, sprites[id])
              spriteElem.replaceWith(newElem)
            }
          }
        }
        continue
      }

      // add new sprite
      const newSprite = sprites[id]
      const newElem = this.assetLoader.getAsset(getSpriteAssetPath(newSprite))
      if (!newElem) throw new Error("Can't render unloaded sprite") // maybe we want to have a type that guarantees that the asset is available..
      newElem.dataset.vnSpriteId = id
      this.setPosition(newElem, newSprite)

      this.root.appendChild(newElem)

      if (animate) {
        // fade in
        newElem.style.opacity = "0"
        newElem.style.transitionDuration = this.TRANSITION_DURATION
        newElem.offsetHeight // force reflow
        newElem.style.opacity = "1"
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
          elem.style.transitionDuration = this.TRANSITION_DURATION
          elem.style.opacity = "0"
          elem.addEventListener("transitionend", () => {
            elem.remove()
          })
        }
      } else if (id === undefined) {
        elem.remove()
      }
    }

    // TODO return when all animtions finished .....
    return Promise.resolve()
  }

  private getSpriteElem(id: string): HTMLImageElement {
    return this.root.querySelector(`[data-vn-sprite-id=${id}]`) as HTMLImageElement
  }

  private setPosition(elem: HTMLImageElement, sprite: Sprite): void {
    const xPos = this.sceneWidth * sprite.x - elem.width * sprite.anchorX
    const yPos = this.sceneHeight * sprite.y - elem.height * sprite.anchorY

    const transformStr = `translate(${Math.round(xPos)}px, ${Math.round(yPos)}px)`

    elem.style.transform = transformStr
  }
}

export function getSpriteAssetPath(sprite: Sprite): string {
  return `sprites/${sprite.actor}/${sprite.sprite}`
}
