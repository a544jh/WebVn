import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { Sprite } from "../core/state"
import { createResolvablePromise, DomRenderer } from "./DomRenderer"

export class SpriteRenderer {
  private root: HTMLDivElement
  private readonly TRANSITION_DURATION = "500ms"
  private readonly sceneWidth: number
  private readonly sceneHeight: number

  constructor(vnRoot: HTMLDivElement, private renderer: DomRenderer, private assetLoader: ImageAssetLoaderSrc) {
    this.root = document.createElement("div")
    this.root.id = "vn-sprite-renderer"
    vnRoot.appendChild(this.root)
    this.sceneWidth = this.root.clientWidth
    this.sceneHeight = this.root.clientHeight
  }

  public async render(sprites: Record<string, Sprite>, animate: boolean): Promise<void[]> {
    const animPromises: Promise<void>[] = []

    for (const id in sprites) {
      const spriteElem = this.getSpriteElem(id)
      if (spriteElem !== null) {
        if (!animate) spriteElem.style.transitionDuration = ""

        const prevSprite = this.renderer.getCommittedState()?.animatableState.sprites[id]
        if (prevSprite !== undefined && sprites[id] !== prevSprite) {
          // handle sprite change
          this.setPosition(spriteElem, sprites[id])

          if (animate) {
            spriteElem.style.transitionDuration = this.TRANSITION_DURATION
            this.addTransitionEndPromise(animPromises, spriteElem)
          }

          if (prevSprite.sprite !== sprites[id].sprite) {
            // handle sprite image change

            const newElem = this.assetLoader.getAsset(getSpriteAssetPath(sprites[id]))
            if (!newElem) throw new Error("Can't render unloaded sprite")
            newElem.dataset.vnSpriteId = id

            if (animate) {
              // fade out current
              delete spriteElem.dataset.vnSpriteId // clean up the elem if we skip animation

              spriteElem.addEventListener("transitionend", () => {
                spriteElem.remove()
              })
              spriteElem.style.opacity = "0"
              spriteElem.style.transitionDuration = this.TRANSITION_DURATION

              // fade in new ...
              this.addTransitionEndPromise(animPromises, newElem)
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
        this.addTransitionEndPromise(animPromises, newElem)
        newElem.style.opacity = "0"
        newElem.style.transitionDuration = this.TRANSITION_DURATION
        newElem.offsetHeight // force reflow
        newElem.style.opacity = "1"
      }
    }

    // remove from DOM
    const elems = [...this.root.children]
    for (const elem of elems as HTMLImageElement[]) {
      const id = elem.dataset.vnSpriteId
      if (id === undefined || (id !== undefined && sprites[id] === undefined)) {
        if (!animate) {
          elem.remove()
        } else {
          const [promise, resolve] = createResolvablePromise()
          animPromises.push(promise)

          // bug (solved) ... promise needs to be resolved AFTER elem is removed from dom
          // otherwise next render won't resolve, because elem is still in dom ....

          elem.style.transitionDuration = this.TRANSITION_DURATION
          elem.style.opacity = "0"
          elem.addEventListener("transitionend", () => {
            elem.remove()
            resolve()
          })
        }
      }
    }

    // TODO return when all animtions finished .....
    return Promise.all(animPromises)
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

  private addTransitionEndPromise(animPromises: Promise<void>[], elem: HTMLImageElement): void {
    // console.log("Adding promise to", elem)
    const [promise, resolve] = createResolvablePromise()
    animPromises.push(promise)
    const handler = () => {
      // console.log("Resolving", elem)
      elem.removeEventListener("transitionend", handler)
      resolve()
    }
    elem.addEventListener("transitionend", handler)
  }
}

export function getSpriteAssetPath(sprite: Sprite): string {
  return `sprites/${sprite.actor}/${sprite.sprite}`
}
