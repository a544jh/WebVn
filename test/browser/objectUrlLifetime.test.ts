import { describe, expect, it } from "vitest"
import { AssetResolver } from "../../src/assetLoaders/AssetResolver"
import { ImageAssetLoaderSrc } from "../../src/assetLoaders/ImageAssetLoaderSrc"

// What a `cloneNode()` needs from an object URL, pinned before anything mints one.
// design-docs/PROJECT_STORAGE.md, "Load-bearing details": object URLs must survive until story
// teardown.
//
// Both loaders hand out copies rather than the element they hold, and a clone copies `src` and re-runs
// the load against it. While the URL still resolves that costs nothing whatever the scheme - the
// browser serves the clone out of its decoded-image cache, so it comes back already `complete`, which
// is why nobody has had to think about this. A `blob:` URL is different only in how it can *stop*
// resolving: it is a handle into a table the page owns, and once it is revoked there is nothing
// behind it. The clone then fails to load, `SpriteRenderer.createSpriteElem`'s `if (!elem)` does not
// catch it because `getAsset` did return an element - just an empty one - and a sprite renders as a
// blank box with nothing thrown and nothing logged.
//
// This is what backs `AssetResolver` having no `release` method, and revocation belonging to the
// loader if eviction ever needs it. That decision is only safe while the consequence of getting it
// wrong is written down somewhere executable.
//
// Images only. The rule is the same for both loaders and one loader can carry it: an audio clone
// does copy `src`, but a failed load surfaces as an `error` event and a non-null `.error` rather
// than a rejected promise, and how much of a media file a browser fetches before firing anything is
// not predictable enough to assert on without timing luck. A flaky test pinning this would be worse
// than the one below, because the thing it guards is already silent.

// The doubled segment is `test-assets/`, the served directory, plus `assets/` inside the project.
const IMAGE_FILE = "/test-assets/assets/backgrounds/a.png"
const LOGICAL_PATH = "assets/backgrounds/a.png"

// The resolver's whole job here: hand back a URL that can be revoked, the way OpfsAssetResolver
// does. The URL is kept so the test can revoke it at the moment it chooses.
class ObjectUrlResolver implements AssetResolver {
  public url = ""
  constructor(private blob: Blob) {}
  public resolve(): Promise<string> {
    this.url = URL.createObjectURL(this.blob)
    return Promise.resolve(this.url)
  }
}

const loadedFromObjectUrl = async (): Promise<{ loader: ImageAssetLoaderSrc; resolver: ObjectUrlResolver }> => {
  const blob = await (await fetch(IMAGE_FILE)).blob()
  const resolver = new ObjectUrlResolver(blob)
  const loader = new ImageAssetLoaderSrc(resolver)
  loader.registerAsset(LOGICAL_PATH)
  expect(await loader.loadAll()).toEqual([])
  return { loader, resolver }
}

// A clone reports a failed load as naturalWidth staying 0, and decode() rejecting. Asking for both
// is what keeps this from passing on a clone that has simply not finished yet.
const clonePaints = async (elem: HTMLImageElement | null | undefined): Promise<boolean> => {
  if (elem === null || elem === undefined) throw new Error("getAsset handed back nothing at all")
  try {
    await elem.decode()
  } catch (e) {
    return false
  }
  return elem.naturalWidth > 0
}

describe("object URL lifetime", () => {
  it("paints every clone taken while the URL is live", async () => {
    // The behaviour the OPFS resolver depends on, and the one a future eviction change must not
    // break: getAsset is called once per render, so a story's tenth frame clones as happily as its
    // first.
    const { loader, resolver } = await loadedFromObjectUrl()

    expect(await clonePaints(loader.getAsset(LOGICAL_PATH))).toBe(true)
    expect(await clonePaints(loader.getAsset(LOGICAL_PATH))).toBe(true)
    expect(await clonePaints(loader.getAsset(LOGICAL_PATH))).toBe(true)

    URL.revokeObjectURL(resolver.url)
  })

  it("hands back a clone that silently never loads once the URL is revoked", async () => {
    // Asserting that a broken thing is broken, which is unusual and is the point: this is what a
    // "revoke on load, we have already decoded it" change trips over, and that change is otherwise
    // entirely reasonable-looking. Note the failure is silent - getAsset still returns an element.
    const { loader, resolver } = await loadedFromObjectUrl()
    expect(await clonePaints(loader.getAsset(LOGICAL_PATH))).toBe(true)

    URL.revokeObjectURL(resolver.url)

    expect(await clonePaints(loader.getAsset(LOGICAL_PATH))).toBe(false)
  })
})
