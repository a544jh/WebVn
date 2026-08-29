import { describe, expect, it } from "vitest"
import { AudioAssetLoaderSrc } from "../../src/assetLoaders/AudioAssetLoaderSrc"
import { ImageAssetLoaderSrc } from "../../src/assetLoaders/ImageAssetLoaderSrc"
import { AssetResolver } from "../../src/assetLoaders/AssetResolver"

// Declaring an asset before the file exists is the normal authoring order, so the loaders have to
// survive one. Before this, the audio loader resolved from a `canplaythrough` listener and
// registered no `error` one, so a missing file left its promise pending forever - and every later
// load with it, since registration is cumulative and loadAll re-walks every path it has ever seen.
// Nothing told the author anything: the manifest parsed clean, so there was no error marker either.

const MISSING_IMAGE = "/test-assets/assets/backgrounds/no-such-file.png"
const REAL_IMAGE = "/test-assets/assets/backgrounds/a.png"
const MISSING_AUDIO = "/test-assets/assets/audio/no-such-file.ogg"
const REAL_AUDIO = "/test-assets/assets/audio/sfx/bigthump.ogg"

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

// The AssetResolver seam: a path is the loader's key, and the resolver is what turns it into
// something an element can load. These are the tests that fail if someone inlines the path back
// into `img.src`, which is the whole reason a no-op refactor gets tests at all.

// A 1x1 transparent gif, so the resolver's output can be nothing like its input.
const DATA_URL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

const LOGICAL_PATH = "assets/backgrounds/somewhere-else.png"

class StubResolver implements AssetResolver {
  public resolved: string[] = []
  constructor(private urls: Record<string, string>) {}
  public resolve(path: string): Promise<string> {
    this.resolved.push(path)
    const url = this.urls[path]
    return url === undefined ? Promise.reject(new Error("not in the store: " + path)) : Promise.resolve(url)
  }
}

describe("AssetResolver", () => {
  it("loads an image through whatever URL the resolver hands back", async () => {
    const loader = new ImageAssetLoaderSrc(new StubResolver({ [LOGICAL_PATH]: DATA_URL }))
    loader.registerAsset(LOGICAL_PATH)

    expect(await loader.loadAll()).toEqual([])
    expect(loader.getAsset(LOGICAL_PATH)).not.toBe(null)
  })

  it("keys the loaded asset by the logical path, not by the URL it resolved to", async () => {
    const loader = new ImageAssetLoaderSrc(new StubResolver({ [LOGICAL_PATH]: DATA_URL }))
    loader.registerAsset(LOGICAL_PATH)
    await loader.loadAll()

    // The three render-time call sites ask by path, so a resolver whose output differs from its
    // input must not change what the caller looks up.
    expect(loader.getAsset(LOGICAL_PATH)).not.toBe(null)
    expect(loader.getAsset(DATA_URL)).toBe(undefined)
  })

  it("reports a path the resolver rejects, the same way a missing file is reported", async () => {
    const loader = new ImageAssetLoaderSrc(new StubResolver({}))
    loader.registerAsset(LOGICAL_PATH)

    expect(await loader.loadAll()).toEqual([LOGICAL_PATH])
  })

  it("does not re-resolve an asset it has already loaded", async () => {
    // What makes consulting the resolver inside loadAsset affordable: registration is cumulative
    // and re-runs on every adopt-on-blur, so re-resolving would be N reads and N fresh object URLs
    // per keystroke pause once the resolver is reading out of OPFS.
    const resolver = new StubResolver({ [LOGICAL_PATH]: DATA_URL })
    const loader = new ImageAssetLoaderSrc(resolver)
    loader.registerAsset(LOGICAL_PATH)
    await loader.loadAll()
    await loader.loadAll()

    expect(resolver.resolved).toEqual([LOGICAL_PATH])
  })

  it("loads audio through the resolver too", async () => {
    const url = new URL(REAL_AUDIO, location.href).href
    const resolver = new StubResolver({ [LOGICAL_PATH]: url })
    const loader = new AudioAssetLoaderSrc(resolver)
    loader.registerAsset(LOGICAL_PATH)

    expect(await loader.loadAll()).toEqual([])
    expect(loader.getAsset(LOGICAL_PATH)).not.toBe(null)
  })
})
