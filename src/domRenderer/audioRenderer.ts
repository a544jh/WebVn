import { AssetLoader } from "../assetLoaders/AssetLoader"
import { AudioState } from "../core/state"
import { DomRenderer } from "./DomRenderer"

export class AudioRenderer {
  private bgmElem: HTMLAudioElement | null

  constructor(private renderer: DomRenderer, private assetLoader: AssetLoader<HTMLAudioElement>) {
    this.bgmElem = null
  }

  public async render(state: AudioState): Promise<void> {
    const prev = this.renderer.getCommittedState()?.animatableState.audio
    // TODO sfx

    if (this.bgmElem != null && state.bgm === null) {
      // stop audio
      this.bgmElem.pause()
      this.bgmElem = null
    } else if (state.bgm !== null && (state.bgm !== prev?.bgm || this.bgmElem === null)) {
      // play audio
      this.bgmElem?.pause()
      const newAudio = this.assetLoader.getAsset("audio/" + state.bgm)
      if (!newAudio) throw new Error("Could not play audio " + state.bgm)
      this.bgmElem = newAudio
      this.bgmElem.addEventListener("ended", () => {
        this.bgmElem = null
      })
      this.bgmElem.loop = state.loopBgm
      this.bgmElem.play()
    } else if (state.bgm !== null && this.bgmElem !== null && state.loopBgm !== prev?.loopBgm) {
      // change loop flag
      this.bgmElem.loop = state.loopBgm
    }
  }
}
