import { Renderer } from "../Renderer"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { TextBoxRenderer } from "./TextBoxRenderer"

import "./animations.css"
import "./defaultTheme.css"
import "./gg.css"
import { DecisionRenderer } from "./DecisionRenderer"
import { ImageAssetLoaderSrc } from "../assetLoaders/ImageAssetLoaderSrc"
import { SpriteRenderer } from "./SpriteRenderer"
import { BackgroundRenderer } from "./BackgroundRenderer"
import { AudioAssetLoaderSrc } from "../assetLoaders/AudioAssetLoaderSrc"
import { AudioRenderer } from "./AudioRenderer"
import { saveToLocalStorage, VnSaveSlotData } from "../core/save"
import { MenuCreator } from "./menus/MenuCreator"
import { pauseMenu } from "./menus/PauseMenu"
import { FreeformTextRenderer } from "./FreeformTextRenderer"
import { audioFilePath, backgroundFilePath, spriteFilePath } from "./assetPaths"

export class DomRenderer implements Renderer {
  public onRenderCallbacks: Array<() => void> = []
  public onFinishedCallbacks: Array<() => void> = []
  private consecutiveCommands = 0

  private finished: boolean
  private renderGeneration = 0

  private root: HTMLDivElement
  private menuDiv: HTMLDivElement
  private player: VnPlayer

  private committedState: VnPlayerState | null

  private SKIP_DELAY = 50

  public ignoreInputs = false
  public skipMode = false
  public autoplayInterval: number | null = null
  private wheelDelta = 0
  private lastPointerType = "mouse"

  private textBoxRenderer: TextBoxRenderer
  private freeformTextRenderer: FreeformTextRenderer
  private decisionRenderer: DecisionRenderer
  private spriteRenderer: SpriteRenderer
  private backgroundRenderer: BackgroundRenderer
  private audioRenderer: AudioRenderer

  private imageLoader: ImageAssetLoaderSrc
  private audioLoader: AudioAssetLoaderSrc

  private arrow: HTMLDivElement

  // What saves are keyed under: the manifest's `id`, threaded in rather than read off the player,
  // because `VnPlayerState` deliberately does not carry identity - see
  // docs/adr/0001-manifest-seeds-the-initial-state.md. The editor calls `setSaveId` when the author
  // adopts a manifest with a different one.
  private saveId: string

  constructor(elem: HTMLDivElement, player: VnPlayer, saveId: string) {
    this.finished = true

    this.saveId = saveId
    this.root = elem

    this.menuDiv = document.createElement("div")
    this.menuDiv.classList.add("vn-menu-container")
    this.menuDiv.addEventListener("click", (e) => {
      // prevent interacting with VN when menu is open..
      e.stopPropagation()
    })

    this.player = player

    this.committedState = null
    this.root.addEventListener(
      "click",
      (e) => {
        // click anywhere to cancel skip mode
        if (this.skipMode) {
          this.skipMode = false
          e.stopPropagation()
        }
      },
      { capture: true }
    )
    this.root.addEventListener("click", () => {
      this.disableAutoplay()
      this.advance()
    })
    this.root.addEventListener("wheel", this.handleScrollWheelEvent.bind(this), { passive: false })
    this.root.addEventListener("contextmenu", this.handleContextMenuEvent.bind(this))
    // remembered for the contextmenu handler: not every browser gives that event a pointerType
    this.root.addEventListener("pointerdown", (e) => (this.lastPointerType = e.pointerType), { capture: true })
    document.addEventListener("keydown", this.handleKeyDownEvent.bind(this))
    this.root.querySelector(".vn-action-back")?.addEventListener("click", (e) => {
      e.stopPropagation()
      this.undo()
    })
    this.root.querySelector(".vn-action-skip")?.addEventListener("click", (e) => {
      e.stopPropagation()
      this.enterSkipMode()
    })
    this.root.querySelector(".vn-action-auto")?.addEventListener("click", (e) => {
      e.stopPropagation()
      this.toggleAutoplay()
    })
    this.root.querySelector(".vn-action-menu")?.addEventListener("click", (e) => {
      e.stopPropagation()
      this.showMenu(pauseMenu)
    })

    this.imageLoader = new ImageAssetLoaderSrc()
    this.audioLoader = new AudioAssetLoaderSrc()

    this.textBoxRenderer = new TextBoxRenderer(this.root)
    this.freeformTextRenderer = new FreeformTextRenderer(this.root)
    this.decisionRenderer = new DecisionRenderer(this.root, this)
    this.spriteRenderer = new SpriteRenderer(this.root, this, this.imageLoader)
    this.backgroundRenderer = new BackgroundRenderer(this.root, this, this.imageLoader)
    this.audioRenderer = new AudioRenderer(this, this.audioLoader)

    this.arrow = document.createElement("div")
    this.arrow.classList.add("vn-arrow", "vn-anim-bounce")
    this.root.appendChild(this.arrow)
  }

  // Play a story from the top: swap it into the player and render, which leaves the auto-advance
  // in `render` to walk to the first stop, painting every frame on the way. That walk is the point
  // - it is what plays an intro or a title screen - so pass `animate: true` unless the caller wants
  // to land on the first stop without watching it happen, the way the editor does.
  //
  // The swap and the render must stay in one synchronous step. `render` bumps `renderGeneration`,
  // which is what tells a pass still in flight that it no longer owns the loop; a `loadState` that
  // is not immediately followed by a render leaves the old pass free to auto-advance the new story
  // instead, and it will step commands nobody asked it to.
  public loadStory(state: VnPlayerState, animate: boolean): void {
    this.player.loadState(state)
    this.render(animate)
  }

  public render(animate: boolean): void {
    // A new render supersedes any render still waiting on animations. Its completion
    // callback below must then do nothing: sub-renderer promises can resolve long after
    // (e.g. a sprite's transitionend), and acting on them would mark the renderer
    // finished (or auto-advance) based on a render that is no longer on screen.
    const generation = ++this.renderGeneration
    this.ignoreInputs = false
    const state = this.player.state

    this.onRenderCallbacks.forEach((cb) => cb())

    this.finished = false
    this.arrow.style.display = "none"

    const animationsFinished: Array<Promise<void | void[]>> = []

    // TODO: diffing (when we know more about other animations)
    const committedText = this.committedState === null ? null : this.committedState.animatableState.text

    animationsFinished.push(this.textBoxRenderer.render(committedText, state.animatableState.text, animate))
    animationsFinished.push(
      this.freeformTextRenderer.render(
        state.animatableState.freeformText,
        this.committedState?.animatableState.freeformText,
        animate
      )
    )
    animationsFinished.push(this.decisionRenderer.render(state.decision, animate))
    animationsFinished.push(this.spriteRenderer.render(state.animatableState.sprites, state.actors, animate))
    animationsFinished.push(
      this.backgroundRenderer.render(state.animatableState.background, state.backgrounds, animate)
    )
    animationsFinished.push(this.audioRenderer.render(state.animatableState.audio, state.audioAssets))

    this.committedState = state

    Promise.all(animationsFinished).then(() => {
      if (generation !== this.renderGeneration) return
      if (this.committedState?.decision === null) this.arrow.style.display = ""

      if (!this.player.isNextCommandSeen() || this.player.state.decision !== null) {
        this.root.querySelector(".vn-action-skip")?.classList.add("vn-action-disabled")
      } else {
        this.root.querySelector(".vn-action-skip")?.classList.remove("vn-action-disabled")
      }

      this.finished = true
      this.onFinishedCallbacks.forEach((cb) => cb())
      if (this.consecutiveCommands > 10000) {
        alert("Seems like we're stuck in an infinite loop")
        throw new Error("Got stuck in infinite loop while rendering")
      }
      if (!this.player.state.stopAfterRender) {
        this.consecutiveCommands++
        this.player.advance()
        this.render(animate)
      }
    })
  }

  public showMenu(menuCreator: MenuCreator): void {
    this.disableAutoplay()
    // opening a menu is a deliberate input, like a click: it takes over from skip mode
    this.skipMode = false
    this.menuDiv.innerHTML = ""
    menuCreator(this.menuDiv, this)
    this.root.appendChild(this.menuDiv)
  }

  public closeMenu(): void {
    this.root.removeChild(this.menuDiv)
    this.menuDiv.innerHTML = ""
  }

  public advance(): void {
    if (this.ignoreInputs) return
    this.consecutiveCommands = 0
    if (this.finished) {
      this.player.advance()
      this.render(true)
    } else {
      this.render(false)
    }

    this.persistGlobalSave()
  }

  public makeDecision(id: number): void {
    this.consecutiveCommands = 0
    this.player.makeDecision(id)
    this.render(true)
  }

  public undo(): void {
    this.consecutiveCommands = 0
    this.player.undo()
    this.render(false)
  }

  private skipModeTick() {
    // a tick is already in flight when skip mode is cancelled - cancelling has to mean that
    // nothing more is skipped, or the story steps once more behind a menu that just opened
    if (!this.skipMode) return
    if (!this.player.isNextCommandSeen()) {
      this.player.advanceUntilStop()
      this.render(true)
      this.skipMode = false
    } else {
      this.player.advanceUntilStop()
      this.render(false)
    }
    if (this.player.state.decision !== null) {
      this.skipMode = false
    }
    if (this.skipMode) setTimeout(this.skipModeTick.bind(this), this.SKIP_DELAY)
  }

  public enterSkipMode(): void {
    this.disableAutoplay()
    if (this.skipMode) return
    if (!this.player.isNextCommandSeen() || this.player.state.decision !== null) return
    this.skipMode = true
    setTimeout(this.skipModeTick.bind(this), this.SKIP_DELAY)
  }

  public toggleAutoplay(): void {
    if (this.autoplayInterval) {
      this.disableAutoplay()
    } else {
      this.enableAutoplay()
    }
  }

  public enableAutoplay(): void {
    document.querySelector(".vn-action-auto")?.classList.add("vn-actionstate-enabled")
    this.autoplayInterval = window.setInterval(() => {
      this.advance()
    }, 7000)
    // TODO: less hacky with timeout based on text length
  }

  public disableAutoplay(): void {
    if (this.autoplayInterval) {
      document.querySelector(".vn-action-auto")?.classList.remove("vn-actionstate-enabled")
      window.clearInterval(this.autoplayInterval)
      this.autoplayInterval = null
    }
  }

  // A project renamed mid-session writes to the new key from here on. Nothing re-reads the old one
  // and nothing migrates: the slots already in memory land under the new key on the next save. That
  // is the crudest form of a project rename, and it is what design-docs/PROJECT_STORAGE.md's library
  // makes a real operation.
  public setSaveId(id: string): void {
    this.saveId = id
  }

  private persistGlobalSave(): void {
    saveToLocalStorage(this.saveId, this.player.getGlobalSaveData())
  }

  public getSaves(): VnSaveSlotData[] {
    return this.player.saves
  }

  // False once the author has made a direct jump in the editor, which lands somewhere no save path
  // can describe. The pause menu greys out Save rather than letting toShorthandPath throw.
  public canSave(): boolean {
    return !this.player.path.containsDirectJump()
  }

  public saveToSlot(slot: number): void {
    this.player.saveToSlot(slot)
    this.persistGlobalSave()
  }

  public loadFromSlot(slot: number): void {
    this.player.loadFromSlot(slot)
    this.render(false)
  }

  public deleteSave(slot: number): void {
    this.player.saves.splice(slot, 1)
  }

  public getCommittedState(): VnPlayerState | null {
    return this.committedState
  }

  // Scrolling down replays one step of already-seen story with no animations, scrolling up
  // undoes one step. A wheel gesture is not one event: mice send one notch (100px in pixel
  // mode, a few lines in line mode) but trackpads send a burst of small pixel deltas, so
  // pixel deltas are accumulated until they add up to about a notch.
  private handleScrollWheelEvent(e: WheelEvent) {
    if (this.isMenuOpen()) {
      // the menu owns the wheel while it is up - the save list scrolls. What the menu has no
      // use for is swallowed rather than passed on, so the page hosting the VN (the editor)
      // never scrolls out from under an open menu either.
      this.wheelDelta = 0
      if (!canScrollBy(e.target, this.menuDiv, e.deltaY)) e.preventDefault()
      return
    }
    e.preventDefault()

    const delta = normalizeWheelDelta(e)
    if (delta === 0) return
    // a change of direction starts a new gesture
    if (Math.sign(delta) !== Math.sign(this.wheelDelta)) this.wheelDelta = 0
    this.wheelDelta += delta
    if (Math.abs(this.wheelDelta) < WHEEL_STEP_THRESHOLD) return
    this.wheelDelta = 0

    // scrolling is a deliberate input - it takes over from skip/auto, like a click does
    this.skipMode = false
    this.disableAutoplay()

    if (delta > 0) {
      this.skipToNextStop()
    } else {
      this.undo()
    }
  }

  // One tick of what skip mode does: move to the next stop with the animations skipped, but
  // never past the end of what has already been seen - fast-forwarding into unread text is
  // what skip mode deliberately refuses to do.
  public skipToNextStop(): void {
    if (this.ignoreInputs) return
    if (this.player.state.decision !== null) return
    if (!this.player.isNextCommandSeen()) return
    this.consecutiveCommands = 0
    this.player.advanceUntilStop()
    this.render(false)

    this.persistGlobalSave()
  }

  public isMenuOpen(): boolean {
    return this.menuDiv.parentNode !== null
  }

  // Right click is the menu button, as in most visual novels: it opens the pause menu, and
  // backs out of whichever menu is open. The browser's own context menu is suppressed over the
  // game window either way - it has nothing to offer on top of the VN.
  private handleContextMenuEvent(e: MouseEvent) {
    // a long press fires this too, and a player tapping to advance holds a moment longer often
    // enough that the menu would come up unasked. Leave that gesture to the platform.
    const pointerType = e instanceof PointerEvent ? e.pointerType : this.lastPointerType
    if (pointerType === "touch") return

    e.preventDefault()
    if (this.isMenuOpen()) {
      this.closeMenu()
    } else {
      this.showMenu(pauseMenu)
    }
  }

  private handleKeyDownEvent(e: KeyboardEvent) {
    if (this.isMenuOpen()) return
    if (e.key === "PageUp") {
      e.preventDefault()
      this.undo()
    }
  }

  // Defaults to the player's own state, but a caller booting a story can pass it before the swap:
  // the assets to preload come from the story, not from whatever the player is holding.
  //
  // Resolves with the paths this state declares that could not be loaded. A file that is not there
  // yet is not a reason to refuse a story - declaring an asset before drawing it is the normal
  // authoring order - but it is invisible until the story reaches it and a sub-renderer throws on
  // the null, so the caller is told at load time instead. Scoped to what this state declares, since
  // the loaders keep every path they have ever been handed and an old typo is not this story's.
  public async loadAssets(state: VnPlayerState = this.player.state): Promise<string[]> {
    // Everything declared, whether or not the story reaches it - the manifest is the file index.
    // The paths come from the same functions the renderers resolve through, so what is preloaded
    // and what is asked for later cannot drift apart.
    const declared: string[] = []
    for (const actor in state.actors) {
      const sprites = state.actors[actor].sprites ?? {}
      for (const name in sprites) {
        declared.push(spriteFilePath(actor, sprites[name]))
        this.imageLoader.registerAsset(spriteFilePath(actor, sprites[name]))
      }
    }
    for (const id in state.backgrounds) {
      declared.push(backgroundFilePath(state.backgrounds[id]))
      this.imageLoader.registerAsset(backgroundFilePath(state.backgrounds[id]))
    }
    for (const id in state.audioAssets) {
      declared.push(audioFilePath(state.audioAssets[id].file))
      this.audioLoader.registerAsset(audioFilePath(state.audioAssets[id].file))
    }

    const [imagesFailed, audioFailed] = await Promise.all([this.imageLoader.loadAll(), this.audioLoader.loadAll()])
    const failed = new Set([...imagesFailed, ...audioFailed])
    return declared.filter((path) => failed.has(path))
  }
}

// util stuff ...

// About one mouse wheel notch: Chrome reports 100px per notch in pixel mode.
const WHEEL_STEP_THRESHOLD = 100

// Line- and page-mode wheels are discrete devices, so one of their events is one whole
// step regardless of the reported magnitude.
const normalizeWheelDelta = (e: WheelEvent): number => {
  if (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) return e.deltaY
  return Math.sign(e.deltaY) * WHEEL_STEP_THRESHOLD
}

// Whether anything between the wheel's target and the menu root can still scroll the way the
// wheel is pointing. Tells a gesture the menu will act on from one that would otherwise fall
// through to the page behind the VN.
const canScrollBy = (target: EventTarget | null, menuRoot: HTMLElement, deltaY: number): boolean => {
  let elem = target instanceof Element ? target : null
  while (elem !== null && menuRoot.contains(elem)) {
    if (scrollsInDirection(elem, deltaY)) return true
    elem = elem.parentElement
  }
  return false
}

const scrollsInDirection = (elem: Element, deltaY: number): boolean => {
  const overflowY = getComputedStyle(elem).overflowY
  if (overflowY !== "auto" && overflowY !== "scroll") return false
  // scrollTop is fractional under fractional zoom, so leave a pixel of slack at either end
  if (deltaY < 0) return elem.scrollTop > 1
  return elem.scrollTop < elem.scrollHeight - elem.clientHeight - 1
}

export type ResolvePromiseFn = (value?: void | PromiseLike<void>) => void

export const createResolvablePromise = (): [Promise<void>, ResolvePromiseFn] => {
  let resolveFn: ResolvePromiseFn | undefined = undefined
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve
  })

  if (resolveFn === undefined) {
    // just making typescript happy...
    throw Error("This shouldn't happen...")
  }

  return [promise, resolveFn]
}
export function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t
}
