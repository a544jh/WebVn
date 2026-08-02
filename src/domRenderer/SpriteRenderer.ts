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
        const prevSprite = this.renderer.getCommittedState()?.animatableState.sprites[id]

        if (!animate) {
          // skip to end state, even if the state didn't change: an animation from a
          // previous render may still be in flight, and its transitionend listeners
          // must not stay armed on the element
          if (prevSprite !== undefined && getSpriteAssetPath(prevSprite) !== getSpriteAssetPath(sprites[id])) {
            const newElem = this.createSpriteElem(id, sprites[id])
            this.setPosition(newElem, sprites[id])
            spriteElem.replaceWith(newElem)
          } else {
            // cancel transitions and drop listeners
            const clone = spriteElem.cloneNode() as HTMLImageElement
            clone.style.transitionDuration = ""
            clone.style.opacity = ""
            this.setPosition(clone, sprites[id])
            spriteElem.replaceWith(clone)
          }
          continue
        }

        if (prevSprite !== undefined && sprites[id] !== prevSprite) {
          // handle position change
          if (
            prevSprite.x !== sprites[id].x ||
            prevSprite.y !== sprites[id].y ||
            prevSprite.anchorX !== sprites[id].anchorX ||
            prevSprite.anchorY !== sprites[id].anchorY
          ) {
            spriteElem.style.transitionDuration = this.TRANSITION_DURATION
            this.addTransitionEndPromise(animPromises, spriteElem)
            this.setPosition(spriteElem, sprites[id])
          }
          if (getSpriteAssetPath(prevSprite) !== getSpriteAssetPath(sprites[id])) {
            // handle sprite image change

            const newElem = this.createSpriteElem(id, sprites[id])

            // fade out current
            delete spriteElem.dataset.vnSpriteId // the removal loop below cleans the elem up if we skip animation

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
          }
        }
        continue
      }

      // add new sprite
      const newSprite = sprites[id]
      const newElem = this.createSpriteElem(id, newSprite)
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
          delete elem.dataset.vnSpriteId
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

  private createSpriteElem(id: string, sprite: Sprite): HTMLImageElement {
    const elem = this.assetLoader.getAsset(getSpriteAssetPath(sprite))
    if (!elem) throw new Error("Can't render unloaded sprite") // maybe we want to have a type that guarantees that the asset is available..
    elem.dataset.vnSpriteId = id
    return elem
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
