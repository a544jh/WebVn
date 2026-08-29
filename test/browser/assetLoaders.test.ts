import { describe, expect, it } from "vitest"
import { AudioAssetLoaderSrc } from "../../src/assetLoaders/AudioAssetLoaderSrc"
import { ImageAssetLoaderSrc } from "../../src/assetLoaders/ImageAssetLoaderSrc"

// Declaring an asset before the file exists is the normal authoring order, so the loaders have to
// survive one. Before this, the audio loader resolved from a `canplaythrough` listener and
// registered no `error` one, so a missing file left its promise pending forever - and every later
// load with it, since registration is cumulative and loadAll re-walks every path it has ever seen.
// Nothing told the author anything: the manifest parsed clean, so there was no error marker either.

const MISSING_IMAGE = "/test-assets/assets/backgrounds/no-such-file.png"
const REAL_IMAGE = "/test-assets/assets/backgrounds/a.png"
const MISSING_AUDIO = "/test-assets/assets/audio/no-such-file.ogg"

describe("ImageAssetLoaderSrc", () => {
  it("reports a file that is not there instead of rejecting", async () => {
    const loader = new ImageAssetLoaderSrc()
    loader.registerAsset(MISSING_IMAGE)

    expect(await loader.loadAll()).toEqual([MISSING_IMAGE])
  })

  it("loads everything else in the same pass", async () => {
    const loader = new ImageAssetLoaderSrc()
    loader.registerAsset(MISSING_IMAGE)
    loader.registerAsset(REAL_IMAGE)

    expect(await loader.loadAll()).toEqual([MISSING_IMAGE])
    expect(loader.getAsset(REAL_IMAGE)).not.toBe(null)
  })

  it("keeps reporting a known failure without re-requesting it", async () => {
    const loader = new ImageAssetLoaderSrc()
    loader.registerAsset(MISSING_IMAGE)
    await loader.loadAll()

    expect(await loader.loadAll()).toEqual([MISSING_IMAGE])
  })

  it("does not drop an asset it has already loaded when it is registered again", async () => {
    const loader = new ImageAssetLoaderSrc()
    loader.registerAsset(REAL_IMAGE)
    await loader.loadAll()
    const loaded = loader.getAsset(REAL_IMAGE)

    loader.registerAsset(REAL_IMAGE)

    expect(loader.getAsset(REAL_IMAGE)).not.toBe(null)
    expect(loaded).not.toBe(null)
  })
})

describe("AudioAssetLoaderSrc", () => {
  it("settles on a file that is not there rather than hanging forever", async () => {
    const loader = new AudioAssetLoaderSrc()
    loader.registerAsset(MISSING_AUDIO)

    expect(await loader.loadAll()).toEqual([MISSING_AUDIO])
  })

  it("keeps reporting a known failure without re-requesting it", async () => {
    const loader = new AudioAssetLoaderSrc()
    loader.registerAsset(MISSING_AUDIO)
    await loader.loadAll()

    expect(await loader.loadAll()).toEqual([MISSING_AUDIO])
  })
})
