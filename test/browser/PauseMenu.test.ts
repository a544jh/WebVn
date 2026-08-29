import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DomRenderer } from "../../src/domRenderer/DomRenderer"
import { audioFilePath } from "../../src/domRenderer/assetPaths"
import { pauseMenu } from "../../src/domRenderer/menus/PauseMenu"
import { VnManifest } from "../../src/core/manifest"
import { advanceVn, startVn, StartedVn } from "../helpers/vnHarness"

// The now-playing line: what the manifest's audio metadata exists for. The bgm in the committed
// state is an asset id, and seedState copied the declarations into the state beside it, so the
// menu has both halves without holding a manifest reference at render time.

const MANIFEST: VnManifest = {
  id: "now-playing",
  title: "Now Playing",
  actors: {},
  backgrounds: {},
  audioAssets: {
    daylight: { file: "bgm/dayl_preview.ogg", title: "Daylight - 8bit remix", artist: "a544jh" },
    anon: { file: "bgm/anon.ogg", title: "Untitled Waltz" },
    bigthump: { file: "sfx/bigthump.ogg" },
  },
}

// Nothing plays at the first stop, so the test can put the demo's audio into the loader before the
// first `bgm` command asks for it.
const script = `
story:
  - Before any music
  - bgm: daylight
  - A credited track is playing
  - bgm: anon
  - A track with no artist is playing
  - bgm: bigthump
  - A track with no metadata at all is playing
  - bgm: stop
  - Silence
`

// The renderer's audio loader is keyed by the path DomRenderer.loadAssets would register, and
// nothing here is fetched: playback is stubbed out below.
const registerTestAudio = (renderer: DomRenderer): void => {
  const assets = renderer["audioLoader"]["assets"] as Record<string, HTMLAudioElement>
  for (const id in MANIFEST.audioAssets) {
    assets[audioFilePath(MANIFEST.audioAssets[id].file)] = new Audio()
  }
}

const openPauseMenu = (started: StartedVn): HTMLDivElement => {
  started.renderer.showMenu(pauseMenu)
  return started.root
}

// One line, title and artist together - there is no separate artist element to read.
const nowPlaying = (root: HTMLDivElement): string | null =>
  root.querySelector(".vn-now-playing-title")?.textContent ?? null

// Chromium's autoplay policy rejects play() without a user gesture, and AudioRenderer does not
// catch that.
const realPlay = HTMLMediaElement.prototype.play
beforeEach(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve()
})
afterEach(() => {
  HTMLMediaElement.prototype.play = realPlay
})

describe("the pause menu's now-playing line", () => {
  it("names the playing track and its artist on one line", async () => {
    const started = await startVn(script, { manifest: MANIFEST })
    registerTestAudio(started.renderer)
    await advanceVn(started)

    expect(nowPlaying(openPauseMenu(started))).toBe("Now playing: Daylight - 8bit remix by a544jh")
  })

  it("drops the credit when nothing is credited", async () => {
    const started = await startVn(script, { manifest: MANIFEST })
    registerTestAudio(started.renderer)
    await advanceVn(started)
    await advanceVn(started)

    expect(nowPlaying(openPauseMenu(started))).toBe("Now playing: Untitled Waltz")
  })

  // An id is a name for the author, not for the player, so a track declared with no metadata has
  // nothing worth showing.
  it("shows nothing for a track with no title, rather than its id", async () => {
    const started = await startVn(script, { manifest: MANIFEST })
    registerTestAudio(started.renderer)
    for (let i = 0; i < 3; i++) await advanceVn(started)

    expect(nowPlaying(openPauseMenu(started))).toBe(null)
  })

  it("shows nothing once the music has stopped", async () => {
    const started = await startVn(script, { manifest: MANIFEST })
    registerTestAudio(started.renderer)
    for (let i = 0; i < 4; i++) await advanceVn(started)

    expect(nowPlaying(openPauseMenu(started))).toBe(null)
  })

  it("leaves the menu's own items alone", async () => {
    const started = await startVn(script, { manifest: MANIFEST })
    registerTestAudio(started.renderer)
    await advanceVn(started)
    const root = openPauseMenu(started)

    expect([...root.querySelectorAll(".vn-pause-menu-item")].map((e) => e.textContent)).toEqual([
      "Return",
      "Save",
      "Load",
    ])
  })
})
