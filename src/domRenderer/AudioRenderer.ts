import { AssetLoader } from "../assetLoaders/AssetLoader"
import { undeclaredMessage } from "../core/manifest"
import { AudioAsset, AudioState } from "../core/state"
import { audioAssetPath } from "./assetPaths"
import { createResolvablePromise, DomRenderer, lerp } from "./DomRenderer"

export class AudioRenderer {
  private bgmElem: HTMLAudioElement | null

  // Every element this renderer has started and not seen end. **The only handle on them there is**:
  // the loaders hand out detached `<audio>` clones, which play perfectly well without ever being in
  // the document, so nothing about putting the vn's DOM away stops one. A closed project whose music
  // is still going is the symptom.
  private playing = new Set<HTMLAudioElement>()

  // Set once the session is over. Both fades below are self-rescheduling `setTimeout` chains, and
  // one still running after teardown would be working the volume of a track nobody owns.
  private stopped = false

  constructor(private renderer: DomRenderer, private assetLoader: AssetLoader<HTMLAudioElement>) {
    this.bgmElem = null
  }

  // Silence, immediately and without a fade: a graceful fade-out of a project the author has already
  // left is a second and a half of a story that is gone.
  public teardown(): void {
    this.stopped = true
    for (const elem of this.playing) elem.pause()
    this.playing.clear()
    this.bgmElem = null
  }

  // `state.bgm` and `state.sfx` are asset ids after the manifest became a symbol table, so the
  // declarations have to come with them: they are what says which file an id is.
  public async render(state: AudioState, assets: Record<string, AudioAsset>): Promise<void> {
    const prev = this.renderer.getCommittedState()?.animatableState.audio

    if (state.sfx !== null) {
      const newAudio = this.assetLoader.getAsset(pathOf(assets, state.sfx))
      if (!newAudio) throw new Error("Could not play audio " + state.sfx)
      this.started(newAudio)
      newAudio.play()
    }

    if (this.bgmElem != null && state.bgm === null) {
      // stop audio
      this.fadeOut(this.bgmElem)
      this.bgmElem = null
    } else if (state.bgm !== null && (state.bgm !== prev?.bgm || this.bgmElem === null)) {
      // play audio
      const newAudio = this.assetLoader.getAsset(pathOf(assets, state.bgm))
      if (!newAudio) throw new Error("Could not play audio " + state.bgm)

      let fadingOutOld = false
      if (this.bgmElem !== null) {
        fadingOutOld = true
        this.fadeOut(this.bgmElem).then(() => {
          if (this.bgmElem !== null) this.fadeIn(this.bgmElem)
        })
      }

      this.bgmElem = newAudio
      this.bgmElem.addEventListener("ended", () => {
        this.bgmElem = null
      })

      this.bgmElem.loop = state.loopBgm
      if (!fadingOutOld) {
        this.fadeIn(this.bgmElem)
      }
    } else if (state.bgm !== null && this.bgmElem !== null && state.loopBgm !== prev?.loopBgm) {
      // change loop flag
      this.bgmElem.loop = state.loopBgm
    }
  }

  // Remembered until it ends of its own accord, so `teardown` has something to pause. A one-shot
  // sfx takes itself off the list; a looping track never will, which is exactly the case that
  // matters.
  private started(elem: HTMLAudioElement): void {
    this.playing.add(elem)
    elem.addEventListener("ended", () => this.playing.delete(elem))
  }

  private fadeOut(elem: HTMLAudioElement): Promise<void> {
    elem.dataset.cancelFadeIn = "true"
    const fadeTime = 1500
    const startVol = elem.volume
    const step = 20
    let curTime = 0
    const [promise, resolve] = createResolvablePromise()
    const fadeVol = () => {
      let completion = curTime / fadeTime
      if (completion > 1) completion = 1
      const newVol = lerp(startVol, 0, completion)
      elem.volume = newVol
      if (completion < 1 && !this.stopped) {
        curTime += step
        setTimeout(fadeVol, step)
      } else {
        elem.pause()
        this.playing.delete(elem)
        // Resolved even when the session went away under it, so the swap that awaits this does not
        // leave a promise pending forever. What it goes on to do is `fadeIn`, which checks the same
        // flag and does nothing.
        resolve()
      }
    }
    setTimeout(fadeVol, step)
    return promise
  }

  private fadeIn(elem: HTMLAudioElement) {
    if (this.stopped) return
    elem.volume = 0
    this.started(elem)
    elem.play()
    const fadeTime = 1500
    const endVol = 1 // TODO: might want to set to global bgm vol setting when implemented..
    const step = 20
    let curTime = 0
    const fadeVol = () => {
      let completion = curTime / fadeTime
      if (completion > 1) completion = 1
      const newVol = lerp(0, endVol, completion)
      elem.volume = newVol
      if (completion < 1 && elem.dataset.cancelFadeIn !== "true" && !this.stopped) {
        curTime += step
        setTimeout(fadeVol, step)
      }
    }
    setTimeout(fadeVol, step)
  }
}

// Reading an id the manifest never declared is the manifest and the script disagreeing, which is a
// different failure from a declared asset that would not load - hence a different message.
function pathOf(assets: Record<string, AudioAsset>, id: string): string {
  const path = audioAssetPath(assets, id)
  if (path === undefined) throw new Error(undeclaredMessage({ kind: "audio", id }))
  return path
}
