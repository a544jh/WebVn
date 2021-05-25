import { AssetLoader } from "../assetLoaders/AssetLoader"
import { AudioState } from "../core/state"
import { createResolvablePromise, DomRenderer, lerp } from "./DomRenderer"

export class AudioRenderer {
  private bgmElem: HTMLAudioElement | null

  constructor(private renderer: DomRenderer, private assetLoader: AssetLoader<HTMLAudioElement>) {
    this.bgmElem = null
  }

  public async render(state: AudioState): Promise<void> {
    const prev = this.renderer.getCommittedState()?.animatableState.audio

    if (state.sfx !== null) {
      const newAudio = this.assetLoader.getAsset("audio/" + state.sfx)
      if (!newAudio) throw new Error("Could not play audio " + state.sfx)
      newAudio.play()
    }

    if (this.bgmElem != null && state.bgm === null) {
      // stop audio
      this.fadeOut(this.bgmElem)
      this.bgmElem = null
    } else if (state.bgm !== null && (state.bgm !== prev?.bgm || this.bgmElem === null)) {
      // play audio
      const newAudio = this.assetLoader.getAsset("audio/" + state.bgm)
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
      if (completion < 1) {
        curTime += step
        setTimeout(fadeVol, step)
      } else {
        elem.pause()
        resolve()
      }
    }
    setTimeout(fadeVol, step)
    return promise
  }

  private fadeIn(elem: HTMLAudioElement) {
    elem.volume = 0
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
      if (completion < 1 && elem.dataset.cancelFadeIn !== "true") {
        curTime += step
        setTimeout(fadeVol, step)
      }
    }
    setTimeout(fadeVol, step)
  }
}
